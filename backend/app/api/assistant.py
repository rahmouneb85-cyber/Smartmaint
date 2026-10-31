from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session
import requests
import json

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from app.models.alert import Alert
from app.models.intervention import Intervention

router = APIRouter(
    prefix="/assistant",
    tags=["Assistant IA"],
    dependencies=[Depends(get_current_user)]
)


class Message(BaseModel):
    role: str       # "user" ou "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    langue: str = "fr"          # langue de l'assistant (indépendante de la plateforme)
    page: str = "dashboard"     # page ouverte par l'utilisateur


LANGUES = {"fr": "français", "en": "anglais (English)", "ar": "arabe (العربية)"}

MENUS = {
    "fr": "Tableau de bord, Équipements, Capteurs, Interventions",
    "en": "Dashboard, Equipment, Sensors, Interventions",
    "ar": "لوحة التحكم، المعدات، المستشعرات، التدخلات",
}

# Guide court, uniquement pour la page ouverte (message système plus léger = réponse plus rapide)
GUIDES = {
    "dashboard": "Page Tableau de bord : 4 indicateurs, graphique des capteurs mis à jour toutes les 5 s, équipements et dernières alertes.",
    "equipements": "Page Équipements : boutons Ajouter, Modifier, Supprimer. Statuts : actif, maintenance, panne. Un équipement relié à des capteurs ne peut pas être supprimé.",
    "capteurs": "Page Capteurs : ajout d'un capteur (température °C, pression bar, vibration mm/s, courant A). Un capteur avec des mesures ne se supprime pas, il se désactive.",
    "interventions": "Page Interventions : bouton Nouvelle intervention. Planifiée, puis Démarrer (équipement en maintenance), puis Terminer (équipement actif).",
}

GENERAL = ("Alertes : sévérité faible, moyenne, haute ou critique selon l'écart au seuil ; "
           "les alertes haute et critique sont envoyées sur Telegram. "
           "Le menu latéral permet de changer de page, de langue et de thème.")

# Statuts et sévérités traduits par le backend : le modèle n'a plus qu'à les recopier
TRADUCTIONS = {
    "fr": {"actif": "actif", "maintenance": "en maintenance", "panne": "en panne",
           "planifiee": "planifiée", "en_cours": "en cours", "terminee": "terminée",
           "faible": "faible", "moyenne": "moyenne", "haute": "haute", "critique": "critique"},
    "en": {"actif": "active", "maintenance": "under maintenance", "panne": "out of order",
           "planifiee": "scheduled", "en_cours": "in progress", "terminee": "completed",
           "faible": "low", "moyenne": "medium", "haute": "high", "critique": "critical"},
    "ar": {"actif": "نشط", "maintenance": "في الصيانة", "panne": "معطّل",
           "planifiee": "مُجدولة", "en_cours": "قيد التنفيذ", "terminee": "مكتملة",
           "faible": "منخفضة", "moyenne": "متوسطة", "haute": "عالية", "critique": "حرجة"},
}


def valeur(x):
    """Renvoie la valeur texte d'un champ Enum ou d'un texte simple."""
    return getattr(x, "value", x)


def contexte_donnees(db: Session, code_langue: str) -> str:
    """Données actuelles, avec statuts et sévérités déjà traduits dans la langue de l'assistant."""
    tr = TRADUCTIONS.get(code_langue, TRADUCTIONS["fr"])

    def traduire(x):
        return tr.get(valeur(x), valeur(x))

    equipements = db.query(Equipment).all()
    noms = {e.id: e.nom for e in equipements}
    eq = "\n".join(f"- {e.nom} : {traduire(e.statut)}" for e in equipements) or "- aucun"

    nb_capteurs = db.query(Sensor).count()
    total = db.query(Alert).count()
    critiques = db.query(Alert).filter(Alert.severite == "critique").count()
    dernieres = db.query(Alert).order_by(Alert.created_at.desc()).limit(3).all()
    al = "\n".join(
        f"- {noms.get(a.equipement_id, '?')} : {a.type}, {traduire(a.severite)}, {a.created_at:%d/%m %H:%M}"
        for a in dernieres
    ) or "- aucune"

    en_cours = db.query(Intervention).filter(Intervention.statut != "terminee").limit(3).all()
    it = "\n".join(
        f"- {noms.get(i.equipement_id, '?')} : {i.description} ({traduire(i.statut)})"
        for i in en_cours
    ) or "- aucune"

    return (f"DONNÉES RÉELLES (à recopier sans rien changer) :\n"
            f"Équipements et leur statut :\n{eq}\n"
            f"Nombre de capteurs : {nb_capteurs}\n"
            f"Alertes : {total} au total, dont {critiques} critiques\n"
            f"3 dernières alertes :\n{al}\n"
            f"Interventions en cours :\n{it}")


@router.post("/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    langue = LANGUES.get(req.langue, "français")
    menus = MENUS.get(req.langue, MENUS["fr"])

    systeme = (
        # 1. PARTIE FIXE (Ollama la garde en cache)
        "Tu es l'Assistant IA de SmartMaint (supervision industrielle IoT et maintenance prédictive). "
        "Réponds de façon courte et claire, sans Markdown. N'invente jamais de données. "
        "Recopie les noms des équipements exactement comme ils sont écrits, sans les traduire ni les transcrire. "
        "Si la question sort de SmartMaint ou de la maintenance, dis poliment que tu es spécialisé.\n"
        + GENERAL
        # 2. PARTIE VARIABLE
        + f"\n{GUIDES.get(req.page, '')}\n"
        f"RÈGLE ABSOLUE : réponds uniquement en {langue}. "
        f"Noms des menus : {menus}.\n"
        + contexte_donnees(db, req.langue)
    )

    historique = [m.model_dump() for m in req.messages if m.role in ("user", "assistant")][-6:]

    def generer_ollama():
        """Moteur local (hors ligne) : Ollama."""
        try:
            with requests.post(
                f"{settings.OLLAMA_URL}/api/chat",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "messages": [{"role": "system", "content": systeme}] + historique,
                    "stream": True,
                    "keep_alive": "30m",
                    "options": {"temperature": 0.1, "num_ctx": 2048, "num_predict": 300},
                },
                stream=True,
                timeout=180,
            ) as r:
                r.raise_for_status()
                for ligne in r.iter_lines():
                    if not ligne:
                        continue
                    morceau = json.loads(ligne)
                    texte = morceau.get("message", {}).get("content", "")
                    if texte:
                        yield texte
                    if morceau.get("done"):
                        break
        except requests.exceptions.ConnectionError:
            yield "[[ERREUR:ollama_indisponible]]"
        except requests.exceptions.Timeout:
            yield "[[ERREUR:delai_depasse]]"
        except Exception:
            yield "[[ERREUR:erreur_modele]]"

    def generer_gemini():
        """Moteur en ligne : essaie plusieurs modèles Gemini, puis bascule sur Ollama si tous échouent."""
        # Gemini appelle le rôle de l'assistant « model » au lieu de « assistant »
        contenus = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
            for m in historique
        ]
        modeles = [m.strip() for m in settings.GEMINI_MODEL.split(",") if m.strip()]

        for modele in modeles:
            url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
                   f"{modele}:streamGenerateContent?alt=sse")
            try:
                with requests.post(
                    url,
                    headers={"x-goog-api-key": settings.GEMINI_API_KEY, "Content-Type": "application/json"},
                    json={
                        "systemInstruction": {"parts": [{"text": systeme}]},
                        "contents": contenus,
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
                    },
                    stream=True,
                    timeout=60,
                ) as r:
                    if r.status_code != 200:
                        # Modèle surchargé ou indisponible : on essaie le suivant
                        print(f"Gemini {modele} indisponible ({r.status_code}) -> modèle suivant")
                        continue
                    print(f"Réponse fournie par {modele}")
                    # Lecture des octets bruts, décodés nous-mêmes en UTF-8
                    for ligne_brute in r.iter_lines():
                        ligne = ligne_brute.decode("utf-8") if ligne_brute else ""
                        if not ligne.startswith("data:"):
                            continue
                        try:
                            donnees = json.loads(ligne[5:].strip())
                        except json.JSONDecodeError:
                            continue
                        for candidat in donnees.get("candidates", []):
                            for partie in candidat.get("content", {}).get("parts", []):
                                if partie.get("text"):
                                    yield partie["text"]
                    return   # réponse complète envoyée : on s'arrête là
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                # Pas d'Internet : inutile d'essayer les autres modèles Gemini
                print("Erreur Gemini :", e)
                break
            except Exception as e:
                print(f"Erreur Gemini {modele} :", e)
                continue

        # Tous les modèles Gemini ont échoué : bascule sur Ollama (hors ligne)
        print("-> Bascule automatique sur Ollama")
        yield from generer_ollama()

    # Choix du moteur selon le .env
    if settings.ASSISTANT_PROVIDER == "gemini" and settings.GEMINI_API_KEY:
        moteur = generer_gemini
    else:
        moteur = generer_ollama

    return StreamingResponse(moteur(), media_type="text/plain; charset=utf-8")
