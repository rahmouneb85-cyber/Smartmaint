"""Configuration commune des tests automatisés.

Les tests utilisent une base SQLite temporaire, créée puis supprimée à chaque lancement :
la vraie base MySQL n'est jamais lue ni modifiée. Les services externes (Gemini, Ollama, Telegram,
webhooks) sont bloqués : aucun test ne peut envoyer de message ou consommer de quota.
Lancement (depuis le dossier backend) : python -m pytest
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

# ── 1. Environnement de test : défini AVANT l'import de l'application (les variables priment sur le .env) ──
DOSSIER_TEST = Path(tempfile.mkdtemp(prefix="smartmaint_tests_"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(DOSSIER_TEST / 'test.db').as_posix()}",
    "SECRET_KEY": "cle-de-test-uniquement-" + "x" * 40,
    "CLE_CHIFFREMENT": "",
    "ENVIRONNEMENT": "test",
    "SAUVEGARDE_AUTO_HEURES": "0",
    "GEMINI_API_KEY": "",
    "TELEGRAM_BOT_TOKEN": "",
    "TELEGRAM_CHAT_ID": "",
    "OLLAMA_URL": "http://127.0.0.1:9",
    "IOT_API_KEY": "cle-iot-de-test",
    "WHATSAPP_ENTREPRISE": "",
    "LIMITE_REQUETES_AUTH": "100000",
    "IDP_DOSSIER": str(DOSSIER_TEST / "documents_idp"),
    "SUPPORT_DOSSIER": str(DOSSIER_TEST / "captures_support"),
    "ROOM_DOSSIER": str(DOSSIER_TEST / "fichiers_rooms"),
    "DOSSIER_SAUVEGARDES": str(DOSSIER_TEST / "sauvegardes"),
})
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hacher_mot_de_passe  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.sensor import Sensor  # noqa: E402
from app.ml import anomalies  # noqa: E402

anomalies.DOSSIER = str(DOSSIER_TEST / "modeles_ia")      # les vrais modèles IA ne sont ni lus ni écrasés

MOT_DE_PASSE = "Test#2026secure"
COMPTES = {
    "admin": ("admin.test@smartmaint-test.com", "Admin Test"),
    "superviseur": ("superviseur.test@smartmaint-test.com", "Superviseur Test"),
    "technicien": ("technicien.test@smartmaint-test.com", "Technicien Test"),
}
CLE_IOT = os.environ["IOT_API_KEY"]


class ReseauBloque(Exception):
    pass


@pytest.fixture(autouse=True)
def bloquer_reseau(monkeypatch):
    """Aucun appel réseau réel pendant les tests (Gemini, Ollama, Telegram, webhooks)."""
    import requests

    def refuse(*args, **kwargs):
        raise requests.ConnectionError("réseau bloqué pendant les tests")
    monkeypatch.setattr(requests, "post", refuse)
    monkeypatch.setattr(requests, "get", refuse)
    monkeypatch.setattr(requests.Session, "request", refuse)


@pytest.fixture(scope="session", autouse=True)
def donnees_de_base():
    """Trois comptes (un par rôle), deux équipements et leurs capteurs."""
    db = SessionLocal()
    for role, (email, nom) in COMPTES.items():
        db.add(User(nom=nom, email=email, mot_de_passe=hacher_mot_de_passe(MOT_DE_PASSE), role=role, actif=True))
    pompe = Equipment(nom="Pompe test P01", type="pompe", localisation="Atelier A", statut="actif")
    moteur = Equipment(nom="Moteur test M01", type="moteur", localisation="Atelier B", statut="actif")
    db.add_all([pompe, moteur])
    db.commit()
    db.add_all([Sensor(equipement_id=pompe.id, type="temperature", unite="°C", seuil_min=10, seuil_max=85),
                Sensor(equipement_id=moteur.id, type="vibration", unite="mm/s", seuil_min=0, seuil_max=7)])
    db.commit()
    db.close()
    yield
    shutil.rmtree(DOSSIER_TEST, ignore_errors=True)


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


_jetons = {}


def connecter(client, role):
    """Connexion réelle par l'API ; le jeton est réutilisé pour accélérer les tests."""
    if role not in _jetons:
        email = COMPTES[role][0]
        r = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE})
        assert r.status_code == 200, r.text
        _jetons[role] = r.json()["access_token"]
    return {"Authorization": f"Bearer {_jetons[role]}"}


@pytest.fixture
def admin(client):
    return connecter(client, "admin")


@pytest.fixture
def superviseur(client):
    return connecter(client, "superviseur")


@pytest.fixture
def technicien(client):
    return connecter(client, "technicien")


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()
