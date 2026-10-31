"""Chiffrement symétrique des données sensibles (secrets 2FA, sauvegardes) avec Fernet (AES 128 + HMAC)."""
import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from app.core.config import settings


def _cle() -> bytes:
    # clé dédiée si elle est définie dans le .env, sinon dérivée de SECRET_KEY
    source = settings.CLE_CHIFFREMENT or settings.SECRET_KEY
    return base64.urlsafe_b64encode(hashlib.sha256(("smartmaint-chiffrement:" + source).encode()).digest())


_fernet = Fernet(_cle())


def chiffrer(donnees: bytes) -> bytes:
    return _fernet.encrypt(donnees)


def dechiffrer(donnees: bytes) -> bytes:
    return _fernet.decrypt(donnees)


def chiffrer_texte(texte: str) -> str:
    return chiffrer(texte.encode("utf-8")).decode("ascii")


def dechiffrer_texte(texte: str) -> str:
    try:
        return dechiffrer(texte.encode("ascii")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Donnée chiffrée illisible (clé de chiffrement modifiée ?)") from None
