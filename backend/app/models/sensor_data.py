from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class SensorData(Base):
    __tablename__ = "donnees_capteurs"

    id = Column(Integer, primary_key=True, index=True)
    capteur_id = Column(Integer, ForeignKey("capteurs.id"))
    valeur = Column(Float, nullable=False)
    timestamp = Column(DateTime, server_default=func.now())

    capteur = relationship("Sensor", back_populates="donnees")
