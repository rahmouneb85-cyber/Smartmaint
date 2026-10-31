from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, UniqueConstraint, Index
from app.core.database import Base


class Workflow(Base):
    """Règle d'automatisation : QUAND (déclencheur) … SI (filtres) … ALORS (actions)."""
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(150), nullable=False)
    description = Column(String(500), nullable=True)
    actif = Column(Boolean, nullable=False, default=True)
    declencheur = Column(Text, nullable=False)            # JSON : {"type": ..., "params": {...}}
    actions = Column(Text, nullable=False)                # JSON : [{"type": ..., "params": {...}, "en_cas_erreur": ..., "tentatives": 3}]
    max_par_heure = Column(Integer, nullable=False, default=20)
    echecs_consecutifs = Column(Integer, nullable=False, default=0)
    prochaine_execution = Column(DateTime, nullable=True)  # déclencheur planifié
    derniere_execution = Column(DateTime, nullable=True)
    desactive_raison = Column(String(300), nullable=True)
    cree_par = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    maj = Column(DateTime, nullable=False, default=datetime.now, onupdate=datetime.now)


class WorkflowExecution(Base):
    """Une exécution d'un workflow, avec le détail de chaque étape (journal consultable et rejouable)."""
    __tablename__ = "workflow_executions"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    cle = Column(String(190), nullable=False)             # identifiant de l'événement : empêche de le traiter deux fois
    evenement = Column(Text, nullable=False)              # JSON : contexte de l'événement
    statut = Column(String(20), nullable=False)           # en_cours | succes | partiel | echec | limite
    etapes = Column(Text, nullable=True)                  # JSON : [{action, statut, message, tentatives, duree_ms}]
    erreur = Column(String(500), nullable=True)
    origine = Column(String(20), nullable=False, default="automatique")   # automatique | manuelle | relance
    debut = Column(DateTime, nullable=False, default=datetime.now)
    fin = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("workflow_id", "cle", name="uq_workflow_cle"),
                      Index("ix_wf_exec_debut", "workflow_id", "debut"))


class WorkflowEtat(Base):
    """Curseurs du moteur (dernier événement traité), pour reprendre au bon endroit après un redémarrage."""
    __tablename__ = "workflow_etat"

    cle = Column(String(50), primary_key=True)
    valeur = Column(String(50), nullable=False)
