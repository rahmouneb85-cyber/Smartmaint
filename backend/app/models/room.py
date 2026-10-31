from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint

from app.core.database import Base


class Salle(Base):
    """Salle « Room Live » : réunion audio/vidéo avec chat. Accessible à ses seuls membres."""
    __tablename__ = "rooms_salles"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    createur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)          # False : réunion terminée par l'hôte
    created_at = Column(DateTime, nullable=False)
    maj = Column(DateTime, nullable=False)


class MembreSalle(Base):
    """Rôle et statut d'un utilisateur dans une salle.
    role   : hote | moderateur | participant
    statut : invite (pas encore entré) | membre | bloque (ne peut plus entrer ni être réinvité sans déblocage)"""
    __tablename__ = "rooms_membres"

    id = Column(Integer, primary_key=True)
    salle_id = Column(Integer, ForeignKey("rooms_salles.id", ondelete="CASCADE"), nullable=False)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False, default="participant")
    statut = Column(String(20), nullable=False, default="invite")
    invite_par = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (UniqueConstraint("salle_id", "utilisateur_id", name="uq_membre_salle"),
                      Index("ix_membre_utilisateur", "utilisateur_id"))


class MessageSalle(Base):
    """Message du chat d'une salle (ou message système : entrée, sortie, retrait…)."""
    __tablename__ = "rooms_messages"

    id = Column(Integer, primary_key=True, index=True)
    salle_id = Column(Integer, ForeignKey("rooms_salles.id", ondelete="CASCADE"), nullable=False)
    auteur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(20), nullable=False, default="texte")      # texte | systeme | fichier
    texte = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_message_salle", "salle_id", "id"),)


class FichierSalle(Base):
    """Fichier ou document partagé dans une salle. Lié au message du chat qui l'annonce."""
    __tablename__ = "rooms_fichiers"

    id = Column(Integer, primary_key=True, index=True)
    salle_id = Column(Integer, ForeignKey("rooms_salles.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("rooms_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    auteur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    nom = Column(String(200), nullable=False)               # nom d'origine, nettoyé
    chemin = Column(String(80), nullable=False)             # nom aléatoire sur le disque
    type_mime = Column(String(100), nullable=False)
    taille = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False)
