"""Détection des événements qui déclenchent les workflows.
Chaque événement est un dictionnaire de contexte + une clé unique : une même clé n'est jamais traitée deux fois
par le même workflow, même après un redémarrage du serveur."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.copilote.outils import numero_intervention
from app.copilote.recherche import normaliser
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User


def _val(x):
    return getattr(x, "value", x)


def contexte_alerte(db: Session, a: Alert) -> dict:
    eq = db.get(Equipment, a.equipement_id) if a.equipement_id else None
    return {"type_evenement": "alerte", "alerte_id": a.id, "equipement_id": a.equipement_id, "equipement": eq.nom if eq else "?",
            "severite": _val(a.severite), "type_alerte": a.type or "", "message": a.message or "",
            "date": (a.created_at or datetime.now()).strftime("%d/%m/%Y %H:%M"), "origine": "ia" if (a.type or "").startswith("Anomalie IA") else "seuil"}


def contexte_intervention(db: Session, i: Intervention) -> dict:
    eq = db.get(Equipment, i.equipement_id) if i.equipement_id else None
    tech = db.get(User, i.technicien_id) if i.technicien_id else None
    return {"type_evenement": "intervention_terminee", "intervention_id": i.id, "intervention": numero_intervention(i),
            "equipement_id": i.equipement_id, "equipement": eq.nom if eq else "?", "technicien": tech.nom if tech else "non assigné",
            "alerte_id": i.alerte_id, "type_intervention": _val(i.type_intervention),
            "date": (i.date_fin or datetime.now()).strftime("%d/%m/%Y %H:%M")}


def alerte_correspond(a: Alert, p: dict) -> bool:
    """Filtres communs : sévérités, équipements, type de capteur, origine."""
    if p.get("severites") and _val(a.severite) not in p["severites"]:
        return False
    if p.get("equipements") and a.equipement_id not in [int(x) for x in p["equipements"]]:
        return False
    if p.get("type_capteur") and normaliser(p["type_capteur"]) not in normaliser(a.type or ""):
        return False
    origine = "ia" if (a.type or "").startswith("Anomalie IA") else "seuil"
    if p.get("origine") and p["origine"] != origine:
        return False
    return True


# ─────────────────────────────────────────────────────────────
# DÉTECTION PAR TYPE DE DÉCLENCHEUR
# « nouvelles » : lot d'alertes / interventions / documents apparus depuis le dernier tour du moteur
# ─────────────────────────────────────────────────────────────
def ev_alerte(db, wf_id, p, nouvelles) -> list:
    return [(f"alerte:{a.id}", contexte_alerte(db, a)) for a in nouvelles["alertes"] if alerte_correspond(a, p)]


def ev_recidive(db, wf_id, p, nouvelles) -> list:
    res, vus = [], set()
    nb, heures = max(2, int(p.get("nb") or 3)), max(1, int(p.get("heures") or 24))
    for a in nouvelles["alertes"]:
        if not alerte_correspond(a, p):
            continue
        fenetre = int((a.created_at or datetime.now()).timestamp() // (heures * 3600))   # une seule fois par période
        cle = f"recidive:{a.equipement_id}:{fenetre}"
        if cle in vus:
            continue
        debut = (a.created_at or datetime.now()) - timedelta(hours=heures)
        recentes = [x for x in db.query(Alert).filter(Alert.equipement_id == a.equipement_id, Alert.created_at >= debut,
                                                     Alert.created_at <= (a.created_at or datetime.now())).all() if alerte_correspond(x, p)]
        if len(recentes) >= nb:
            vus.add(cle)
            ctx = contexte_alerte(db, a)
            ctx.update(type_evenement="recidive", nb_alertes=len(recentes))
            res.append((cle, ctx))
    return res


def ev_alerte_non_traitee(db, wf_id, p, nouvelles) -> list:
    minutes = max(1, int(p.get("minutes") or 30))
    limite = datetime.now() - timedelta(minutes=minutes)
    candidates = db.query(Alert).filter(Alert.created_at <= limite, Alert.created_at >= limite - timedelta(hours=12)).all()
    traitees = {x[0] for x in db.query(Intervention.alerte_id).filter(Intervention.alerte_id.isnot(None)).all()}
    res = []
    for a in candidates:
        if a.acquittee or a.id in traitees or not alerte_correspond(a, p):
            continue
        ctx = contexte_alerte(db, a)
        ctx.update(type_evenement="alerte_non_traitee", minutes=minutes)
        res.append((f"non_traitee:{a.id}", ctx))
    return res


def ev_intervention_terminee(db, wf_id, p, nouvelles) -> list:
    res = []
    for i in nouvelles["interventions"]:
        if p.get("equipements") and i.equipement_id not in [int(x) for x in p["equipements"]]:
            continue
        if p.get("type_intervention") and _val(i.type_intervention) != p["type_intervention"]:
            continue
        res.append((f"terminee:{i.id}", contexte_intervention(db, i)))
    return res


def ev_document_valide(db, wf_id, p, nouvelles) -> list:
    res = []
    for d in nouvelles["documents"]:
        ctx = {"type_evenement": "document_valide", "document": d.nom_fichier, "document_id": d.id}
        if d.intervention_id:
            i = db.get(Intervention, d.intervention_id)
            if i:
                ctx.update(contexte_intervention(db, i))
                ctx["type_evenement"] = "document_valide"
        res.append((f"document:{d.id}", ctx))
    return res


def prochaine_echeance(p: dict, apres: datetime) -> datetime:
    """Prochaine date d'exécution d'un déclencheur planifié, strictement après « apres »."""
    h, m = (int(x) for x in str(p.get("heure") or "08:00").split(":")[:2])
    freq = p.get("frequence") or "quotidien"
    if freq == "intervalle":
        return apres + timedelta(hours=max(1, int(p.get("intervalle_heures") or 24)))
    d = apres.replace(hour=h, minute=m, second=0, microsecond=0)
    if freq == "quotidien":
        return d if d > apres else d + timedelta(days=1)
    if freq == "hebdomadaire":
        jour = int(p.get("jour_semaine") or 0)
        d += timedelta(days=(jour - d.weekday()) % 7)
        return d if d > apres else d + timedelta(days=7)
    jour = min(max(int(p.get("jour_mois") or 1), 1), 28)              # mensuel
    d = d.replace(day=jour)
    if d <= apres:
        d = (d.replace(day=1) + timedelta(days=32)).replace(day=jour)
    return d


def ev_planifie(db, wf, p, maintenant) -> list:
    """Événements d'un workflow planifié arrivé à échéance (un par équipement si une liste est donnée)."""
    if wf.prochaine_execution is None or wf.prochaine_execution > maintenant:
        return []
    echeance = wf.prochaine_execution
    ids = [int(x) for x in (p.get("equipements") or [])]
    cibles = [db.get(Equipment, i) for i in ids] if ids else [None]
    res = []
    for eq in cibles:
        if ids and not eq:
            continue
        ctx = {"type_evenement": "planifie", "date": echeance.strftime("%d/%m/%Y %H:%M"),
               "equipement_id": eq.id if eq else None, "equipement": eq.nom if eq else "tous les équipements"}
        res.append((f"planifie:{echeance:%Y%m%d%H%M}:{eq.id if eq else 0}", ctx))
    return res


DETECTEURS = {"alerte": ev_alerte, "recidive": ev_recidive, "alerte_non_traitee": ev_alerte_non_traitee,
              "intervention_terminee": ev_intervention_terminee, "document_valide": ev_document_valide}
