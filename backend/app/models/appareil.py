from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from app.core.database import Base


class Appareil(Base):
    """Appareil (ordinateur, téléphone...) depuis lequel un utilisateur s'est connecté."""
    __tablename__ = "appareils"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False, index=True)
    empreinte = Column(String(64), nullable=False)          # SHA-256 de l'identifiant envoyé par le navigateur
    nom = Column(String(120), nullable=True)                 # ex. « Chrome sur Windows »
    systeme = Column(String(50), nullable=True)
    navigateur = Column(String(50), nullable=True)
    statut = Column(String(20), nullable=False, default="autorise")   # autorise | bloque
    premiere_connexion = Column(DateTime, nullable=False)
    derniere_connexion = Column(DateTime, nullable=False)
    derniere_ip = Column(String(45), nullable=True)
    localisation = Column(String(100), nullable=True)        # volontairement approximative

    __table_args__ = (UniqueConstraint("utilisateur_id", "empreinte", name="uq_appareil_utilisateur"),)
