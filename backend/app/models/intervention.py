from sqlalchemy import Column, Integer, Text, Enum, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class StatutInterventionEnum(str, enum.Enum):
    planifiee = "planifiee"
    en_cours = "en_cours"
    terminee = "terminee"


class TypeInterventionEnum(str, enum.Enum):
    corrective = "corrective"    # réparation après une panne ou une alerte
    preventive = "preventive"    # entretien planifié pour éviter une panne


class PrioriteEnum(str, enum.Enum):
    basse = "basse"
    normale = "normale"
    haute = "haute"
    urgente = "urgente"


class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(Integer, primary_key=True, index=True)
    equipement_id = Column(Integer, ForeignKey("equipements.id"))
    technicien_id = Column(Integer, ForeignKey("utilisateurs.id"))
    alerte_id = Column(Integer, ForeignKey("alertes.id", ondelete="SET NULL"), nullable=True)

    # Ordre d'intervention
    type_intervention = Column(Enum(TypeInterventionEnum), default=TypeInterventionEnum.corrective, nullable=False)
    priorite = Column(Enum(PrioriteEnum), default=PrioriteEnum.normale, nullable=False)
    description = Column(Text)
    statut = Column(Enum(StatutInterventionEnum), default=StatutInterventionEnum.planifiee)
    date_intervention = Column(DateTime)            # date prévue

    # Compte rendu (fiche d'intervention)
    date_debut = Column(DateTime, nullable=True)    # début réel du travail
    date_fin = Column(DateTime, nullable=True)      # fin réelle du travail
    diagnostic = Column(Text, nullable=True)
    actions_realisees = Column(Text, nullable=True)
    pieces_remplacees = Column(Text, nullable=True)
    observations = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    equipement = relationship("Equipment", back_populates="interventions")
    technicien = relationship("User", foreign_keys=[technicien_id])
