from pydantic import BaseModel, ConfigDict
from enum import Enum
from typing import Optional
from datetime import datetime

class SeveriteEnum(str, Enum):
    faible = "faible"
    moyenne = "moyenne"
    haute = "haute"
    critique = "critique"

class AlertBase(BaseModel):
    equipement_id: int
    type: str
    severite: SeveriteEnum = SeveriteEnum.moyenne
    message: Optional[str] = None

class AlertCreate(AlertBase):
    pass

class AlertResponse(AlertBase):
    id: int
    acquittee: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AlertUpdate(BaseModel):
    acquittee: Optional[bool] = None
