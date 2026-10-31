from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import exiger_roles, get_current_user
from app.models.intervention import Intervention
from app.models.equipment import Equipment
from app.models.user import User
from app.models.alert import Alert
from app.schemas.intervention import InterventionCreate, InterventionUpdate, InterventionResponse

router = APIRouter(
    prefix="/interventions",
    tags=["Interventions"],
    dependencies=[Depends(get_current_user)]
)


def verifier_references(db: Session, equipement_id=None, technicien_id=None, alerte_id=None):
    """Vérifie que l'équipement, le technicien et l'alerte envoyés existent vraiment."""
    if equipement_id is not None and not db.query(Equipment).filter(Equipment.id == equipement_id).first():
        raise HTTPException(status_code=400, detail="Équipement introuvable")
    if technicien_id:
        tech = db.query(User).filter(User.id == technicien_id).first()
        if not tech:
            raise HTTPException(status_code=400, detail="Technicien introuvable")
    if alerte_id and not db.query(Alert).filter(Alert.id == alerte_id).first():
        raise HTTPException(status_code=400, detail="Alerte introuvable")


def appliquer_statut(intervention: Intervention, db: Session):
    """Automatisations liées au statut :
    - en cours  → l'équipement passe en maintenance, la date de début est enregistrée
    - terminée  → l'équipement redevient actif, la date de fin est enregistrée"""
    equipement = db.query(Equipment).filter(Equipment.id == intervention.equipement_id).first()
    statut = getattr(intervention.statut, "value", intervention.statut)
    if statut == "en_cours":
        if equipement:
            equipement.statut = "maintenance"
        if not intervention.date_debut:
            intervention.date_debut = datetime.now()
    elif statut == "terminee":
        if equipement:
            equipement.statut = "actif"
        if not intervention.date_debut:
            intervention.date_debut = intervention.date_intervention or datetime.now()
        if not intervention.date_fin:
            intervention.date_fin = datetime.now()


# Liste des techniciens ACTIFS uniquement (plus les admins ni les comptes désactivés)
@router.get("/techniciens")
def get_techniciens(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role == "technicien", User.actif == True).all()
    return [{"id": u.id, "nom": u.nom} for u in users]


@router.get("/", response_model=List[InterventionResponse])
def get_interventions(db: Session = Depends(get_db)):
    return db.query(Intervention).order_by(Intervention.created_at.desc()).all()


@router.get("/{id}", response_model=InterventionResponse)
def get_intervention(id: int, db: Session = Depends(get_db)):
    intervention = db.query(Intervention).filter(Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    return intervention


# Toutes les données réelles nécessaires au document (ordre ou fiche d'intervention)
@router.get("/{id}/document")
def get_document(id: int, db: Session = Depends(get_db)):
    i = db.query(Intervention).filter(Intervention.id == id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")

    equipement = db.query(Equipment).filter(Equipment.id == i.equipement_id).first()
    technicien = db.query(User).filter(User.id == i.technicien_id).first() if i.technicien_id else None
    alerte = db.query(Alert).filter(Alert.id == i.alerte_id).first() if i.alerte_id else None

    duree_minutes = None
    if i.date_debut and i.date_fin:
        duree_minutes = max(0, round((i.date_fin - i.date_debut).total_seconds() / 60))

    return {
        "intervention": InterventionResponse.model_validate(i).model_dump(),
        "equipement": {
            "nom": equipement.nom, "type": getattr(equipement, "type", None),
            "localisation": getattr(equipement, "localisation", None),
            "statut": getattr(equipement.statut, "value", equipement.statut),
        } if equipement else None,
        "technicien": {"nom": technicien.nom, "email": technicien.email} if technicien else None,
        "alerte": {
            "id": alerte.id, "type": alerte.type,
            "severite": getattr(alerte.severite, "value", alerte.severite),
            "message": alerte.message, "created_at": alerte.created_at,
        } if alerte else None,
        "duree_minutes": duree_minutes,
    }


@router.post("/", response_model=InterventionResponse)
def create_intervention(data: InterventionCreate, db: Session = Depends(get_db)):
    verifier_references(db, data.equipement_id, data.technicien_id, data.alerte_id)
    intervention = Intervention(**data.model_dump())
    db.add(intervention)
    appliquer_statut(intervention, db)
    db.commit()
    db.refresh(intervention)
    return intervention


@router.put("/{id}", response_model=InterventionResponse)
def update_intervention(id: int, data: InterventionUpdate, db: Session = Depends(get_db)):
    intervention = db.query(Intervention).filter(Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")

    champs = data.model_dump(exclude_unset=True)   # seuls les champs envoyés sont modifiés
    verifier_references(db, champs.get("equipement_id"), champs.get("technicien_id"), champs.get("alerte_id"))

    # Une intervention ne peut pas être terminée sans compte rendu
    ancien_statut = getattr(intervention.statut, "value", intervention.statut)
    nouveau_statut = champs.get("statut", ancien_statut)
    nouveau_statut = getattr(nouveau_statut, "value", nouveau_statut)
    actions = champs.get("actions_realisees", intervention.actions_realisees)
    if nouveau_statut == "terminee" and ancien_statut != "terminee" and not (actions or "").strip():
        raise HTTPException(status_code=400, detail="Compte rendu obligatoire : indiquez les actions réalisées")

    for key, value in champs.items():
        setattr(intervention, key, value)
    appliquer_statut(intervention, db)
    db.commit()
    db.refresh(intervention)
    return intervention


@router.delete("/{id}", dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def delete_intervention(id: int, db: Session = Depends(get_db)):
    intervention = db.query(Intervention).filter(Intervention.id == id).first()
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    db.delete(intervention)
    db.commit()
    return {"message": "Intervention supprimée avec succès"}
