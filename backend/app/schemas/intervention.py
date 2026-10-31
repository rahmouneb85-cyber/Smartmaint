from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from enum import Enum


class StatutIntervention(str, Enum):
    planifiee = "planifiee"
    en_cours = "en_cours"
    terminee = "terminee"


class TypeIntervention(str, Enum):
    corrective = "corrective"
    preventive = "preventive"


class Priorite(str, Enum):
    basse = "basse"
    normale = "normale"
    haute = "haute"
    urgente = "urgente"


class InterventionCreate(BaseModel):
    equipement_id: int
    technicien_id: Optional[int] = None
    alerte_id: Optional[int] = None
    type_intervention: TypeIntervention = TypeIntervention.corrective
    priorite: Priorite = Priorite.normale
    description: str
    statut: StatutIntervention = StatutIntervention.planifiee
    date_intervention: Optional[datetime] = None


# Modification partielle : seuls les champs envoyés sont modifiés
class InterventionUpdate(BaseModel):
    equipement_id: Optional[int] = None
    technicien_id: Optional[int] = None
    alerte_id: Optional[int] = None
    type_intervention: Optional[TypeIntervention] = None
    priorite: Optional[Priorite] = None
    description: Optional[str] = None
    statut: Optional[StatutIntervention] = None
    date_intervention: Optional[datetime] = None
    date_debut: Optional[datetime] = None
    date_fin: Optional[datetime] = None
    diagnostic: Optional[str] = None
    actions_realisees: Optional[str] = None
    pieces_remplacees: Optional[str] = None
    observations: Optional[str] = None


class InterventionResponse(BaseModel):
    id: int
    equipement_id: Optional[int] = None
    technicien_id: Optional[int] = None
    alerte_id: Optional[int] = None
    type_intervention: Optional[TypeIntervention] = None
    priorite: Optional[Priorite] = None
    description: Optional[str] = None
    statut: StatutIntervention
    date_intervention: Optional[datetime] = None
    date_debut: Optional[datetime] = None
    date_fin: Optional[datetime] = None
    diagnostic: Optional[str] = None
    actions_realisees: Optional[str] = None
    pieces_remplacees: Optional[str] = None
    observations: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
