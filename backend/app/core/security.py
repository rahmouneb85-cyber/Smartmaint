import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt  # PyJWT (remplace python-jose, qui a des failles connues)
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.models.session_utilisateur import SessionUtilisateur

bearer_scheme = HTTPBearer()


# ─────────────────────────────────────────────────────────────
# MOTS DE PASSE
# ─────────────────────────────────────────────────────────────
def hacher_mot_de_passe(mot_de_passe: str) -> str:
    return bcrypt.hashpw(mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verifier_mot_de_passe(mot_de_passe: str, hache: str) -> bool:
    try:
        return bcrypt.checkpw(mot_de_passe.encode("utf-8"), hache.encode("utf-8"))
    except ValueError:
        return False


# Empreinte factice : quand l'email n'existe pas, on vérifie quand même un mot de passe
# pour que la réponse prenne le même temps (on ne peut pas deviner les comptes existants).
EMPREINTE_FACTICE = hacher_mot_de_passe(secrets.token_urlsafe(16))


# ─────────────────────────────────────────────────────────────
# JETONS D'ACCÈS (JWT, courte durée)
# ─────────────────────────────────────────────────────────────
def creer_jeton(utilisateur: User, session_id: int) -> str:
    maintenant = datetime.now(timezone.utc)
    donnees = {
        "sub": str(utilisateur.id),
        "sid": session_id,             # session à laquelle appartient le jeton (permet la révocation)
        "role": getattr(utilisateur.role, "value", utilisateur.role),
        "iat": maintenant,
        "exp": maintenant + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(donnees, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def creer_jeton_mfa(utilisateur: User, appareil_id: int, nouvel_appareil: bool) -> str:
    """Jeton temporaire (5 minutes) entre le mot de passe et le code 2FA. Il ne donne accès à aucune route."""
    maintenant = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(utilisateur.id), "typ": "mfa", "app": appareil_id, "nv": bool(nouvel_appareil),
                       "iat": maintenant, "exp": maintenant + timedelta(minutes=5)},
                      settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def lire_jeton_mfa(jeton: str) -> dict:
    try:
        p = jwt.decode(jeton, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], options={"require": ["exp", "sub"]})
        if p.get("typ") != "mfa":
            raise ValueError
        return {"user_id": int(p["sub"]), "appareil_id": int(p["app"]), "nouveau": bool(p.get("nv"))}
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise ValueError("Jeton 2FA invalide") from None


def _refuser(detail="Token invalide ou expiré"):
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={"WWW-Authenticate": "Bearer"})


def get_current_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> SessionUtilisateur:
    """Vérifie le jeton ET la session associée : une session fermée à distance perd l'accès immédiatement."""
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
                             options={"require": ["exp", "sub", "sid"]})
        user_id, session_id = int(payload["sub"]), int(payload["sid"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise _refuser() from None

    session = db.query(SessionUtilisateur).filter(SessionUtilisateur.id == session_id,
                                                  SessionUtilisateur.utilisateur_id == user_id).first()
    maintenant = datetime.now()
    if session is None or session.revoquee_le is not None:
        raise _refuser("Session fermée")
    if session.expire_le < maintenant:
        session.revoquee_le, session.raison_revocation = maintenant, "expiration"
        db.commit()
        raise _refuser("Session expirée")
    if session.derniere_activite < maintenant - timedelta(minutes=settings.INACTIVITE_MAX_MINUTES):
        session.revoquee_le, session.raison_revocation = maintenant, "inactivite"
        db.commit()
        raise _refuser("Session fermée après une longue inactivité")

    # mise à jour de la dernière activité au plus une fois par minute (évite une écriture à chaque requête)
    if session.derniere_activite < maintenant - timedelta(minutes=1):
        session.derniere_activite = maintenant
        db.commit()
    return session


def get_current_user(session: SessionUtilisateur = Depends(get_current_session), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == session.utilisateur_id).first()
    if user is None:
        raise _refuser()
    if not user.actif:
        # un compte désactivé perd l'accès immédiatement, même avec un jeton encore valide
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte désactivé")
    return user


# ─────────────────────────────────────────────────────────────
# RÔLES
# ─────────────────────────────────────────────────────────────
def exiger_roles(*roles: str):
    """Dépendance FastAPI : autorise seulement les rôles indiqués.
    Exemple : dependencies=[Depends(exiger_roles("admin"))]"""
    def verifier(user: User = Depends(get_current_user)):
        role = getattr(user.role, "value", user.role)
        if role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Action non autorisée pour votre rôle")
        return user
    return verifier


# ─────────────────────────────────────────────────────────────
# APPAREILS IoT
# ─────────────────────────────────────────────────────────────
def verifier_cle_iot(x_api_key: str = Header(default="")):
    """Vérifie la clé secrète envoyée par les appareils IoT dans l'en-tête X-API-Key."""
    # Sans clé configurée dans le .env, tout est refusé (sécurité par défaut)
    if not settings.IOT_API_KEY or not secrets.compare_digest(x_api_key, settings.IOT_API_KEY):
        raise HTTPException(status_code=401, detail="Clé API IoT invalide ou manquante")
