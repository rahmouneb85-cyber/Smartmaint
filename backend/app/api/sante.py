"""Santé du système : un contrôle rapide de chaque composant, pour diagnostiquer une panne en un coup d'œil.

GET /api/v1/sante  (administrateur ou superviseur)
Chaque composant renvoie un état « ok », « attention » (fonctionne en mode dégradé) ou « panne ».
"""
import shutil
import time
from datetime import datetime
from pathlib import Path

import requests
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import exiger_roles

router = APIRouter(prefix="/sante", tags=["Santé du système"], dependencies=[Depends(exiger_roles("admin", "superviseur"))])

DEMARRAGE = datetime.now()
BACKEND = Path(__file__).resolve().parents[2]


def _composant(nom, etat, message, **details):
    return {"composant": nom, "etat": etat, "message": message, **details}


def _base(db: Session):
    t0 = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        return _composant("Base de données", "panne", f"Inaccessible : {e.__class__.__name__}")
    ms = round((time.perf_counter() - t0) * 1000, 1)
    return _composant("Base de données", "ok" if ms < 200 else "attention", f"Répond en {ms} ms", duree_ms=ms)


def _moteur():
    from app.workflows import moteur
    if not moteur.ETAT["actif"]:
        return _composant("Moteur des workflows", "panne", "Arrêté")
    dernier = moteur.ETAT["dernier_tour"]
    if dernier is None:
        return _composant("Moteur des workflows", "attention", "Démarré, premier passage en attente")
    age = (datetime.now() - dernier).total_seconds()
    if age > 3 * moteur.INTERVALLE:
        return _composant("Moteur des workflows", "panne", f"Aucun passage depuis {int(age)} s")
    erreur = moteur.ETAT.get("derniere_erreur")
    return _composant("Moteur des workflows", "attention" if erreur else "ok",
                      f"Dernier passage il y a {int(age)} s" + (f" · dernière erreur : {erreur}" if erreur else ""))


def _sauvegardes():
    if settings.SAUVEGARDE_AUTO_HEURES <= 0:
        return _composant("Sauvegardes", "attention", "Sauvegarde automatique désactivée")
    dossier = Path(settings.DOSSIER_SAUVEGARDES)
    if not dossier.is_absolute():
        dossier = BACKEND / dossier
    fichiers = sorted(dossier.glob("smartmaint_*.sql.gz.enc"), key=lambda f: f.stat().st_mtime) if dossier.exists() else []
    if not fichiers:
        return _composant("Sauvegardes", "panne", "Aucune sauvegarde trouvée")
    heures = (time.time() - fichiers[-1].stat().st_mtime) / 3600
    etat = "ok" if heures <= settings.SAUVEGARDE_AUTO_HEURES * 1.5 else "attention"
    return _composant("Sauvegardes", etat, f"Dernière sauvegarde il y a {heures:.1f} h ({len(fichiers)} conservées)")


def _modele_langage():
    if settings.GEMINI_API_KEY:
        return _composant("Modèle de langage", "ok", f"Gemini configuré ({settings.GEMINI_MODEL})")
    try:
        r = requests.get(f"{settings.OLLAMA_URL}/api/tags", timeout=2)
        modeles = [m.get("name") for m in r.json().get("models", [])]
        return _composant("Modèle de langage", "ok", f"Ollama local : {len(modeles)} modèle(s)")
    except Exception:
        return _composant("Modèle de langage", "attention",
                          "Aucun modèle disponible : le copilote et les propositions IA fonctionnent en mode réduit")


def _telegram():
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        return _composant("Notifications Telegram", "ok", "Configurées")
    return _composant("Notifications Telegram", "attention", "Non configurées : aucune alerte ne sera envoyée")


def _modeles_ia():
    from app.ml import anomalies
    n = len(list(Path(anomalies.DOSSIER).glob("capteur_*.joblib"))) if Path(anomalies.DOSSIER).exists() else 0
    return _composant("Modèles de détection d'anomalies", "ok" if n else "attention",
                      f"{n} capteur(s) avec un modèle entraîné" if n else "Aucun modèle entraîné")


def _disque():
    libre = shutil.disk_usage(BACKEND).free / 1024 ** 3
    return _composant("Espace disque", "ok" if libre > 2 else "attention" if libre > 0.5 else "panne", f"{libre:.1f} Go libres")


@router.get("")
def sante(db: Session = Depends(get_db)):
    composants = []
    for controle in (lambda: _base(db), _moteur, _sauvegardes, _modele_langage, _telegram, _modeles_ia, _disque):
        try:
            composants.append(controle())
        except Exception as e:                       # un contrôle défaillant ne masque pas les autres
            composants.append(_composant(getattr(controle, "__name__", "?"), "panne", f"Contrôle impossible : {e.__class__.__name__}"))
    etats = {c["etat"] for c in composants}
    return {"etat": "panne" if "panne" in etats else "attention" if "attention" in etats else "ok",
            "version": "1.4.0", "demarre_le": DEMARRAGE, "depuis_secondes": int((datetime.now() - DEMARRAGE).total_seconds()),
            "composants": composants}
