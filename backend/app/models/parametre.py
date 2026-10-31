from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class Parametre(Base):
    """Réglage de l'application enregistré par l'administrateur (valeur JSON).
    Exemples : personnalisation des boutons flottants, contacts autorisés de la messagerie."""
    __tablename__ = "parametres_application"

    cle = Column(String(60), primary_key=True)
    valeur = Column(Text, nullable=False)
    maj = Column(DateTime, nullable=False)
    maj_par = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)


class PreferenceUtilisateur(Base):
    """Préférences d'affichage d'un utilisateur (boutons masqués pour lui, actions rapides favorites…).
    Une seule ligne par compte, lue et modifiée uniquement par ce compte."""
    __tablename__ = "preferences_utilisateur"

    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), primary_key=True)
    valeur = Column(Text, nullable=False)
    maj = Column(DateTime, nullable=False)
