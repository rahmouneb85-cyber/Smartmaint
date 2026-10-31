from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, exiger_roles
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.alert import Alert
from app.models.intervention import Intervention
from app.models.user import User
from app.schemas.equipment import EquipmentCreate, EquipmentResponse, EquipmentUpdate

router = APIRouter(prefix="/equipements", tags=["Equipements"])

PERIODE_JOURS = 30   # période de calcul des indicateurs de maintenance


@router.get("/", response_model=List[EquipmentResponse])
def get_equipements(db: Session = Depends(get_db)):
    return db.query(Equipment).all()


@router.get("/{id}", response_model=EquipmentResponse)
def get_equipement(id: int, db: Session = Depends(get_db)):
    eq = db.query(Equipment).filter(Equipment.id == id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Equipement non trouve")
    return eq


@router.post("/", response_model=EquipmentResponse, dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def create_equipement(eq: EquipmentCreate, db: Session = Depends(get_db)):
    new_eq = Equipment(**eq.model_dump())
    db.add(new_eq)
    db.commit()
    db.refresh(new_eq)
    return new_eq


@router.put("/{id}", response_model=EquipmentResponse, dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def update_equipement(id: int, eq: EquipmentUpdate, db: Session = Depends(get_db)):
    existing = db.query(Equipment).filter(Equipment.id == id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Equipement non trouve")
    for key, value in eq.model_dump(exclude_unset=True).items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/{id}", dependencies=[Depends(exiger_roles("admin"))])
def delete_equipement(id: int, db: Session = Depends(get_db)):
    equipement = db.query(Equipment).filter(Equipment.id == id).first()
    if not equipement:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    nb_capteurs = db.query(Sensor).filter(Sensor.equipement_id == id).count()
    if nb_capteurs > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer : {nb_capteurs} capteur(s) sont encore reliés à cet équipement"
        )

    db.delete(equipement)
    db.commit()
    return {"message": "Équipement supprimé"}


# ─────────────────────────────────────────────────────────────
# FICHE DE SUIVI D'ÉQUIPEMENT : toutes les données réelles d'une machine
# ─────────────────────────────────────────────────────────────

def _val(x):
    """Renvoie la valeur texte d'un Enum (ou la valeur telle quelle)."""
    return getattr(x, "value", x)


def _duree_minutes(i):
    """Durée réelle d'une intervention en minutes (None si début ou fin inconnus)."""
    if i.date_debut and i.date_fin:
        return max(0, round((i.date_fin - i.date_debut).total_seconds() / 60))
    return None


def _hors_seuil(capteur, valeur):
    """True si la valeur dépasse le seuil max ou passe sous le seuil min du capteur."""
    if capteur.seuil_max is not None and valeur > capteur.seuil_max:
        return True
    if capteur.seuil_min is not None and valeur < capteur.seuil_min:
        return True
    return False


@router.get("/{id}/fiche", dependencies=[Depends(get_current_user)])
def get_fiche_equipement(id: int, db: Session = Depends(get_db)):
    eq = db.query(Equipment).filter(Equipment.id == id).first()
    if not eq:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")

    debut_periode = datetime.now() - timedelta(days=PERIODE_JOURS)

    # 1. Capteurs, seuils et dernière mesure
    capteurs = []
    for c in db.query(Sensor).filter(Sensor.equipement_id == id).order_by(Sensor.id).all():
        derniere = db.query(SensorData).filter(SensorData.capteur_id == c.id).order_by(SensorData.id.desc()).first()
        if not c.actif:
            etat = "inactif"
        elif not derniere:
            etat = "inconnu"
        elif _hors_seuil(c, derniere.valeur):
            etat = "hors_seuil"
        else:
            etat = "normal"
        capteurs.append({
            "id": c.id, "type": c.type, "unite": c.unite, "actif": c.actif,
            "seuil_min": c.seuil_min, "seuil_max": c.seuil_max,
            "derniere_valeur": derniere.valeur if derniere else None,
            "derniere_date": derniere.timestamp if derniere else None,
            "etat": etat,
        })

    # 2. Alertes des 30 derniers jours, par sévérité
    alertes_periode = db.query(Alert).filter(Alert.equipement_id == id, Alert.created_at >= debut_periode).all()
    par_severite = {"critique": 0, "haute": 0, "moyenne": 0, "faible": 0}
    for a in alertes_periode:
        s = _val(a.severite)
        par_severite[s] = par_severite.get(s, 0) + 1

    dernieres = db.query(Alert).filter(Alert.equipement_id == id).order_by(Alert.created_at.desc()).limit(10).all()
    dernieres_alertes = [{
        "id": a.id, "type": a.type, "severite": _val(a.severite),
        "message": a.message, "created_at": a.created_at,
    } for a in dernieres]

    # 3. Historique des interventions (20 plus récentes)
    interventions = db.query(Intervention).filter(Intervention.equipement_id == id).order_by(Intervention.created_at.desc()).all()
    noms = {u.id: u.nom for u in db.query(User).all()}
    historique = [{
        "id": i.id, "type_intervention": _val(i.type_intervention), "priorite": _val(i.priorite),
        "statut": _val(i.statut), "description": i.description,
        "technicien": noms.get(i.technicien_id),
        "date": i.date_debut or i.date_intervention or i.created_at,
        "duree_minutes": _duree_minutes(i),
    } for i in interventions[:20]]

    # 4. Indicateurs de maintenance sur 30 jours
    #    Une « panne » = intervention corrective terminée, avec début et fin connus
    correctives = [
        i for i in interventions
        if _val(i.type_intervention) == "corrective" and _val(i.statut) == "terminee"
        and i.date_fin is not None and i.date_fin >= debut_periode and _duree_minutes(i) is not None
    ]
    arret_minutes = sum(_duree_minutes(i) for i in correctives)
    periode_minutes = PERIODE_JOURS * 24 * 60
    nb_pannes = len(correctives)

    indicateurs = {
        "periode_jours": PERIODE_JOURS,
        "nb_alertes": len(alertes_periode),
        "nb_interventions": len(interventions),
        "nb_terminees": sum(1 for i in interventions if _val(i.statut) == "terminee"),
        "nb_ouvertes": sum(1 for i in interventions if _val(i.statut) != "terminee"),
        "nb_pannes": nb_pannes,
        "temps_intervention_minutes": sum(_duree_minutes(i) or 0 for i in interventions),
        # MTTR : temps moyen de réparation
        "mttr_minutes": round(arret_minutes / nb_pannes) if nb_pannes else None,
        # MTBF : temps moyen de bon fonctionnement entre deux pannes
        "mtbf_heures": round((periode_minutes - arret_minutes) / nb_pannes / 60, 1) if nb_pannes else None,
        # Disponibilité : part du temps où la machine n'était pas en réparation
        "disponibilite": round((periode_minutes - arret_minutes) / periode_minutes * 100, 2),
    }

    return {
        "equipement": {
            "id": eq.id, "nom": eq.nom, "type": eq.type, "localisation": eq.localisation,
            "statut": _val(eq.statut), "date_installation": eq.date_installation, "created_at": eq.created_at,
        },
        "capteurs": capteurs,
        "alertes_par_severite": par_severite,
        "dernieres_alertes": dernieres_alertes,
        "interventions": historique,
        "indicateurs": indicateurs,
    }
