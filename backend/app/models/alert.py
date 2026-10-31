from sqlalchemy import Column, Integer, String, Boolean, Enum, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class SeveriteEnum(str, enum.Enum):
    faible = "faible"
    moyenne = "moyenne"
    haute = "haute"
    critique = "critique"

class Alert(Base):
    __tablename__ = "alertes"

    id = Column(Integer, primary_key=True, index=True)
    equipement_id = Column(Integer, ForeignKey("equipements.id"))
    capteur_id = Column(Integer, ForeignKey("capteurs.id", ondelete="SET NULL"), nullable=True)
    type = Column(String(100), nullable=False)
    severite = Column(Enum(SeveriteEnum), default=SeveriteEnum.moyenne)
    message = Column(Text)
    acquittee = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    equipement = relationship("Equipment", back_populates="alertes")
