"""Accès aux modèles de langage : Ollama (open source, local) et Gemini (API en ligne).
Les deux sont appelés avec le même format « chat completions » compatible OpenAI, appels d'outils compris.
En mode « auto », le copilote essaie le fournisseur principal puis bascule sur l'autre en cas d'échec."""
import json
import re
import time
from typing import Optional

import requests

from app.core.config import settings


class ErreurLLM(Exception):
    pass


def _fournisseurs() -> list:
    """Ordre d'essai des fournisseurs selon la configuration."""
    gemini_dispo = bool(settings.GEMINI_API_KEY)
    choix = settings.COPILOTE_FOURNISSEUR
    if choix == "gemini":
        return ["gemini", "ollama"] if gemini_dispo else ["ollama"]
    if choix == "ollama":
        return ["ollama", "gemini"] if gemini_dispo else ["ollama"]
    return ["gemini", "ollama"] if gemini_dispo else ["ollama"]   # auto : le plus rapide d'abord


def _configs(fournisseur: str, modele_local: Optional[str] = None) -> list:
    """Une ou plusieurs configurations à essayer pour un fournisseur (GEMINI_MODEL peut lister plusieurs modèles)."""
    if fournisseur == "gemini":
        return [{"url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                 "modele": m.strip(), "entetes": {"Authorization": f"Bearer {settings.GEMINI_API_KEY}"}, "delai": 60}
                for m in settings.GEMINI_MODEL.split(",") if m.strip()]
    return [{"url": settings.OLLAMA_URL.rstrip("/") + "/v1/chat/completions", "modele": modele_local or settings.COPILOTE_MODELE_LOCAL,
             "entetes": {}, "delai": settings.COPILOTE_DELAI_LOCAL}]


def _outils_dans_texte(contenu: str) -> list:
    """Certains petits modèles écrivent l'appel d'outil dans le texte au lieu du champ prévu : on le récupère."""
    appels = []
    for bloc in re.findall(r"\{[^{}]*\"name\"\s*:\s*\"[a-z_]+\"[^{}]*(?:\{[^{}]*\}[^{}]*)?\}", contenu or ""):
        try:
            d = json.loads(bloc)
            appels.append({"id": f"texte_{len(appels)}", "type": "function",
                           "function": {"name": d["name"], "arguments": json.dumps(d.get("arguments") or d.get("parameters") or {})}})
        except (json.JSONDecodeError, KeyError):
            continue
    return appels


def discuter(messages: list, outils: Optional[list] = None, prefere: Optional[str] = None,
             modele_local: Optional[str] = None, json_attendu: bool = False) -> dict:
    """Envoie la conversation au modèle. Renvoie {contenu, appels_outils, fournisseur, modele, duree_ms}.
    modele_local : autre modèle Ollama (ex. un modèle qui lit les images) ; json_attendu : réponse au format JSON."""
    ordre = _fournisseurs()
    if prefere in ordre:
        ordre = [prefere] + [f for f in ordre if f != prefere]
    erreurs = []
    for fournisseur, cfg in [(f, c) for f in ordre for c in _configs(f, modele_local)]:
        corps = {"model": cfg["modele"], "messages": messages, "temperature": 0.1}
        if json_attendu:
            corps["response_format"] = {"type": "json_object"}
        if outils:
            corps["tools"] = outils
        debut = time.time()
        try:
            for tentative in range(3):
                r = requests.post(cfg["url"], json=corps, headers=cfg["entetes"], timeout=cfg["delai"])
                if r.status_code == 400 and "response_format" in corps:
                    corps.pop("response_format")       # format JSON non accepté par ce modèle : on redemande sans
                    continue
                if r.status_code not in (429, 503) or tentative == 2:
                    break
                # quota par minute dépassé ou service surchargé : on attend un peu puis on réessaie
                attente = r.headers.get("retry-after", "")
                time.sleep(min(int(attente) if attente.isdigit() else 8 * (tentative + 1), 30))
            if r.status_code != 200:
                raise ErreurLLM(f"{fournisseur} a répondu {r.status_code} : {r.text[:200]}")
            choix = r.json()["choices"][0]["message"]
        except (requests.RequestException, KeyError, IndexError, ValueError, ErreurLLM) as e:
            erreurs.append(f"{fournisseur} : {str(e)[:200]}")
            continue
        appels = choix.get("tool_calls") or []
        contenu = choix.get("content") or ""
        if not appels and outils:
            appels = _outils_dans_texte(contenu)
            if appels:
                contenu = ""
        return {"contenu": contenu, "appels_outils": appels, "fournisseur": fournisseur,
                "modele": cfg["modele"], "duree_ms": int((time.time() - debut) * 1000)}
    raise ErreurLLM("Aucun modèle d'IA disponible. " + " | ".join(erreurs))


def vecteurs(textes: list) -> Optional[list]:
    """Embeddings locaux avec Ollama (modèle nomic-embed-text). Renvoie None si le modèle n'est pas installé."""
    if not textes:
        return []
    try:
        r = requests.post(settings.OLLAMA_URL.rstrip("/") + "/api/embed",
                          json={"model": settings.COPILOTE_MODELE_EMBEDDINGS, "input": textes}, timeout=120)
        if r.status_code != 200:
            return None
        return r.json().get("embeddings")
    except requests.RequestException:
        return None


def statut() -> dict:
    """État des fournisseurs, pour la page du copilote."""
    modeles_locaux = []
    try:
        r = requests.get(settings.OLLAMA_URL.rstrip("/") + "/api/tags", timeout=3)
        modeles_locaux = [m["name"] for m in r.json().get("models", [])]
    except (requests.RequestException, ValueError):
        pass
    return {
        "ordre": _fournisseurs(),
        "ollama_disponible": bool(modeles_locaux),
        "modele_local": settings.COPILOTE_MODELE_LOCAL,
        "modele_local_installe": any(m.startswith(settings.COPILOTE_MODELE_LOCAL) for m in modeles_locaux),
        "embeddings_installes": any(m.startswith(settings.COPILOTE_MODELE_EMBEDDINGS) for m in modeles_locaux),
        "gemini_configure": bool(settings.GEMINI_API_KEY),
        "modele_en_ligne": settings.GEMINI_MODEL.split(",")[0].strip(),
    }
