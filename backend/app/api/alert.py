from datetime import datetime, timedelta
from typing import List, Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.core.database import get_db
from app.models.alert import Alert
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.intervention import Intervention
from app.models.user import User
from app.schemas.alert import AlertCreate, AlertResponse, AlertUpdate
from app.core.security import get_current_user, verifier_cle_iot, exiger_roles
from app.models.equipment import Equipment
from app.core.notifications import notifier_alerte

router = APIRouter(prefix="/alertes", tags=["Alertes"])

FENETRE_MINUTES = 15      # mesures affichées avant et après l'alerte dans le rapport d'incident
MAX_POINTS_GRAPHIQUE = 400


@router.get("/stats", dependencies=[Depends(get_current_user)])
def get_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(Alert.id)).scalar()
    critiques = db.query(func.count(Alert.id)).filter(Alert.severite == "critique").scalar()
    return {"total": total, "critiques": critiques}


@router.get("/", response_model=List[AlertResponse], dependencies=[Depends(get_current_user)])
def get_alertes(db: Session = Depends(get_db)):
    return db.query(Alert).order_by(Alert.created_at.desc()).limit(50).all()


@router.get("/{id}", response_model=AlertResponse, dependencies=[Depends(get_current_user)])
def get_alerte(id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    return alert


# Route réservée aux appareils IoT : la clé secrète X-API-Key est obligatoire
@router.post("/", response_model=AlertResponse, dependencies=[Depends(verifier_cle_iot)])
def create_alerte(alert: AlertCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Anti-doublon : pas de nouvelle alerte si même équipement/type dans les 5 dernières minutes
    cinq_min = func.now() - text("INTERVAL 5 MINUTE")
    existante = db.query(Alert).filter(
        Alert.equipement_id == alert.equipement_id,
        Alert.type == alert.type,
        Alert.created_at >= cinq_min
    ).first()
    if existante:
        return existante
    new_alert = Alert(**alert.model_dump())
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    # Notification Telegram pour les alertes haute et critique
    severite = alert.severite.value if hasattr(alert.severite, "value") else alert.severite
    if severite in ("haute", "critique"):
        equipement = db.query(Equipment).filter(Equipment.id == alert.equipement_id).first()
        nom = equipement.nom if equipement else f"Équipement {alert.equipement_id}"
        background_tasks.add_task(notifier_alerte, nom, severite, alert.type, alert.message)

    return new_alert


@router.put("/{id}", response_model=AlertResponse, dependencies=[Depends(get_current_user)])
def update_alerte(id: int, alert: AlertUpdate, db: Session = Depends(get_db)):
    existing = db.query(Alert).filter(Alert.id == id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    for key, value in alert.model_dump(exclude_unset=True).items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/{id}", dependencies=[Depends(exiger_roles("admin"))])
def delete_alerte(id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")
    db.delete(alert)
    db.commit()
    return {"message": "Alerte supprimée avec succès"}


# ─────────────────────────────────────────────────────────────
# RAPPORT D'INCIDENT : l'alerte, les mesures avant/après, l'analyse et la suite donnée
# ─────────────────────────────────────────────────────────────

def _val(x):
    return getattr(x, "value", x)


def _capteur_de_alerte(db: Session, alerte: Alert):
    """Capteur à l'origine de l'alerte (colonne capteur_id, sinon déduit du type d'alerte)."""
    if alerte.capteur_id:
        return db.query(Sensor).filter(Sensor.id == alerte.capteur_id).first()
    for c in db.query(Sensor).filter(Sensor.equipement_id == alerte.equipement_id, Sensor.actif == True).all():
        if alerte.type and alerte.type.endswith(c.type):
            return c
    return None


@router.get("/{id}/rapport", dependencies=[Depends(get_current_user)])
def get_rapport_incident(id: int, db: Session = Depends(get_db)):
    alerte = db.query(Alert).filter(Alert.id == id).first()
    if not alerte:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")

    equipement = db.query(Equipment).filter(Equipment.id == alerte.equipement_id).first()
    capteur = _capteur_de_alerte(db, alerte)
    instant = alerte.created_at

    def hors_seuil(v):
        if not capteur:
            return False
        return ((capteur.seuil_max is not None and v > capteur.seuil_max) or
                (capteur.seuil_min is not None and v < capteur.seuil_min))

    # 1. Mesures du capteur 15 minutes avant et après l'alerte
    lignes = []
    if capteur and instant:
        lignes = (db.query(SensorData)
                  .filter(SensorData.capteur_id == capteur.id,
                          SensorData.timestamp >= instant - timedelta(minutes=FENETRE_MINUTES),
                          SensorData.timestamp <= instant + timedelta(minutes=FENETRE_MINUTES))
                  .order_by(SensorData.timestamp).all())

    # 2. Analyse de l'épisode anormal autour de l'alerte
    analyse = None
    if lignes:
        # Mesure déclenchante : la dernière enregistrée au moment de l'alerte
        idx = 0
        for k, r in enumerate(lignes):
            if r.timestamp <= instant + timedelta(seconds=2):
                idx = k
        declenchante = lignes[idx]

        debut_ep = fin_ep = idx
        if hors_seuil(declenchante.valeur):
            while debut_ep - 1 >= 0 and hors_seuil(lignes[debut_ep - 1].valeur):
                debut_ep -= 1
            while fin_ep + 1 < len(lignes) and hors_seuil(lignes[fin_ep + 1].valeur):
                fin_ep += 1
            episode = lignes[debut_ep:fin_ep + 1]
        else:
            episode = []

        sens, seuil, extreme, ecart = None, None, None, None
        if episode:
            if capteur.seuil_max is not None and declenchante.valeur > capteur.seuil_max:
                sens, seuil = "haut", capteur.seuil_max
                extreme = max(r.valeur for r in episode)
                ecart = extreme - seuil
            else:
                sens, seuil = "bas", capteur.seuil_min
                extreme = min(r.valeur for r in episode)
                ecart = seuil - extreme

        retour = lignes[fin_ep + 1] if episode and fin_ep + 1 < len(lignes) else None
        avant = [r.valeur for r in lignes[:debut_ep] if not hors_seuil(r.valeur)]

        analyse = {
            "valeur_declenchante": declenchante.valeur,
            "date_mesure": declenchante.timestamp,
            "hors_seuil": bool(episode),
            "sens": sens,                       # "haut", "bas" ou None (détection IA sous les seuils)
            "seuil_depasse": seuil,
            "valeur_extreme": extreme,
            "ecart_max": round(ecart, 2) if ecart is not None else None,
            "nb_mesures_hors_seuil": len(episode),
            "debut_anomalie": episode[0].timestamp if episode else None,
            "fin_anomalie": episode[-1].timestamp if episode else None,
            "retour_normale": retour.timestamp if retour else None,
            "valeur_retour": retour.valeur if retour else None,
            "duree_anomalie_secondes": int((retour.timestamp - episode[0].timestamp).total_seconds()) if retour else None,
            "moyenne_avant": round(sum(avant) / len(avant), 2) if avant else None,
        }

    # Graphique : au maximum 400 points pour garder un document léger
    pas = max(1, len(lignes) // MAX_POINTS_GRAPHIQUE)
    mesures = [{"t": r.timestamp, "v": r.valeur} for r in lignes[::pas]]

    # 3. Autres alertes du même équipement autour de l'incident (± 5 minutes)
    associees = []
    if instant:
        associees = [{
            "id": a.id, "type": a.type, "severite": _val(a.severite), "message": a.message, "created_at": a.created_at,
        } for a in db.query(Alert).filter(
            Alert.equipement_id == alerte.equipement_id, Alert.id != alerte.id,
            Alert.created_at >= instant - timedelta(minutes=5), Alert.created_at <= instant + timedelta(minutes=5)
        ).order_by(Alert.created_at).all()]

    # 4. Interventions déclenchées par cette alerte
    noms = {u.id: u.nom for u in db.query(User).all()}
    interventions = []
    for i in db.query(Intervention).filter(Intervention.alerte_id == id).order_by(Intervention.created_at).all():
        duree = None
        if i.date_debut and i.date_fin:
            duree = max(0, round((i.date_fin - i.date_debut).total_seconds() / 60))
        interventions.append({
            "id": i.id, "statut": _val(i.statut), "type_intervention": _val(i.type_intervention),
            "priorite": _val(i.priorite), "technicien": noms.get(i.technicien_id),
            "description": i.description, "diagnostic": i.diagnostic, "actions_realisees": i.actions_realisees,
            "date_debut": i.date_debut, "date_fin": i.date_fin, "duree_minutes": duree,
        })

    return {
        "alerte": {
            "id": alerte.id, "type": alerte.type, "severite": _val(alerte.severite), "message": alerte.message,
            "acquittee": alerte.acquittee, "created_at": alerte.created_at,
            "origine": "ia" if (alerte.type or "").startswith("Anomalie IA") else "seuil",
        },
        "equipement": {
            "id": equipement.id, "nom": equipement.nom, "type": equipement.type,
            "localisation": equipement.localisation, "statut": _val(equipement.statut),
        } if equipement else None,
        "capteur": {
            "id": capteur.id, "type": capteur.type, "unite": capteur.unite,
            "seuil_min": capteur.seuil_min, "seuil_max": capteur.seuil_max,
        } if capteur else None,
        "fenetre_minutes": FENETRE_MINUTES,
        "mesures": mesures,
        "analyse": analyse,
        "alertes_associees": associees,
        "interventions": interventions,
    }


# ─────────────────────────────────────────────────────────────
# CRÉATION D'UNE INTERVENTION EN UN CLIC DEPUIS UNE ALERTE
# ─────────────────────────────────────────────────────────────


class InterventionDepuisAlerte(BaseModel):
    technicien_id: Optional[int] = None
    date_intervention: Optional[datetime] = None


# La priorité de l'intervention découle de la sévérité de l'alerte
PRIORITE_PAR_SEVERITE = {"critique": "urgente", "haute": "haute", "moyenne": "normale", "faible": "basse"}

# Contrôles recommandés selon le type de capteur concerné
CONTROLES_PAR_CAPTEUR = {
    "temperature": "Contrôler le refroidissement, la lubrification et la charge de la machine.",
    "pression": "Contrôler l'étanchéité du circuit, les vannes et le circuit hydraulique.",
    "vibration": "Contrôler les roulements, l'alignement de l'arbre et la fixation de la machine.",
    "courant": "Contrôler la charge mécanique, l'état du bobinage et l'alimentation électrique.",
}


@router.post("/{id}/intervention", dependencies=[Depends(get_current_user)])
def creer_intervention_depuis_alerte(id: int, data: InterventionDepuisAlerte, db: Session = Depends(get_db)):
    alerte = db.query(Alert).filter(Alert.id == id).first()
    if not alerte:
        raise HTTPException(status_code=404, detail="Alerte non trouvée")

    # Une seule intervention ouverte par alerte
    ouverte = db.query(Intervention).filter(Intervention.alerte_id == id, Intervention.statut != "terminee").first()
    if ouverte:
        raise HTTPException(status_code=409, detail=f"Une intervention est déjà ouverte pour cette alerte (n° {ouverte.id})")

    if data.technicien_id and not db.query(User).filter(User.id == data.technicien_id).first():
        raise HTTPException(status_code=400, detail="Technicien introuvable")

    capteur = _capteur_de_alerte(db, alerte)
    severite = _val(alerte.severite)
    controle = CONTROLES_PAR_CAPTEUR.get(capteur.type if capteur else "", "Contrôler l'équipement et identifier la cause de l'anomalie.")
    description = (f"Intervention suite à l'alerte #{alerte.id} ({alerte.type}, sévérité {severite}) : "
                   f"{alerte.message}. {controle}")

    intervention = Intervention(
        equipement_id=alerte.equipement_id,
        technicien_id=data.technicien_id,
        alerte_id=alerte.id,
        type_intervention="corrective",
        priorite=PRIORITE_PAR_SEVERITE.get(severite, "normale"),
        description=description,
        statut="planifiee",
        date_intervention=data.date_intervention,
    )
    db.add(intervention)
    alerte.acquittee = True          # l'alerte est prise en charge
    db.commit()
    db.refresh(intervention)
    return {"id": intervention.id, "priorite": _val(intervention.priorite), "description": intervention.description}
