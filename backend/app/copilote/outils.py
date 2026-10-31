"""Outils métier mis à disposition de l'agent. Chaque outil lit les vraies données de SmartMaint,
renvoie un résultat court (pour ne pas surcharger le modèle) et la liste des sources utilisées.
Les outils en écriture ne modifient rien : ils créent une action en attente de confirmation."""
import difflib
import json
from datetime import datetime, timedelta, date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.copilote import recherche
from app.copilote.recherche import normaliser
from app.models.alert import Alert
from app.models.copilote import CopiloteAction
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.user import User


def _val(x):
    return getattr(x, "value", x)


def _date(d):
    return d.strftime("%d/%m/%Y %H:%M") if isinstance(d, datetime) else (str(d) if d else None)


def numero_intervention(i) -> str:
    annee = (i.created_at or datetime.now()).year
    return ("FI" if _val(i.statut) == "terminee" else "OI") + f"-{annee}-{i.id:04d}"


class OutilErreur(Exception):
    """Erreur expliquée au modèle, qui peut alors corriger sa demande."""


def trouver_equipement(db: Session, texte: Optional[str]) -> Optional[Equipment]:
    """Retrouve un équipement à partir d'un nom approximatif (« pompe », « P01 », « moteur m01 »...)."""
    if not texte:
        return None
    equipements = db.query(Equipment).all()
    if str(texte).isdigit():
        e = next((e for e in equipements if e.id == int(texte)), None)
        if e:
            return e
    cible = normaliser(str(texte))
    for e in equipements:
        if cible == normaliser(e.nom) or cible in normaliser(e.nom) or normaliser(e.nom) in cible:
            return e
    # repères du type P01, Z99, M2 : s'ils sont donnés, ils doivent figurer dans le nom
    # (sinon « compresseur Z99 » serait confondu avec « compresseur C01 »)
    reperes = {m for m in recherche.mots(cible) if any(ch.isdigit() for ch in m)}
    candidats = [e for e in equipements if reperes <= set(recherche.mots(e.nom))] if reperes else equipements
    mots_cible = set(recherche.mots(cible))
    meilleur = max(candidats, key=lambda e: len(mots_cible & set(recherche.mots(e.nom))), default=None)
    if meilleur and mots_cible & set(recherche.mots(meilleur.nom)):
        return meilleur
    proches = difflib.get_close_matches(cible, [normaliser(e.nom) for e in candidats], n=1, cutoff=0.5)
    if proches:
        return next(e for e in candidats if normaliser(e.nom) == proches[0])
    raise OutilErreur(f"Équipement « {texte} » introuvable. Équipements existants : " + ", ".join(e.nom for e in equipements))


# ─────────────────────────────────────────────────────────────
# OUTILS DE LECTURE
# ─────────────────────────────────────────────────────────────
def lister_equipements(db: Session, ctx: dict) -> dict:
    res = []
    for e in db.query(Equipment).order_by(Equipment.id).all():
        nb = db.query(Sensor).filter(Sensor.equipement_id == e.id, Sensor.actif.is_(True)).count()
        res.append({"id": e.id, "nom": e.nom, "type": e.type, "localisation": e.localisation,
                    "statut": _val(e.statut), "capteurs_actifs": nb})
        ctx["sources"].append({"type": "equipement", "id": e.id, "libelle": e.nom})
    return {"equipements": res}


def etat_equipement(db: Session, ctx: dict, equipement: str) -> dict:
    e = trouver_equipement(db, equipement)
    capteurs = []
    for c in db.query(Sensor).filter(Sensor.equipement_id == e.id).all():
        m = db.query(SensorData).filter(SensorData.capteur_id == c.id).order_by(SensorData.id.desc()).first()
        etat = "inactif" if not c.actif else "sans mesure"
        if m and c.actif:
            hors = (c.seuil_max is not None and m.valeur > c.seuil_max) or (c.seuil_min is not None and m.valeur < c.seuil_min)
            etat = "hors seuil" if hors else "normal"
        capteurs.append({"id": c.id, "type": c.type, "unite": c.unite, "seuil_min": c.seuil_min, "seuil_max": c.seuil_max,
                         "derniere_valeur": round(m.valeur, 2) if m else None, "date_mesure": _date(m.timestamp) if m else None,
                         "etat": etat})
    depuis = datetime.now() - timedelta(days=7)
    par_sev = dict(db.query(Alert.severite, func.count(Alert.id))
                   .filter(Alert.equipement_id == e.id, Alert.created_at >= depuis).group_by(Alert.severite).all())
    ouvertes = db.query(Intervention).filter(Intervention.equipement_id == e.id, Intervention.statut != "terminee").all()
    from app.api.rapport import rapport_maintenance
    r = rapport_maintenance(debut=date.today() - timedelta(days=29), fin=date.today(), db=db)
    ind = next((x for x in r["equipements"] if x["id"] == e.id), {})
    ctx["sources"].append({"type": "equipement", "id": e.id, "libelle": e.nom})
    for i in ouvertes:
        ctx["sources"].append({"type": "intervention", "id": i.id, "libelle": numero_intervention(i)})
    return {
        "equipement": {"id": e.id, "nom": e.nom, "type": e.type, "localisation": e.localisation, "statut": _val(e.statut)},
        "capteurs": capteurs,
        "alertes_7_jours": {_val(k): v for k, v in par_sev.items()},
        "interventions_ouvertes": [{"numero": numero_intervention(i), "statut": _val(i.statut), "priorite": _val(i.priorite),
                                    "description": (i.description or "")[:200]} for i in ouvertes],
        "indicateurs_30_jours": {k: ind.get(k) for k in ("nb_pannes", "mttr_minutes", "mtbf_heures", "disponibilite")},
    }


def rechercher_alertes(db: Session, ctx: dict, equipement: Optional[str] = None, severite: Optional[str] = None,
                       type_capteur: Optional[str] = None, origine: Optional[str] = None, jours: int = 7, limite: int = 8) -> dict:
    jours = max(1, min(int(jours or 7), 365))
    q = db.query(Alert).filter(Alert.created_at >= datetime.now() - timedelta(days=jours))
    e = trouver_equipement(db, equipement) if equipement else None
    if e:
        q = q.filter(Alert.equipement_id == e.id)
    if severite:
        q = q.filter(Alert.severite == normaliser(severite))
    if type_capteur:
        q = q.filter(Alert.type.like(f"%{normaliser(type_capteur)}%"))
    if origine == "ia":
        q = q.filter(Alert.type.like("Anomalie IA%"))
    elif origine == "seuil":
        q = q.filter(~Alert.type.like("Anomalie IA%"))
    total = q.count()
    par_sev = {_val(k): v for k, v in q.with_entities(Alert.severite, func.count(Alert.id)).group_by(Alert.severite).all()}
    traitees = {x[0] for x in db.query(Intervention.alerte_id).filter(Intervention.alerte_id.isnot(None)).all()}
    noms = {x.id: x.nom for x in db.query(Equipment).all()}
    dernieres = q.order_by(Alert.created_at.desc()).limit(max(1, min(int(limite or 8), 20))).all()
    for a in dernieres:
        ctx["sources"].append({"type": "alerte", "id": a.id, "libelle": f"Alerte #{a.id}"})
    return {"periode_jours": jours, "equipement": e.nom if e else "tous", "total": total, "par_severite": par_sev,
            "dernieres": [{"id": a.id, "date": _date(a.created_at), "equipement": noms.get(a.equipement_id), "type": a.type,
                           "severite": _val(a.severite), "message": a.message, "intervention_creee": a.id in traitees}
                          for a in dernieres]}


def analyser_alerte(db: Session, ctx: dict, alerte_id: int) -> dict:
    from app.api.alert import get_rapport_incident
    try:
        r = get_rapport_incident(int(alerte_id), db)
    except Exception:
        raise OutilErreur(f"Alerte #{alerte_id} introuvable") from None
    an = r.get("analyse") or {}
    ctx["sources"].append({"type": "alerte", "id": int(alerte_id), "libelle": f"Alerte #{alerte_id}"})
    for i in r.get("interventions") or []:
        ctx["sources"].append({"type": "intervention", "id": i.get("id"), "libelle": f"Intervention #{i.get('id')}"})
    a, eq, cap = r.get("alerte", {}), r.get("equipement", {}), r.get("capteur") or {}
    return {
        "alerte": {"id": a.get("id"), "type": a.get("type"), "severite": a.get("severite"), "origine": a.get("origine"),
                   "message": a.get("message"), "date": str(a.get("created_at"))},
        "equipement": eq.get("nom"), "capteur": {k: cap.get(k) for k in ("type", "unite", "seuil_min", "seuil_max")},
        "analyse": {k: an.get(k) for k in ("valeur_declenchante", "valeur_extreme", "ecart_max", "sens", "nb_mesures_hors_seuil",
                                           "duree_anomalie_secondes", "retour_normale", "valeur_retour", "moyenne_avant")},
        "alertes_associees": len(r.get("alertes_associees") or []),
        "interventions_liees": [{"id": i.get("id"), "statut": i.get("statut")} for i in (r.get("interventions") or [])],
    }


def rechercher_interventions(db: Session, ctx: dict, equipement: Optional[str] = None, statut: Optional[str] = None,
                             jours: int = 30, limite: int = 8) -> dict:
    q = db.query(Intervention).filter(Intervention.created_at >= datetime.now() - timedelta(days=max(1, min(int(jours or 30), 365))))
    e = trouver_equipement(db, equipement) if equipement else None
    if e:
        q = q.filter(Intervention.equipement_id == e.id)
    if statut == "ouverte":
        q = q.filter(Intervention.statut != "terminee")
    elif statut:
        q = q.filter(Intervention.statut == statut)
    noms_eq = {x.id: x.nom for x in db.query(Equipment).all()}
    noms_tech = {u.id: u.nom for u in db.query(User).all()}
    res = q.order_by(Intervention.created_at.desc()).limit(max(1, min(int(limite or 8), 20))).all()
    for i in res:
        ctx["sources"].append({"type": "intervention", "id": i.id, "libelle": numero_intervention(i)})
    return {"total": q.count(), "interventions": [{
        "numero": numero_intervention(i), "equipement": noms_eq.get(i.equipement_id), "type": _val(i.type_intervention),
        "priorite": _val(i.priorite), "statut": _val(i.statut), "technicien": noms_tech.get(i.technicien_id),
        "date": _date(i.date_debut or i.date_intervention or i.created_at), "alerte_id": i.alerte_id,
        "description": (i.description or "")[:200], "diagnostic": (getattr(i, "diagnostic", None) or "")[:200],
    } for i in res]}


def indicateurs_maintenance(db: Session, ctx: dict, jours: int = 30) -> dict:
    from app.api.rapport import rapport_maintenance
    jours = max(1, min(int(jours or 30), 365))
    r = rapport_maintenance(debut=date.today() - timedelta(days=jours - 1), fin=date.today(), db=db)
    ctx["sources"].append({"type": "rapport", "id": None, "libelle": f"Indicateurs {jours} jours"})
    return {"periode_jours": jours, "synthese": r["synthese"],
            "par_equipement": [{k: x[k] for k in ("nom", "nb_alertes", "nb_critiques", "nb_pannes", "mttr_minutes",
                                                   "mtbf_heures", "disponibilite")} for x in r["equipements"]],
            "recommandations": r["recommandations"]}


def recherche_documentaire(db: Session, ctx: dict, requete: str) -> dict:
    res = recherche.rechercher(db, requete, limite=4)
    for d in res:
        ctx["sources"].append({"type": d["type"], "id": d["id"], "libelle": d["source"]})
    return {"resultats": res} if res else {"resultats": [], "remarque": "Aucun document pertinent dans la base de connaissances."}


def lister_techniciens(db: Session, ctx: dict) -> dict:
    res = []
    for u in db.query(User).filter(User.role == "technicien", User.actif.is_(True)).all():
        n = db.query(Intervention).filter(Intervention.technicien_id == u.id, Intervention.statut != "terminee").count()
        res.append({"id": u.id, "nom": u.nom, "interventions_ouvertes": n})
    return {"techniciens": sorted(res, key=lambda x: x["interventions_ouvertes"])}


# ─────────────────────────────────────────────────────────────
# OUTIL D'ÉCRITURE (avec confirmation)
# ─────────────────────────────────────────────────────────────
PRIORITES = {"basse", "normale", "haute", "urgente"}


def proposer_intervention(db: Session, ctx: dict, equipement: str, description: str, priorite: str = "normale",
                          type_intervention: str = "corrective", alerte_id: Optional[int] = None,
                          technicien_id: Optional[int] = None) -> dict:
    e = trouver_equipement(db, equipement)
    priorite = normaliser(priorite or "normale")
    if priorite not in PRIORITES:
        priorite = "normale"
    type_intervention = "preventive" if "prev" in normaliser(type_intervention or "") else "corrective"
    if alerte_id and not db.query(Alert).filter(Alert.id == int(alerte_id)).first():
        raise OutilErreur(f"Alerte #{alerte_id} introuvable")
    tech = db.query(User).filter(User.id == int(technicien_id), User.role == "technicien").first() if technicien_id else None
    if technicien_id and not tech:
        raise OutilErreur(f"Technicien n° {technicien_id} introuvable ; utilisez lister_techniciens")
    if not description or len(description.strip()) < 10:
        raise OutilErreur("La description doit expliquer le travail à réaliser (10 caractères minimum)")
    parametres = {"equipement_id": e.id, "description": description.strip()[:1000], "priorite": priorite,
                  "type_intervention": type_intervention, "alerte_id": int(alerte_id) if alerte_id else None,
                  "technicien_id": tech.id if tech else None}
    resume = (f"Créer une intervention {type_intervention} de priorité {priorite} sur {e.nom}"
              + (f", assignée à {tech.nom}" if tech else "") + (f", liée à l'alerte #{alerte_id}" if alerte_id else ""))
    action = CopiloteAction(utilisateur_id=ctx["utilisateur_id"], type_action="creer_intervention",
                            parametres=json.dumps(parametres, ensure_ascii=False), resume=resume,
                            statut="en_attente", created_at=datetime.now())
    db.add(action)
    db.commit()
    db.refresh(action)
    ctx["actions"].append({"id": action.id, "resume": resume, "parametres": parametres, "statut": "en_attente"})
    return {"action_id": action.id, "statut": "en attente de confirmation par l'utilisateur", "resume": resume}


def executer_action(db: Session, action: CopiloteAction) -> dict:
    """Exécutée uniquement quand l'utilisateur clique sur « Confirmer »."""
    p = json.loads(action.parametres)
    if action.type_action != "creer_intervention":
        raise OutilErreur("Type d'action inconnu")
    i = Intervention(equipement_id=p["equipement_id"], technicien_id=p.get("technicien_id"), alerte_id=p.get("alerte_id"),
                     type_intervention=p["type_intervention"], priorite=p["priorite"],
                     description=p["description"] + "\n(Préparée par le copilote IA et validée par l'utilisateur)",
                     statut="planifiee", date_intervention=datetime.now() + timedelta(days=1))
    db.add(i)
    if p.get("alerte_id"):
        a = db.query(Alert).filter(Alert.id == p["alerte_id"]).first()
        if a:
            a.acquittee = True
    db.commit()
    db.refresh(i)
    return {"intervention_id": i.id, "numero": numero_intervention(i)}


# ─────────────────────────────────────────────────────────────
# DÉCLARATION DES OUTILS POUR LE MODÈLE (format JSON Schema)
# ─────────────────────────────────────────────────────────────
def _outil(nom, description, proprietes=None, requis=None):
    return {"type": "function", "function": {"name": nom, "description": description, "parameters": {
        "type": "object", "properties": proprietes or {}, "required": requis or []}}}


EQ = {"type": "string", "description": "Nom (même approximatif) ou numéro de l'équipement, ex. « pompe P01 »"}
DEFINITIONS = [
    _outil("lister_equipements", "Liste tous les équipements avec leur statut et leur nombre de capteurs."),
    _outil("etat_equipement", "État complet d'un équipement : capteurs et dernières mesures, alertes des 7 derniers jours, "
           "interventions ouvertes, MTTR, MTBF et disponibilité sur 30 jours.", {"equipement": EQ}, ["equipement"]),
    _outil("rechercher_alertes", "Compte et liste les alertes avec des filtres.", {
        "equipement": EQ, "severite": {"type": "string", "enum": ["faible", "moyenne", "haute", "critique"]},
        "type_capteur": {"type": "string", "enum": ["temperature", "pression", "vibration", "courant"]},
        "origine": {"type": "string", "enum": ["seuil", "ia"]},
        "jours": {"type": "integer", "description": "Période en jours (7 par défaut)"},
        "limite": {"type": "integer", "description": "Nombre d'alertes détaillées (8 par défaut)"}}),
    _outil("analyser_alerte", "Analyse détaillée d'une alerte : valeur, écart au seuil, durée, retour à la normale, interventions liées.",
           {"alerte_id": {"type": "integer"}}, ["alerte_id"]),
    _outil("rechercher_interventions", "Liste les interventions avec des filtres.", {
        "equipement": EQ, "statut": {"type": "string", "enum": ["ouverte", "planifiee", "en_cours", "terminee"]},
        "jours": {"type": "integer"}, "limite": {"type": "integer"}}),
    _outil("indicateurs_maintenance", "MTTR, MTBF, disponibilité, alertes et recommandations sur une période.",
           {"jours": {"type": "integer", "description": "30 par défaut"}}),
    _outil("recherche_documentaire", "Recherche dans les comptes rendus d'intervention, les manuels constructeurs et les "
           "fiches techniques (diagnostics, pièces remplacées, causes de pannes passées, consignes d'entretien, réglages).",
           {"requete": {"type": "string"}}, ["requete"]),
    _outil("lister_techniciens", "Liste les techniciens actifs et leur nombre d'interventions ouvertes."),
    _outil("proposer_intervention", "Prépare un ordre d'intervention. Il ne sera créé qu'après confirmation de l'utilisateur.", {
        "equipement": EQ, "description": {"type": "string", "description": "Travail à réaliser et contrôles"},
        "priorite": {"type": "string", "enum": ["basse", "normale", "haute", "urgente"]},
        "type_intervention": {"type": "string", "enum": ["corrective", "preventive"]},
        "alerte_id": {"type": "integer"}, "technicien_id": {"type": "integer"}}, ["equipement", "description"]),
]

FONCTIONS = {
    "lister_equipements": lister_equipements, "etat_equipement": etat_equipement,
    "rechercher_alertes": rechercher_alertes, "analyser_alerte": analyser_alerte,
    "rechercher_interventions": rechercher_interventions, "indicateurs_maintenance": indicateurs_maintenance,
    "recherche_documentaire": recherche_documentaire, "lister_techniciens": lister_techniciens,
    "proposer_intervention": proposer_intervention,
}
