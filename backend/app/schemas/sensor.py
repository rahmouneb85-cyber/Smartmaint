from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class SensorBase(BaseModel):
    equipement_id: int
    type: str
    unite: Optional[str] = None
    actif: bool = True
    seuil_min: Optional[float] = None
    seuil_max: Optional[float] = None

class SensorCreate(SensorBase):
    pass

class SensorUpdate(BaseModel):
    equipement_id: Optional[int] = None
    type: Optional[str] = None
    unite: Optional[str] = None
    actif: Optional[bool] = None
    seuil_min: Optional[float] = None
    seuil_max: Optional[float] = None

class SensorResponse(SensorBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class SensorDataCreate(BaseModel):
    capteur_id: int
    valeur: float

class SensorDataResponse(BaseModel):
    id: int
    capteur_id: int
    valeur: float
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
