"""Contrôles d'incohérence d'un bon d'intervention avant sa création.
Chaque contrôle renvoie un niveau : « erreur » (bloque la validation), « avertissement » (à vérifier) ou « ok »."""
import difflib
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.copilote import outils
from app.copilote.recherche import normaliser, mots
from app.idp.extraction import lire_date
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User

TYPES = {"corrective", "preventive"}
PRIORITES = {"basse", "normale", "haute", "urgente"}
LIBELLES = {"equipement": "Équipement", "technicien": "Technicien", "type_intervention": "Type", "priorite": "Priorité",
            "date_debut": "Début", "date_fin": "Fin", "duree_minutes": "Durée", "alerte_id": "Alerte",
            "description": "Description", "diagnostic": "Diagnostic", "actions_realisees": "Actions réalisées",
            "pieces_remplacees": "Pièces remplacées", "observations": "Observations"}


def _val(x):
    return getattr(x, "value", x)


def trouver_technicien(db: Session, texte):
    """Retrouve un technicien à partir d'un nom approximatif (« Y. Alami », « youssef »)."""
    techs = db.query(User).filter(User.role == "technicien").all()
    if not texte:
        return None, []
    if str(texte).isdigit():
        t = next((u for u in techs if u.id == int(texte)), None)
        if t:
            return t, []
    cible = set(mots(str(texte)))
    meilleur = max(techs, key=lambda u: len(cible & set(mots(u.nom))), default=None)
    if meilleur and cible & set(mots(meilleur.nom)):
        return meilleur, []
    proches = difflib.get_close_matches(normaliser(str(texte)), [normaliser(u.nom) for u in techs], n=1, cutoff=0.6)
    if proches:
        return next(u for u in techs if normaliser(u.nom) == proches[0]), []
    return None, [u.nom for u in techs]


def normaliser_type(v):
    n = normaliser(str(v or ""))
    return "preventive" if "prev" in n else "corrective" if ("corr" in n or "cur" in n or "panne" in n) else None


def normaliser_priorite(v):
    n = normaliser(str(v or ""))
    for p in ("urgente", "haute", "normale", "basse"):
        if p[:4] in n:
            return p
    return {"elevee": "haute", "moyenne": "normale", "faible": "basse", "critique": "urgente"}.get(n)


def verifier(db: Session, champs: dict, confiance: dict = None, document_id=None) -> dict:
    """Résout les noms en identifiants et contrôle la cohérence. Renvoie {resolus, controles, bloquant, statut_prevu}."""
    confiance = confiance or {}
    C, R = [], {}

    def ajouter(niveau, champ, message):
        C.append({"niveau": niveau, "champ": champ, "message": message})

    # Équipement
    eq = None
    if champs.get("equipement_id"):
        eq = db.get(Equipment, int(champs["equipement_id"]))
    elif champs.get("equipement"):
        try:
            eq = outils.trouver_equipement(db, champs["equipement"])
        except outils.OutilErreur:
            eq = None
    if eq:
        R["equipement_id"] = eq.id
        ajouter("ok", "equipement", f"Équipement reconnu : {eq.nom}")
    elif champs.get("equipement") or champs.get("equipement_id"):
        ajouter("erreur", "equipement", f"Équipement « {champs.get('equipement') or champs.get('equipement_id')} » inconnu dans SmartMaint")
    else:
        ajouter("erreur", "equipement", "Équipement non indiqué sur le bon")

    # Technicien
    tech = None
    if champs.get("technicien_id"):
        tech = db.query(User).filter(User.id == int(champs["technicien_id"]), User.role == "technicien").first()
    elif champs.get("technicien"):
        tech, existants = trouver_technicien(db, champs["technicien"])
    if tech:
        R["technicien_id"] = tech.id
        ajouter("ok", "technicien", f"Technicien reconnu : {tech.nom}")
        if not tech.actif:
            ajouter("avertissement", "technicien", f"Le compte de {tech.nom} est désactivé")
    elif champs.get("technicien") or champs.get("technicien_id"):
        ajouter("erreur", "technicien", f"Technicien « {champs.get('technicien') or champs.get('technicien_id')} » inconnu : choisissez-le dans la liste")
    else:
        ajouter("avertissement", "technicien", "Aucun technicien indiqué : l'intervention sera créée sans technicien")

    # Type et priorité
    t = normaliser_type(champs.get("type_intervention"))
    R["type_intervention"] = t or "corrective"
    if not t:
        ajouter("avertissement", "type_intervention", "Type non reconnu : « corrective » retenu par défaut")
    p = normaliser_priorite(champs.get("priorite"))
    R["priorite"] = p or "normale"
    if not p:
        ajouter("avertissement", "priorite", "Priorité non indiquée : « normale » retenue par défaut")

    # Dates et durée
    maintenant = datetime.now()
    debut, fin = lire_date(champs.get("date_debut")), lire_date(champs.get("date_fin"))
    if champs.get("date_debut") and not debut:
        ajouter("erreur", "date_debut", f"Date de début illisible : « {champs.get('date_debut')} »")
    elif not debut:
        ajouter("erreur", "date_debut", "Date de début absente")
    if champs.get("date_fin") and not fin:
        ajouter("erreur", "date_fin", f"Date de fin illisible : « {champs.get('date_fin')} »")
    if debut and fin and fin < debut:
        ajouter("erreur", "date_fin", f"La fin ({fin:%d/%m/%Y %H:%M}) est avant le début ({debut:%d/%m/%Y %H:%M})")
    if debut and debut > maintenant + timedelta(days=1) and fin:
        ajouter("erreur", "date_debut", "Intervention terminée avec une date dans le futur")
    elif debut and debut > maintenant + timedelta(days=1):
        ajouter("avertissement", "date_debut", "Date dans le futur : l'intervention sera planifiée")
    if debut and debut < maintenant - timedelta(days=365):
        ajouter("avertissement", "date_debut", "Date de plus d'un an : vérifier l'année")
    duree_dates = int((fin - debut).total_seconds() // 60) if debut and fin and fin >= debut else None
    duree_ecrite = None
    try:
        duree_ecrite = int(float(champs["duree_minutes"])) if champs.get("duree_minutes") not in (None, "") else None
    except (TypeError, ValueError):
        ajouter("avertissement", "duree_minutes", f"Durée illisible : « {champs.get('duree_minutes')} »")
    if duree_ecrite is not None and duree_dates is not None and abs(duree_ecrite - duree_dates) > max(15, 0.25 * duree_dates):
        ajouter("avertissement", "duree_minutes",
                f"Durée écrite ({duree_ecrite} min) différente de la durée entre les dates ({duree_dates} min)")
    if duree_dates is not None and duree_dates > 24 * 60:
        ajouter("avertissement", "date_fin", f"Intervention de plus de 24 heures ({duree_dates // 60} h)")
    if debut and not fin and duree_ecrite:
        fin = debut + timedelta(minutes=duree_ecrite)        # fin déduite de la durée écrite
        ajouter("avertissement", "date_fin", f"Fin calculée à partir de la durée : {fin:%d/%m/%Y %H:%M}")
    R["date_debut"], R["date_fin"] = debut, fin

    # Alerte d'origine
    if champs.get("alerte_id") not in (None, ""):
        try:
            a = db.get(Alert, int(champs["alerte_id"]))
        except (TypeError, ValueError):
            a = None
        if not a:
            ajouter("erreur", "alerte_id", f"Alerte #{champs['alerte_id']} introuvable")
        else:
            R["alerte_id"] = a.id
            if eq and a.equipement_id != eq.id:
                autre = db.get(Equipment, a.equipement_id)
                ajouter("erreur", "alerte_id", f"L'alerte #{a.id} concerne {autre.nom if autre else 'un autre équipement'}, pas {eq.nom}")
            elif debut and a.created_at and a.created_at > debut + timedelta(minutes=5):
                ajouter("avertissement", "alerte_id", f"L'alerte #{a.id} est postérieure au début de l'intervention")
            else:
                ajouter("ok", "alerte_id", f"Alerte #{a.id} cohérente avec l'équipement")

    # Contenu
    if not (champs.get("description") or "").strip():
        ajouter("erreur", "description", "Description de la demande absente")
    if (champs.get("pieces_remplacees") or "").strip() and not (champs.get("actions_realisees") or "").strip():
        ajouter("avertissement", "actions_realisees", "Des pièces sont remplacées mais aucune action n'est décrite")
    if fin and fin <= maintenant and not (champs.get("actions_realisees") or "").strip():
        ajouter("avertissement", "actions_realisees", "Intervention terminée sans actions réalisées")

    # Doublon
    if eq and debut:
        proches = db.query(Intervention).filter(Intervention.equipement_id == eq.id).all()
        for i in proches:
            d = i.date_debut or i.date_intervention
            if d and abs((d - debut).total_seconds()) < 2 * 3600:
                ajouter("avertissement", "date_debut", f"Doublon possible : {outils.numero_intervention(i)} existe déjà à {d:%d/%m/%Y %H:%M}")
                break

    # Lectures incertaines
    for champ, c in (confiance or {}).items():
        if champs.get(champ) not in (None, "") and c is not None and float(c) < 0.6:
            ajouter("avertissement", champ, f"Lecture incertaine : vérifier « {LIBELLES.get(champ, champ)} »")

    if fin and fin <= maintenant:
        statut = "terminee"
    elif debut and debut <= maintenant:
        statut = "en_cours"
    else:
        statut = "planifiee"
    ordre = {"erreur": 0, "avertissement": 1, "ok": 2}
    C.sort(key=lambda c: ordre[c["niveau"]])
    return {"resolus": R, "controles": C, "bloquant": any(c["niveau"] == "erreur" for c in C), "statut_prevu": statut}
