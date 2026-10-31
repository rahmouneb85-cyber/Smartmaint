"""Double authentification (2FA) par code TOTP à 6 chiffres (RFC 6238) et codes de secours."""
import base64
import hashlib
import io
import json
import secrets
import time
from typing import Optional

import pyotp
import qrcode

from app.core.config import settings
from app.core.chiffrement import chiffrer_texte, dechiffrer_texte
from app.models.user import User

NB_CODES_SECOURS = 8


def nouveau_secret() -> str:
    return pyotp.random_base32()


def secret_utilisateur(user: User) -> Optional[str]:
    return dechiffrer_texte(user.totp_secret) if user.totp_secret else None


def enregistrer_secret(user: User, secret: str):
    user.totp_secret = chiffrer_texte(secret)


def uri_et_qr(user: User, secret: str) -> dict:
    """Lien otpauth:// et QR code (image PNG en base64) à scanner avec l'application d'authentification."""
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=settings.MFA_EMETTEUR)
    image = qrcode.make(uri, box_size=6, border=2)
    tampon = io.BytesIO()
    image.save(tampon, format="PNG")
    return {"uri": uri, "qr_code": "data:image/png;base64," + base64.b64encode(tampon.getvalue()).decode()}


def verifier_totp(secret: str, code: str, dernier_pas: Optional[int]) -> Optional[int]:
    """Vérifie le code (tolérance d'un intervalle de 30 s avant ou après).
    Renvoie le numéro d'intervalle utilisé, ou None si le code est faux ou déjà utilisé (anti-rejeu)."""
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return None
    totp = pyotp.TOTP(secret)
    pas_actuel = int(time.time()) // 30
    for decalage in (0, -1, 1):
        pas = pas_actuel + decalage
        if secrets.compare_digest(totp.at(pas * 30), code):
            if dernier_pas is not None and pas <= dernier_pas:
                return None          # code déjà utilisé : refusé
            return pas
    return None


def _empreinte(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").upper().encode()).hexdigest()


def generer_codes_secours(user: User) -> list:
    """Crée de nouveaux codes de secours ; seules leurs empreintes sont conservées."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sans 0/O ni 1/I pour éviter les confusions
    codes = ["".join(secrets.choice(alphabet) for _ in range(4)) + "-" + "".join(secrets.choice(alphabet) for _ in range(4))
             for _ in range(NB_CODES_SECOURS)]
    user.codes_secours = json.dumps([_empreinte(c) for c in codes])
    return codes


def utiliser_code_secours(user: User, code: str) -> bool:
    """Un code de secours ne peut servir qu'une seule fois."""
    if not user.codes_secours:
        return False
    empreintes = json.loads(user.codes_secours)
    e = _empreinte(code.strip())
    for i, existante in enumerate(empreintes):
        if secrets.compare_digest(existante, e):
            empreintes.pop(i)
            user.codes_secours = json.dumps(empreintes)
            return True
    return False


def codes_restants(user: User) -> int:
    return len(json.loads(user.codes_secours)) if user.codes_secours else 0


def verifier_code(user: User, code: str) -> Optional[str]:
    """Accepte un code TOTP ou un code de secours. Renvoie 'totp', 'secours' ou None."""
    secret = secret_utilisateur(user)
    if not secret:
        return None
    pas = verifier_totp(secret, code, user.totp_dernier_pas)
    if pas is not None:
        user.totp_dernier_pas = pas
        return "totp"
    if "-" in (code or "") or len((code or "").strip()) == 8:
        if utiliser_code_secours(user, code):
            return "secours"
    return None


def desactiver(user: User):
    user.totp_secret = None
    user.totp_actif = False
    user.totp_dernier_pas = None
    user.codes_secours = None
