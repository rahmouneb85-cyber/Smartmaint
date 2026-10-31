from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from app.core.database import Base


class SaisieUsage(Base):
    """Utilisation de l'assistance à la saisie : sert à mesurer le taux d'acceptation des suggestions."""
    __tablename__ = "saisie_usages"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    type_aide = Column(String(20), nullable=False)        # suggestion | proposition | reformulation
    champ = Column(String(40), nullable=True)
    source = Column(String(20), nullable=True)             # historique | vocabulaire | modele
    accepte = Column(Boolean, nullable=False, default=True)
    caracteres_economises = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False)
