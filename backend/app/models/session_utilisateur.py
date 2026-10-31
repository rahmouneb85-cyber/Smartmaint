from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.core.database import Base


class SessionUtilisateur(Base):
    """Une session = une connexion active d'un utilisateur sur un appareil."""
    __tablename__ = "sessions_utilisateurs"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False, index=True)
    appareil_id = Column(Integer, ForeignKey("appareils.id", ondelete="SET NULL"), nullable=True)
    # jeton de renouvellement : seule son empreinte SHA-256 est stockée, jamais le jeton lui-même
    hash_refresh = Column(String(64), unique=True, nullable=False)
    ancien_hash_refresh = Column(String(64), nullable=True, index=True)   # pour détecter la réutilisation d'un jeton volé
    rotation_le = Column(DateTime, nullable=True)
    ip = Column(String(45), nullable=True)
    navigateur = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False)
    derniere_activite = Column(DateTime, nullable=False)
    expire_le = Column(DateTime, nullable=False)
    revoquee_le = Column(DateTime, nullable=True)
    raison_revocation = Column(String(100), nullable=True)
