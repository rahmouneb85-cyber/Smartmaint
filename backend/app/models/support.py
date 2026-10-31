from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.core.database import Base


class DemandeSupport(Base):
    """Demande d'assistance envoyée depuis le bouton flottant « Support ».
    Visible par son auteur et par les administrateurs et superviseurs uniquement."""
    __tablename__ = "demandes_support"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    sujet = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    categorie = Column(String(20), nullable=False, default="probleme")   # probleme | question | amelioration
    page = Column(String(40), nullable=True)                              # page affichée au moment de la demande
    navigateur = Column(String(255), nullable=True)                       # aide au diagnostic (navigateur, taille d'écran)
    capture = Column(String(80), nullable=True)                           # nom du fichier image, réencodé par le serveur
    statut = Column(String(20), nullable=False, default="ouverte")        # ouverte | en_cours | resolue | fermee
    vue_par_auteur = Column(Boolean, nullable=False, default=True)        # False : réponse ou changement non encore lu
    created_at = Column(DateTime, nullable=False)
    maj = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_support_utilisateur", "utilisateur_id", "statut"),)


class ReponseSupport(Base):
    __tablename__ = "reponses_support"

    id = Column(Integer, primary_key=True, index=True)
    demande_id = Column(Integer, ForeignKey("demandes_support.id", ondelete="CASCADE"), nullable=False, index=True)
    auteur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    texte = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
