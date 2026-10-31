from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.core.database import Base


class Notification(Base):
    """Notification destinée à UN utilisateur : chaque ligne appartient à un seul compte (isolation des données)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)          # alerte | intervention | workflow | contact | systeme
    niveau = Column(String(15), nullable=False, default="info")   # info | attention | critique
    titre = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    donnees = Column(Text, nullable=True)              # JSON : modèle et valeurs, pour traduire le titre dans la langue de l'interface
    page = Column(String(40), nullable=True)            # page de l'application à ouvrir
    objet_id = Column(Integer, nullable=True)           # alerte, intervention… concernée
    cle = Column(String(120), nullable=True)            # regroupement des événements répétés
    nombre = Column(Integer, nullable=False, default=1) # nombre d'événements regroupés
    lue = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_notif_utilisateur_lue", "utilisateur_id", "lue", "created_at"),)


class DemandeContact(Base):
    """Message envoyé depuis les pages publiques (avant connexion)."""
    __tablename__ = "demandes_contact"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    langue = Column(String(5), nullable=True)
    ip = Column(String(64), nullable=True)
    traitee = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)
