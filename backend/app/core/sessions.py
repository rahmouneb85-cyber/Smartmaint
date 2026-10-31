"""Outils communs pour les sessions, les appareils et le journal de sécurité."""
import hashlib
import ipaddress
import re
import secrets
import threading
from datetime import datetime, timedelta
from typing import Optional

import requests
from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.appareil import Appareil
from app.models.journal_securite import JournalSecurite
from app.models.session_utilisateur import SessionUtilisateur


def sha256(texte: str) -> str:
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()


def ip_client(request: Request) -> str:
    return request.client.host if request.client else "inconnue"


# ─────────────────────────────────────────────────────────────
# INFORMATIONS TECHNIQUES SUR L'APPAREIL
# ─────────────────────────────────────────────────────────────
def analyser_navigateur(user_agent: str) -> tuple:
    """Renvoie (système, navigateur) à partir de l'en-tête User-Agent."""
    ua = user_agent or ""
    if "Windows" in ua:
        systeme = "Windows"
    elif "Android" in ua:
        systeme = "Android"
    elif re.search(r"iPhone|iPad|iPod", ua):
        systeme = "iOS"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        systeme = "macOS"
    elif "Linux" in ua:
        systeme = "Linux"
    else:
        systeme = "Inconnu"
    if "Edg/" in ua:
        navigateur = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        navigateur = "Opera"
    elif "Firefox/" in ua:
        navigateur = "Firefox"
    elif "Chrome/" in ua:
        navigateur = "Chrome"
    elif "Safari/" in ua:
        navigateur = "Safari"
    elif not ua:
        navigateur = "Inconnu"
    else:
        navigateur = "Autre (outil ou script)"
    return systeme, navigateur


def localisation_approximative(ip: str) -> str:
    """Localisation volontairement approximative : on distingue seulement le réseau local d'Internet.
    Aucune position précise n'est calculée ni stockée (respect de la vie privée)."""
    try:
        adresse = ipaddress.ip_address(ip)
    except ValueError:
        return "Inconnue"
    if adresse.is_loopback:
        return "Ce poste (local)"
    if adresse.is_private:
        return "Réseau local de l'entreprise"
    return "Internet (hors réseau local)"


# ─────────────────────────────────────────────────────────────
# JOURNAL DE SÉCURITÉ
# ─────────────────────────────────────────────────────────────
def journaliser(db: Session, request: Optional[Request], evenement: str, email: Optional[str] = None,
                utilisateur_id: Optional[int] = None, details: Optional[str] = None):
    db.add(JournalSecurite(
        evenement=evenement,
        email=(email or "")[:150] or None,
        utilisateur_id=utilisateur_id,
        ip=ip_client(request) if request else None,
        navigateur=((request.headers.get("user-agent") or "")[:255] or None) if request else None,
        details=(details or "")[:255] or None,
        created_at=datetime.now(),
    ))
    db.commit()


def alerte_telegram(message: str):
    """Envoie une alerte de sécurité sur Telegram (en arrière-plan, sans bloquer la connexion)."""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        return

    def envoyer():
        try:
            requests.post(f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                          json={"chat_id": settings.TELEGRAM_CHAT_ID, "text": message}, timeout=10)
        except requests.RequestException:
            pass   # une alerte non envoyée ne doit jamais empêcher la connexion
    threading.Thread(target=envoyer, daemon=True).start()


# ─────────────────────────────────────────────────────────────
# APPAREILS
# ─────────────────────────────────────────────────────────────
def trouver_ou_creer_appareil(db: Session, request: Request, utilisateur_id: int) -> tuple:
    """Renvoie (appareil, est_nouveau). L'identifiant de l'appareil est généré par le navigateur
    (en-tête X-Device-Id) ; sans lui (Swagger, script), on se base sur le navigateur."""
    ua = request.headers.get("user-agent") or ""
    identifiant = request.headers.get("x-device-id") or ("ua:" + ua)
    empreinte = sha256(identifiant[:200])
    ip = ip_client(request)
    systeme, navigateur = analyser_navigateur(ua)
    maintenant = datetime.now()

    appareil = db.query(Appareil).filter(Appareil.utilisateur_id == utilisateur_id,
                                         Appareil.empreinte == empreinte).first()
    if appareil:
        return appareil, False
    appareil = Appareil(
        utilisateur_id=utilisateur_id, empreinte=empreinte, nom=f"{navigateur} sur {systeme}",
        systeme=systeme, navigateur=navigateur, statut="autorise",
        premiere_connexion=maintenant, derniere_connexion=maintenant,
        derniere_ip=ip, localisation=localisation_approximative(ip),
    )
    db.add(appareil)
    db.commit()
    db.refresh(appareil)
    return appareil, True


# ─────────────────────────────────────────────────────────────
# SESSIONS
# ─────────────────────────────────────────────────────────────
def creer_session(db: Session, request: Request, utilisateur_id: int, appareil_id: Optional[int]) -> tuple:
    """Crée une session et renvoie (session, jeton_de_renouvellement en clair)."""
    maintenant = datetime.now()
    refresh = secrets.token_urlsafe(48)
    session = SessionUtilisateur(
        utilisateur_id=utilisateur_id, appareil_id=appareil_id, hash_refresh=sha256(refresh),
        ip=ip_client(request), navigateur=(request.headers.get("user-agent") or "")[:255] or None,
        created_at=maintenant, derniere_activite=maintenant,
        expire_le=maintenant + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    limiter_sessions(db, utilisateur_id)
    return session, refresh


def sessions_actives(db: Session, utilisateur_id: Optional[int] = None):
    q = db.query(SessionUtilisateur).filter(SessionUtilisateur.revoquee_le.is_(None),
                                            SessionUtilisateur.expire_le > datetime.now())
    if utilisateur_id is not None:
        q = q.filter(SessionUtilisateur.utilisateur_id == utilisateur_id)
    return q


def revoquer(db: Session, sessions, raison: str) -> int:
    maintenant = datetime.now()
    n = 0
    for s in sessions:
        if s.revoquee_le is None:
            s.revoquee_le, s.raison_revocation = maintenant, raison[:100]
            n += 1
    db.commit()
    return n


def limiter_sessions(db: Session, utilisateur_id: int):
    """Garde au maximum MAX_SESSIONS_PAR_UTILISATEUR sessions actives : les plus anciennes sont fermées."""
    actives = sessions_actives(db, utilisateur_id).order_by(SessionUtilisateur.derniere_activite.desc()).all()
    if len(actives) > settings.MAX_SESSIONS_PAR_UTILISATEUR:
        revoquer(db, actives[settings.MAX_SESSIONS_PAR_UTILISATEUR:], "limite de sessions atteinte")


def nettoyer_sessions(db: Session):
    """Ferme les sessions expirées ou inactives (appelé à chaque connexion)."""
    maintenant = datetime.now()
    expirees = db.query(SessionUtilisateur).filter(SessionUtilisateur.revoquee_le.is_(None),
                                                   SessionUtilisateur.expire_le < maintenant).all()
    revoquer(db, expirees, "expiration")
    inactives = db.query(SessionUtilisateur).filter(
        SessionUtilisateur.revoquee_le.is_(None),
        SessionUtilisateur.derniere_activite < maintenant - timedelta(minutes=settings.INACTIVITE_MAX_MINUTES)).all()
    revoquer(db, inactives, "inactivite")
