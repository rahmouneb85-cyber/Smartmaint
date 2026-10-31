import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    hacher_mot_de_passe, verifier_mot_de_passe, EMPREINTE_FACTICE,
    creer_jeton, creer_jeton_mfa, lire_jeton_mfa, get_current_user, get_current_session, exiger_roles,
)
from app.core.sessions import (
    sha256, ip_client, journaliser, alerte_telegram, trouver_ou_creer_appareil,
    creer_session, sessions_actives, revoquer, nettoyer_sessions,
)
from app.core import mfa
from app.models.user import User
from app.models.appareil import Appareil
from app.models.journal_securite import JournalSecurite
from app.models.session_utilisateur import SessionUtilisateur
from app.schemas.user import UserCreate, UserResponse, UserLogin, Token, verifier_robustesse

router = APIRouter(prefix="/auth", tags=["Authentication"])

production = settings.ENVIRONNEMENT == "production"
CHEMIN_COOKIE = "/api/v1/auth"
DELAI_GRACE_SECONDES = 30   # tolérance quand plusieurs onglets renouvellent le jeton en même temps


# ─────────────────────────────────────────────────────────────
# COOKIE DU JETON DE RENOUVELLEMENT
# HttpOnly : illisible par JavaScript (protège contre le vol par XSS)
# SameSite=Strict : jamais envoyé depuis un autre site (protège contre le CSRF)
# ─────────────────────────────────────────────────────────────
def _poser_cookie(response: Response, refresh: str):
    response.set_cookie(settings.COOKIE_REFRESH, refresh, httponly=True, samesite="strict", secure=production,
                        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path=CHEMIN_COOKIE)


def _effacer_cookie(response: Response):
    response.delete_cookie(settings.COOKIE_REFRESH, path=CHEMIN_COOKIE, samesite="strict", secure=production, httponly=True)


# ─────────────────────────────────────────────────────────────
# PROTECTION CONTRE LA FORCE BRUTE
# ─────────────────────────────────────────────────────────────
def _fin_blocage(db: Session, filtre, limite: int) -> Optional[datetime]:
    duree = timedelta(minutes=settings.DUREE_BLOCAGE_MINUTES)
    borne = datetime.now() - duree
    derniere_reussite = (db.query(JournalSecurite.created_at)
                         .filter(filtre, JournalSecurite.evenement == "connexion_reussie")
                         .order_by(JournalSecurite.created_at.desc()).first())
    if derniere_reussite and derniere_reussite[0] > borne:
        borne = derniere_reussite[0]
    echecs = (db.query(JournalSecurite.created_at)
              .filter(filtre, JournalSecurite.evenement == "echec_connexion", JournalSecurite.created_at > borne)
              .order_by(JournalSecurite.created_at.desc()).limit(limite).all())
    if len(echecs) >= limite:
        return echecs[0][0] + duree
    return None


def _refuser_si_bloque(db: Session, request: Request, email: str):
    fin = (_fin_blocage(db, JournalSecurite.email == email, settings.MAX_TENTATIVES_COMPTE)
           or _fin_blocage(db, JournalSecurite.ip == ip_client(request), settings.MAX_TENTATIVES_IP))
    if fin:
        minutes = max(1, int((fin - datetime.now()).total_seconds() // 60) + 1)
        journaliser(db, request, "connexion_bloquee", email=email, details=f"Encore {minutes} min de blocage")
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Trop de tentatives échouées. Réessayez dans {minutes} minute(s).",
                            headers={"Retry-After": str(minutes * 60)})


# ─────────────────────────────────────────────────────────────
# DÉTECTION DES CONNEXIONS INHABITUELLES
# ─────────────────────────────────────────────────────────────
def _raisons_inhabituelles(db: Session, request: Request, user: User, appareil_nouveau: bool) -> list:
    reussites = db.query(JournalSecurite).filter(JournalSecurite.utilisateur_id == user.id,
                                                 JournalSecurite.evenement == "connexion_reussie")
    if reussites.count() == 0:
        return []   # première connexion du compte : rien à comparer
    raisons = []
    if appareil_nouveau:
        raisons.append("nouvel appareil")
    if reussites.filter(JournalSecurite.ip == ip_client(request)).count() == 0:
        raisons.append("nouvelle adresse IP")
    echecs = db.query(JournalSecurite).filter(
        JournalSecurite.email == user.email, JournalSecurite.evenement == "echec_connexion",
        JournalSecurite.created_at > datetime.now() - timedelta(minutes=settings.DUREE_BLOCAGE_MINUTES)).count()
    if echecs >= 3:
        raisons.append(f"{echecs} échecs juste avant")
    return raisons


# ─────────────────────────────────────────────────────────────
# CONNEXION
# ─────────────────────────────────────────────────────────────
def _ouvrir_session(db: Session, request: Request, response: Response, user: User, appareil: Appareil,
                    nouveau: bool, methode: str) -> dict:
    """Dernière étape d'une connexion réussie : session, journal, alerte et cookie."""
    raisons = _raisons_inhabituelles(db, request, user, nouveau)
    nettoyer_sessions(db)
    session, refresh = creer_session(db, request, user.id, appareil.id)
    appareil.derniere_connexion, appareil.derniere_ip = datetime.now(), ip_client(request)
    db.commit()

    if nouveau:
        journaliser(db, request, "nouvel_appareil", email=user.email, utilisateur_id=user.id, details=appareil.nom)
    if raisons:
        texte = ", ".join(raisons)
        journaliser(db, request, "connexion_inhabituelle", email=user.email, utilisateur_id=user.id, details=texte)
        alerte_telegram(f"🔐 SmartMaint : connexion inhabituelle\nCompte : {user.email}\nAppareil : {appareil.nom}\n"
                        f"Adresse IP : {ip_client(request)}\nMotif : {texte}")
    journaliser(db, request, "connexion_reussie", email=user.email, utilisateur_id=user.id,
                details=f"Session {session.id} ({methode})")
    _poser_cookie(response, refresh)
    return {"access_token": creer_jeton(user, session.id), "token_type": "bearer"}


@router.post("/login")
def login(credentials: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = credentials.email.lower().strip()
    _refuser_si_bloque(db, request, email)

    user = db.query(User).filter(User.email == email).first()
    valide = verifier_mot_de_passe(credentials.mot_de_passe, user.mot_de_passe if user else EMPREINTE_FACTICE)
    if not user or not valide:
        journaliser(db, request, "echec_connexion", email=email, utilisateur_id=user.id if user else None,
                    details=None if user else "Email inconnu")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not user.actif:
        journaliser(db, request, "compte_desactive", email=email, utilisateur_id=user.id)
        raise HTTPException(status_code=403, detail="Compte désactivé. Contactez l'administrateur.")

    appareil, nouveau = trouver_ou_creer_appareil(db, request, user.id)
    if appareil.statut == "bloque":
        journaliser(db, request, "appareil_bloque", email=email, utilisateur_id=user.id, details=appareil.nom)
        raise HTTPException(status_code=403, detail="Cet appareil a été bloqué par l'administrateur.")

    if user.totp_actif:
        # mot de passe correct, mais un second facteur est exigé : jeton temporaire de 5 minutes
        journaliser(db, request, "mfa_demande", email=email, utilisateur_id=user.id)
        return {"mfa_requis": True, "mfa_jeton": creer_jeton_mfa(user, appareil.id, nouveau)}

    return _ouvrir_session(db, request, response, user, appareil, nouveau, "mot de passe")


class ConnexionMFA(BaseModel):
    mfa_jeton: str
    code: str


@router.post("/2fa/connexion", response_model=Token)
def connexion_2fa(data: ConnexionMFA, request: Request, response: Response, db: Session = Depends(get_db)):
    """Seconde étape de la connexion : code à 6 chiffres de l'application, ou code de secours."""
    try:
        contenu = lire_jeton_mfa(data.mfa_jeton)
    except ValueError:
        raise HTTPException(status_code=401, detail="Délai dépassé, reconnectez-vous") from None
    user = db.query(User).filter(User.id == contenu["user_id"]).first()
    appareil = db.query(Appareil).filter(Appareil.id == contenu["appareil_id"]).first()
    if not user or not user.actif or not user.totp_actif or not appareil or appareil.statut == "bloque":
        raise HTTPException(status_code=401, detail="Connexion impossible, reconnectez-vous")
    _refuser_si_bloque(db, request, user.email)

    methode = mfa.verifier_code(user, data.code)
    if not methode:
        db.commit()
        journaliser(db, request, "echec_connexion", email=user.email, utilisateur_id=user.id, details="Code 2FA incorrect")
        raise HTTPException(status_code=401, detail="Code incorrect")
    db.commit()
    if methode == "secours":
        journaliser(db, request, "code_secours_utilise", email=user.email, utilisateur_id=user.id,
                    details=f"{mfa.codes_restants(user)} code(s) restant(s)")
    return _ouvrir_session(db, request, response, user, appareil, contenu["nouveau"],
                           "2FA" if methode == "totp" else "code de secours")


@router.post("/refresh", response_model=Token)
def renouveler(request: Request, response: Response, db: Session = Depends(get_db)):
    """Donne un nouveau jeton d'accès grâce au cookie de renouvellement, qui change à chaque appel (rotation)."""
    refresh = request.cookies.get(settings.COOKIE_REFRESH)
    if not refresh:
        raise HTTPException(status_code=401, detail="Session absente")
    empreinte = sha256(refresh)
    maintenant = datetime.now()

    session = db.query(SessionUtilisateur).filter(SessionUtilisateur.hash_refresh == empreinte).first()
    if session is None:
        ancienne = db.query(SessionUtilisateur).filter(SessionUtilisateur.ancien_hash_refresh == empreinte).first()
        if ancienne and ancienne.revoquee_le is None and ancienne.rotation_le \
                and (maintenant - ancienne.rotation_le).total_seconds() <= DELAI_GRACE_SECONDES:
            # deux onglets ont renouvelé en même temps : on répond sans refaire de rotation
            user = db.query(User).filter(User.id == ancienne.utilisateur_id).first()
            if user and user.actif:
                return {"access_token": creer_jeton(user, ancienne.id), "token_type": "bearer"}
        if ancienne:
            # un ancien jeton est réutilisé : il a probablement été volé → on ferme la session
            revoquer(db, [ancienne], "reutilisation d'un jeton")
            journaliser(db, request, "reutilisation_jeton", utilisateur_id=ancienne.utilisateur_id,
                        details=f"Session {ancienne.id} fermée par sécurité")
        _effacer_cookie(response)
        raise HTTPException(status_code=401, detail="Session invalide")

    user = db.query(User).filter(User.id == session.utilisateur_id).first()
    inactif = session.derniere_activite < maintenant - timedelta(minutes=settings.INACTIVITE_MAX_MINUTES)
    if session.revoquee_le or session.expire_le < maintenant or inactif or not user or not user.actif:
        if session.revoquee_le is None:
            revoquer(db, [session], "inactivite" if inactif else "expiration")
        _effacer_cookie(response)
        raise HTTPException(status_code=401, detail="Session fermée, veuillez vous reconnecter")

    nouveau = secrets.token_urlsafe(48)
    session.ancien_hash_refresh, session.hash_refresh = session.hash_refresh, sha256(nouveau)
    session.rotation_le = session.derniere_activite = maintenant
    db.commit()
    _poser_cookie(response, nouveau)
    return {"access_token": creer_jeton(user, session.id), "token_type": "bearer"}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db),
           session: SessionUtilisateur = Depends(get_current_session)):
    """Déconnexion réelle : la session est fermée côté serveur, le jeton devient inutilisable."""
    revoquer(db, [session], "deconnexion")
    user = db.query(User).filter(User.id == session.utilisateur_id).first()
    journaliser(db, request, "deconnexion", email=user.email if user else None,
                utilisateur_id=session.utilisateur_id, details=f"Session {session.id}")
    _effacer_cookie(response)
    return {"message": "Déconnexion effectuée"}


# ─────────────────────────────────────────────────────────────
# COMPTE ET SESSIONS DE L'UTILISATEUR CONNECTÉ
# ─────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, request: Request, db: Session = Depends(get_db),
             admin: User = Depends(exiger_roles("admin"))):
    """Création d'un compte : réservée à l'administrateur (l'inscription libre est fermée)."""
    email = user.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    new_user = User(nom=user.nom, email=email, mot_de_passe=hacher_mot_de_passe(user.mot_de_passe), role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    journaliser(db, request, "creation_compte", email=email, utilisateur_id=admin.id,
                details=f"Compte {new_user.id} ({user.role.value}) créé par {admin.email}")
    return new_user


@router.get("/me", response_model=UserResponse)
def moi(user: User = Depends(get_current_user)):
    return user


def decrire_session(s: SessionUtilisateur, db: Session, session_courante_id: Optional[int] = None) -> dict:
    appareil = db.query(Appareil).filter(Appareil.id == s.appareil_id).first() if s.appareil_id else None
    return {
        "id": s.id, "utilisateur_id": s.utilisateur_id,
        "appareil": appareil.nom if appareil else None, "appareil_id": s.appareil_id,
        "systeme": appareil.systeme if appareil else None, "navigateur": appareil.navigateur if appareil else None,
        "localisation": appareil.localisation if appareil else None,
        "ip": s.ip, "debut": s.created_at, "derniere_activite": s.derniere_activite, "expire_le": s.expire_le,
        "courante": s.id == session_courante_id,
    }


@router.get("/sessions")
def mes_sessions(db: Session = Depends(get_db), session: SessionUtilisateur = Depends(get_current_session)):
    lignes = sessions_actives(db, session.utilisateur_id).order_by(SessionUtilisateur.derniere_activite.desc()).all()
    return [decrire_session(s, db, session.id) for s in lignes]


@router.delete("/sessions/{id}")
def fermer_ma_session(id: int, request: Request, db: Session = Depends(get_db),
                      session: SessionUtilisateur = Depends(get_current_session)):
    cible = db.query(SessionUtilisateur).filter(SessionUtilisateur.id == id,
                                                SessionUtilisateur.utilisateur_id == session.utilisateur_id).first()
    if not cible:
        raise HTTPException(status_code=404, detail="Session introuvable")
    revoquer(db, [cible], "fermee par l'utilisateur")
    journaliser(db, request, "session_fermee", utilisateur_id=session.utilisateur_id, details=f"Session {id}")
    return {"message": "Session fermée"}


@router.post("/sessions/fermer-autres")
def fermer_autres_sessions(request: Request, db: Session = Depends(get_db),
                           session: SessionUtilisateur = Depends(get_current_session)):
    autres = sessions_actives(db, session.utilisateur_id).filter(SessionUtilisateur.id != session.id).all()
    n = revoquer(db, autres, "fermee par l'utilisateur")
    journaliser(db, request, "sessions_fermees", utilisateur_id=session.utilisateur_id, details=f"{n} autre(s) session(s)")
    return {"message": f"{n} session(s) fermée(s)"}


# ─────────────────────────────────────────────────────────────
# MON COMPTE : MOT DE PASSE ET DOUBLE AUTHENTIFICATION
# ─────────────────────────────────────────────────────────────
class ChangementMotDePasse(BaseModel):
    ancien: str
    nouveau: str


@router.post("/mot-de-passe")
def changer_mot_de_passe(data: ChangementMotDePasse, request: Request, db: Session = Depends(get_db),
                         session: SessionUtilisateur = Depends(get_current_session)):
    user = db.query(User).filter(User.id == session.utilisateur_id).first()
    if not verifier_mot_de_passe(data.ancien, user.mot_de_passe):
        journaliser(db, request, "echec_changement_mdp", email=user.email, utilisateur_id=user.id)
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    try:
        verifier_robustesse(data.nouveau)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if verifier_mot_de_passe(data.nouveau, user.mot_de_passe):
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'ancien")
    user.mot_de_passe = hacher_mot_de_passe(data.nouveau)
    db.commit()
    # par sécurité, toutes les autres sessions sont fermées
    n = revoquer(db, sessions_actives(db, user.id).filter(SessionUtilisateur.id != session.id).all(), "changement de mot de passe")
    journaliser(db, request, "changement_mdp", email=user.email, utilisateur_id=user.id, details=f"{n} autre(s) session(s) fermée(s)")
    return {"message": "Mot de passe modifié", "sessions_fermees": n}


class CodeMFA(BaseModel):
    code: str


class DesactivationMFA(BaseModel):
    mot_de_passe: str
    code: str


@router.get("/2fa/statut")
def statut_2fa(user: User = Depends(get_current_user)):
    return {"actif": bool(user.totp_actif), "codes_restants": mfa.codes_restants(user) if user.totp_actif else 0}


@router.post("/2fa/preparer")
def preparer_2fa(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Étape 1 : génère un secret et le QR code à scanner. La 2FA n'est active qu'après confirmation d'un code."""
    if user.totp_actif:
        raise HTTPException(status_code=400, detail="La double authentification est déjà activée")
    secret = mfa.nouveau_secret()
    mfa.enregistrer_secret(user, secret)
    db.commit()
    return {"secret": secret, **mfa.uri_et_qr(user, secret)}


@router.post("/2fa/activer")
def activer_2fa(data: CodeMFA, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Étape 2 : l'utilisateur prouve que son application fonctionne en saisissant un code."""
    if user.totp_actif:
        raise HTTPException(status_code=400, detail="La double authentification est déjà activée")
    secret = mfa.secret_utilisateur(user)
    pas = mfa.verifier_totp(secret, data.code, None) if secret else None
    if pas is None:
        raise HTTPException(status_code=400, detail="Code incorrect : vérifiez l'heure de votre téléphone et réessayez")
    user.totp_actif, user.totp_dernier_pas = True, pas
    codes = mfa.generer_codes_secours(user)
    db.commit()
    journaliser(db, request, "mfa_activee", email=user.email, utilisateur_id=user.id)
    return {"message": "Double authentification activée", "codes_secours": codes}


@router.post("/2fa/codes-secours")
def regenerer_codes(data: CodeMFA, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.totp_actif or not mfa.verifier_code(user, data.code):
        db.commit()
        raise HTTPException(status_code=400, detail="Code incorrect")
    codes = mfa.generer_codes_secours(user)
    db.commit()
    journaliser(db, request, "codes_secours_regeneres", email=user.email, utilisateur_id=user.id)
    return {"codes_secours": codes}


@router.post("/2fa/desactiver")
def desactiver_2fa(data: DesactivationMFA, request: Request, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    if not user.totp_actif:
        raise HTTPException(status_code=400, detail="La double authentification n'est pas activée")
    if not verifier_mot_de_passe(data.mot_de_passe, user.mot_de_passe) or not mfa.verifier_code(user, data.code):
        db.commit()
        raise HTTPException(status_code=400, detail="Mot de passe ou code incorrect")
    mfa.desactiver(user)
    db.commit()
    journaliser(db, request, "mfa_desactivee", email=user.email, utilisateur_id=user.id)
    return {"message": "Double authentification désactivée"}
