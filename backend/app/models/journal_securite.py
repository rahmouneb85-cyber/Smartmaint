from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from app.core.database import Base


class JournalSecurite(Base):
    """Journal des événements de sécurité : connexions, échecs, blocages, créations de comptes..."""
    __tablename__ = "journal_securite"

    id = Column(Integer, primary_key=True, index=True)
    evenement = Column(String(50), nullable=False)       # connexion_reussie, echec_connexion, connexion_bloquee...
    email = Column(String(150), nullable=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    ip = Column(String(45), nullable=True)                # 45 caractères : adresses IPv6 comprises
    navigateur = Column(String(255), nullable=True)       # en-tête User-Agent
    details = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (
        Index("ix_journal_email_date", "email", "created_at"),
        Index("ix_journal_ip_date", "ip", "created_at"),
    )
