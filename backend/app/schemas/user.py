import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from enum import Enum
from datetime import datetime


class RoleEnum(str, Enum):
    admin = "admin"
    technicien = "technicien"
    superviseur = "superviseur"


class UserBase(BaseModel):
    nom: str
    email: EmailStr
    role: RoleEnum = RoleEnum.technicien


def verifier_robustesse(mot_de_passe: str) -> str:
    """Politique de mot de passe : 8 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial."""
    manques = []
    if len(mot_de_passe) < 8:
        manques.append("8 caractères minimum")
    if len(mot_de_passe) > 72:
        manques.append("72 caractères maximum")   # limite de bcrypt
    if not re.search(r"[A-Z]", mot_de_passe):
        manques.append("une majuscule")
    if not re.search(r"[a-z]", mot_de_passe):
        manques.append("une minuscule")
    if not re.search(r"\d", mot_de_passe):
        manques.append("un chiffre")
    if not re.search(r"[^A-Za-z0-9]", mot_de_passe):
        manques.append("un caractère spécial")
    if manques:
        raise ValueError("Mot de passe trop faible : " + ", ".join(manques))
    return mot_de_passe


class UserCreate(UserBase):
    mot_de_passe: str

    @field_validator("nom")
    @classmethod
    def nom_valide(cls, v: str) -> str:
        v = v.strip()
        if not 2 <= len(v) <= 100:
            raise ValueError("Le nom doit contenir entre 2 et 100 caractères")
        return v

    @field_validator("mot_de_passe")
    @classmethod
    def mot_de_passe_robuste(cls, v: str) -> str:
        return verifier_robustesse(v)


class UserResponse(UserBase):
    id: int
    actif: bool
    created_at: datetime
    totp_actif: bool = False
    telephone: Optional[str] = None
    telephone_visible: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserLogin(BaseModel):
    email: EmailStr
    mot_de_passe: str


class Token(BaseModel):
    access_token: str
    token_type: str
