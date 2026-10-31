from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Sensor(Base):
    __tablename__ = "capteurs"

    id = Column(Integer, primary_key=True, index=True)
    equipement_id = Column(Integer, ForeignKey("equipements.id"))
    type = Column(String(100), nullable=False)
    unite = Column(String(20))
    actif = Column(Boolean, default=True)
    seuil_min = Column(Float, nullable=True)
    seuil_max = Column(Float, nullable=True)

    equipement = relationship("Equipment", back_populates="capteurs")
    donnees = relationship("SensorData", back_populates="capteur")
