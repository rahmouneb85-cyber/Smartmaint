from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, Text, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class RoleEnum(str, enum.Enum):
    admin = "admin"
    technicien = "technicien"
    superviseur = "superviseur"


class User(Base):
    __tablename__ = "utilisateurs"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    mot_de_passe = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.technicien)
    actif = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # ── Double authentification (2FA) ──
    totp_secret = Column(String(255), nullable=True)      # secret TOTP chiffré (jamais stocké en clair)
    totp_actif = Column(Boolean, nullable=False, default=False)
    totp_dernier_pas = Column(BigInteger, nullable=True)  # dernier code utilisé : empêche de rejouer un code
    codes_secours = Column(Text, nullable=True)           # empreintes SHA-256 des codes de secours (JSON)

    # ── Coordonnées WhatsApp (partagées seulement avec l'accord de l'utilisateur) ──
    telephone = Column(String(20), nullable=True)          # format international, chiffres seulement
    telephone_visible = Column(Boolean, nullable=False, default=False)
