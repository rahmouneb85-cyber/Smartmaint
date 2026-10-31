from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index
from app.core.database import Base


class CopiloteDocument(Base):
    """Base de connaissances du copilote (RAG) : textes découpés et leurs vecteurs."""
    __tablename__ = "copilote_documents"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String(30), nullable=False)      # intervention, equipement, document...
    source_id = Column(Integer, nullable=True)
    titre = Column(String(255), nullable=False)
    texte = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)               # vecteur JSON (null si aucun modèle d'embeddings)
    maj = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_copilote_doc_source", "source_type", "source_id"),)


class CopiloteAction(Base):
    """Action proposée par l'agent, exécutée seulement après confirmation de l'utilisateur."""
    __tablename__ = "copilote_actions"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    type_action = Column(String(50), nullable=False)
    parametres = Column(Text, nullable=False)              # JSON
    resume = Column(String(500), nullable=False)
    statut = Column(String(20), nullable=False, default="en_attente")   # en_attente | confirmee | annulee | echec
    resultat = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False)
    traitee_le = Column(DateTime, nullable=True)


class CopiloteEchange(Base):
    """Journal des questions posées au copilote : traçabilité et mesure de la qualité."""
    __tablename__ = "copilote_echanges"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    question = Column(Text, nullable=False)
    reponse = Column(Text, nullable=True)
    outils = Column(Text, nullable=True)                   # JSON : outils appelés et durées
    fournisseur = Column(String(30), nullable=True)
    modele = Column(String(80), nullable=True)
    duree_ms = Column(Integer, nullable=True)
    avis = Column(Integer, nullable=True)                  # 1 utile, -1 pas utile
    created_at = Column(DateTime, nullable=False)
