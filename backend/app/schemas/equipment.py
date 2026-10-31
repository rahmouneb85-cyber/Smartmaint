from pydantic import BaseModel, ConfigDict
from enum import Enum
from typing import Optional
from datetime import date, datetime

class StatutEnum(str, Enum):
    actif = "actif"
    maintenance = "maintenance"
    panne = "panne"

class EquipmentBase(BaseModel):
    nom: str
    type: Optional[str] = None
    localisation: Optional[str] = None
    statut: StatutEnum = StatutEnum.actif
    date_installation: Optional[date] = None

class EquipmentCreate(EquipmentBase):
    pass

class EquipmentUpdate(BaseModel):
    nom: Optional[str] = None
    type: Optional[str] = None
    localisation: Optional[str] = None
    statut: Optional[StatutEnum] = None

class EquipmentResponse(EquipmentBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
