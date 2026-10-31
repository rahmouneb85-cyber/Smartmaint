"""Extraction des informations d'un bon d'intervention.
1. Modèle de vision (Gemini, puis modèle local open source qui lit les images) : lit directement la photo ou le scan.
2. Si aucun modèle n'est disponible : lecture des étiquettes du document (« Équipement : ... ») dans le texte.
Le résultat est toujours vérifié ensuite par les contrôles d'incohérence avant toute création."""
import base64
import json
import re
from datetime import datetime
from typing import Optional

from app.copilote import llm
from app.copilote.recherche import normaliser
from app.core.config import settings

CHAMPS = ["equipement", "technicien", "type_intervention", "priorite", "date_debut", "date_fin", "duree_minutes",
          "alerte_id", "description", "diagnostic", "actions_realisees", "pieces_remplacees", "observations"]

CONSIGNE = """Tu lis un bon d'intervention de maintenance industrielle (photo, scan ou fichier).
Réponds UNIQUEMENT avec un objet JSON contenant exactement ces clés :
- "equipement" : nom ou code de l'équipement, recopié tel qu'il est écrit
- "technicien" : nom de l'intervenant
- "type_intervention" : "corrective" ou "preventive"
- "priorite" : "basse", "normale", "haute" ou "urgente"
- "date_debut" et "date_fin" : au format "AAAA-MM-JJ HH:MM"
- "duree_minutes" : durée écrite sur le bon, en minutes (nombre)
- "alerte_id" : numéro d'alerte s'il est indiqué (nombre)
- "description", "diagnostic", "actions_realisees", "pieces_remplacees", "observations" : textes recopiés
- "confiance" : objet qui donne pour chaque clé ci-dessus un nombre entre 0 et 1 (1 = lecture certaine)
- "texte_lu" : transcription complète du document
Mets null pour un champ absent ou illisible. N'invente jamais une information qui n'est pas sur le document."""


# ─────────────────────────────────────────────────────────────
# DATES
# ─────────────────────────────────────────────────────────────
def lire_date(valeur) -> Optional[datetime]:
    """Comprend 14/10/2026 08:30, 14-10-26 à 8h30, 2026-10-14T08:30, 14.10.2026..."""
    if valeur in (None, ""):
        return None
    if isinstance(valeur, datetime):
        return valeur
    s = normaliser(str(valeur)).replace(" a ", " ").replace("t", " ", 1) if re.match(r"\d{4}-\d{2}-\d{2}t", normaliser(str(valeur))) \
        else normaliser(str(valeur)).replace(" a ", " ")
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        a, mo, j = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.search(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})", s)
        if not m:
            return None
        j, mo, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        a += 2000 if a < 100 else 0
    reste = s[m.end():]
    h = re.search(r"(\d{1,2})\s*[h:]\s*(\d{2})?", reste)
    heure, minute = (int(h.group(1)), int(h.group(2) or 0)) if h else (0, 0)
    try:
        return datetime(a, mo, j, heure, minute)
    except ValueError:
        return None


# ─────────────────────────────────────────────────────────────
# LECTURE PAR LE MODÈLE (vision ou texte)
# ─────────────────────────────────────────────────────────────
def _json_dans(texte: str) -> dict:
    texte = (texte or "").strip()
    texte = re.sub(r"^```(?:json)?|```$", "", texte, flags=re.M).strip()
    try:
        return json.loads(texte)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", texte, re.S)
        if m:
            return json.loads(m.group(0))
        raise


def par_modele(texte: str, images: list) -> dict:
    """Lecture par un modèle de langage. Lève llm.ErreurLLM si aucun modèle n'est disponible."""
    contenu = [{"type": "text", "text": CONSIGNE + ("\n\nTexte extrait du fichier :\n" + texte[:15000] if texte else "")}]
    for png in images[:3]:
        contenu.append({"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(png).decode()}})
    messages = [{"role": "user", "content": contenu}]
    # avec des images, le modèle local doit savoir lire les images (gemma3 par défaut)
    r = llm.discuter(messages, None, modele_local=settings.IDP_MODELE_VISION_LOCAL if images else None, json_attendu=True)
    try:
        d = _json_dans(r["contenu"])
    except (json.JSONDecodeError, ValueError):
        raise llm.ErreurLLM(f"Réponse illisible du modèle {r['modele']}") from None
    confiance = d.get("confiance") if isinstance(d.get("confiance"), dict) else {}
    champs = {k: d.get(k) for k in CHAMPS}
    return {"champs": champs, "confiance": {k: float(confiance.get(k, 0.9 if champs[k] not in (None, "") else 0)) for k in CHAMPS},
            "texte_lu": d.get("texte_lu") or texte, "methode": f"{r['fournisseur']} ({r['modele']})", "duree_ms": r["duree_ms"]}


# ─────────────────────────────────────────────────────────────
# LECTURE PAR LES ÉTIQUETTES (sans modèle)
# ─────────────────────────────────────────────────────────────
ETIQUETTES = {
    "equipement": r"(?:equipement|machine|materiel|installation)",
    "technicien": r"(?:technicien|intervenant|realise par|effectue par)",
    "type_intervention": r"(?:type d'intervention|type)",
    "priorite": r"(?:priorite|urgence)",
    "date_debut": r"(?:date de debut|debut|date)",
    "date_fin": r"(?:date de fin|fin)",
    "duree_minutes": r"(?:duree)",
    "alerte_id": r"(?:alerte|n° d'alerte|numero d'alerte)",
    "description": r"(?:description|panne constatee|motif|demande)",
    "diagnostic": r"(?:diagnostic|cause)",
    "actions_realisees": r"(?:actions? realisees?|travaux realises|travaux effectues|travaux)",
    "pieces_remplacees": r"(?:pieces? remplacees?|pieces? changees?|pieces?)",
    "observations": r"(?:observations?|remarques?|commentaires?)",
}


def par_etiquettes(texte: str) -> dict:
    """Retrouve les champs d'un bon structuré « Étiquette : valeur ». Fonctionne sans aucun modèle."""
    champs = {k: None for k in CHAMPS}
    lignes = [x.strip() for x in (texte or "").splitlines() if x.strip()]
    for ligne in lignes:
        n = normaliser(ligne)
        for cle, motif in ETIQUETTES.items():
            m = re.match(rf"^{motif}\s*(?:\(.*?\))?\s*[:\-–]\s*(.+)$", n)
            if m and champs[cle] is None:
                debut = len(ligne) - len(m.group(1))            # on garde la casse et les accents d'origine
                champs[cle] = ligne[debut:].strip() if len(ligne) == len(n) else m.group(1).strip()
                break
    if champs["alerte_id"]:
        m = re.search(r"\d+", champs["alerte_id"])
        champs["alerte_id"] = int(m.group(0)) if m else None
    if champs["duree_minutes"]:
        d = normaliser(champs["duree_minutes"])
        h = re.search(r"(\d+)\s*h\s*(\d+)?", d)
        mn = re.search(r"(\d+)\s*(?:min|mn)", d)
        champs["duree_minutes"] = int(h.group(1)) * 60 + int(h.group(2) or 0) if h else (int(mn.group(1)) if mn else None)
    confiance = {k: (0.7 if v not in (None, "") else 0) for k, v in champs.items()}
    return {"champs": champs, "confiance": confiance, "texte_lu": texte, "methode": "lecture des étiquettes", "duree_ms": 0}


def extraire_bon(lecture: dict) -> dict:
    """Essaie le modèle (vision ou texte), puis les étiquettes. Renvoie aussi les erreurs rencontrées."""
    texte, images = lecture.get("texte") or "", lecture.get("images") or []
    remarques = []
    try:
        return {**par_modele(texte, images), "remarques": remarques}
    except llm.ErreurLLM as e:
        remarques.append(f"Lecture par modèle impossible : {str(e)[:200]}")
    if images and not texte.strip():
        from app.idp.lecture import ocr_local
        texte = ocr_local(images)
        if not texte:
            remarques.append("Aucun lecteur local d'images installé : pour lire un scan sans connexion, installez rapidocr-onnxruntime")
    res = par_etiquettes(texte)
    res["remarques"] = remarques
    return res
