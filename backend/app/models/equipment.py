from sqlalchemy import Column, Integer, String, Enum, Date, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class StatutEnum(str, enum.Enum):
    actif = "actif"
    maintenance = "maintenance"
    panne = "panne"

class Equipment(Base):
    __tablename__ = "equipements"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    type = Column(String(100))
    localisation = Column(String(200))
    statut = Column(Enum(StatutEnum), default=StatutEnum.actif)
    date_installation = Column(Date)
    created_at = Column(DateTime, server_default=func.now())

    capteurs = relationship("Sensor", back_populates="equipement")
    alertes = relationship("Alert", back_populates="equipement")
    interventions = relationship("Intervention", back_populates="equipement")
