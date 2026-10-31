"""Toutes les tables de SmartMaint, importées ici pour être enregistrées en un seul endroit
(Base.metadata.create_all dans main.py crée ainsi chaque table manquante)."""
from app.models.alert import Alert
from app.models.appareil import Appareil
from app.models.copilote import CopiloteAction, CopiloteDocument, CopiloteEchange
from app.models.document_idp import DocumentIDP
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.journal_securite import JournalSecurite
from app.models.messagerie import Conversation, Message, Participant
from app.models.notification import DemandeContact, Notification
from app.models.parametre import Parametre, PreferenceUtilisateur
from app.models.room import FichierSalle, MembreSalle, MessageSalle, Salle
from app.models.saisie_usage import SaisieUsage
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.session_utilisateur import SessionUtilisateur
from app.models.support import DemandeSupport, ReponseSupport
from app.models.user import User
from app.models.workflow import Workflow, WorkflowEtat, WorkflowExecution

__all__ = ["Alert", "Appareil", "Conversation", "Message", "Participant", "DemandeContact", "Notification", "Parametre", "PreferenceUtilisateur", "CopiloteAction", "CopiloteDocument", "CopiloteEchange", "DocumentIDP", "Equipment",
           "Intervention", "JournalSecurite", "FichierSalle", "MembreSalle", "MessageSalle", "Salle", "SaisieUsage", "Sensor", "SensorData", "SessionUtilisateur", "DemandeSupport", "ReponseSupport", "User",
           "Workflow", "WorkflowEtat", "WorkflowExecution"]
