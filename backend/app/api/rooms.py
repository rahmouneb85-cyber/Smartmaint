"""Room Live : salles de réunion avec audio, vidéo et chat en temps réel.

Architecture
  • REST (/api/v1/rooms) : création des salles, invitations, rôles, retrait, blocage, historique du chat.
  • WebSocket (/api/v1/rooms/ws/{id}) : présence, chat instantané et signalisation WebRTC.
  • Audio et vidéo : WebRTC, directement entre les navigateurs (maillage, ROOM_MAX_PARTICIPANTS au maximum).
    Le serveur ne fait que relayer les messages de connexion (offres, réponses, candidats) entre membres
    de la même salle : il ne reçoit jamais le son ni l'image, chiffrés de bout en bout par WebRTC (DTLS-SRTP).

Sécurité
  • Une salle n'existe que pour ses membres : pour toute autre personne, administrateur compris, elle est
    traitée comme inexistante (404).
  • Le WebSocket est authentifié par le premier message (le jeton n'apparaît jamais dans l'adresse) et la
    session est vérifiée comme pour toutes les routes (session fermée ou compte désactivé : refus).
  • Les invitations sont limitées aux contacts autorisés de la messagerie (mêmes règles par rôle).
  • Un participant retiré ou bloqué est déconnecté immédiatement ; un participant bloqué ne peut plus entrer.
  • Messages limités en taille et en fréquence.
"""
import asyncio
import json
import time
from collections import deque
from datetime import datetime
from types import SimpleNamespace
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.messagerie import contacts_autorises
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.journaux import journal
from app.core.security import get_current_session, get_current_user
from app.models.room import FichierSalle, MembreSalle, MessageSalle, Salle
from app.models.user import User
from app.notifications.service import creer as creer_notification

router = APIRouter(prefix="/rooms", tags=["Room Live"])

ROLES_GESTION = ("hote", "moderateur")
TAILLE_MAX_MESSAGE = 100_000          # octets (une offre WebRTC fait quelques ko)
CHAT_MAX, CHAT_FENETRE = 10, 10       # 10 messages de chat par tranche de 10 secondes
DELAI_AUTH = 10                       # secondes pour s'authentifier après l'ouverture du WebSocket


def ice_serveurs() -> list:
    try:
        v = json.loads(settings.ROOM_ICE_SERVERS) if settings.ROOM_ICE_SERVERS.strip() else []
        return v if isinstance(v, list) else []
    except ValueError:
        return []


# ─────────────────────────────────────────────────────────────
# CENTRE DE DIFFUSION EN TEMPS RÉEL (en mémoire, un seul processus serveur)
# ─────────────────────────────────────────────────────────────
class Connexion:
    def __init__(self, ws: WebSocket, user, role: str):
        self.ws, self.id, self.nom, self.role = ws, user.id, user.nom, role
        self.micro, self.camera, self.ecran = True, True, False
        self.envois = deque()

    def publique(self) -> dict:
        return {"id": self.id, "nom": self.nom, "role": self.role, "micro": self.micro, "camera": self.camera, "ecran": self.ecran}


class Centre:
    def __init__(self):
        self.salles: Dict[int, Dict[int, Connexion]] = {}

    def presents(self, salle_id: int) -> List[int]:
        return list(self.salles.get(salle_id, {}))

    async def envoyer(self, c: Connexion, message: dict):
        try:
            await c.ws.send_json(message)
        except Exception as e:                                  # connexion déjà fermée : sans conséquence
            journal.debug("Room Live : envoi impossible à %s (%s)", c.id, e)

    async def diffuser(self, salle_id: int, message: dict, sauf: Optional[int] = None):
        for uid, c in list(self.salles.get(salle_id, {}).items()):
            if uid != sauf:
                await self.envoyer(c, message)

    async def expulser(self, salle_id: int, utilisateur_id: int, raison: str, code: int = 4003):
        c = self.salles.get(salle_id, {}).pop(utilisateur_id, None)
        if c:
            await self.envoyer(c, {"type": "expulse", "raison": raison})
            try:
                await c.ws.close(code=code)
            except Exception as e:
                journal.debug("Room Live : fermeture déjà effectuée pour %s (%s)", c.id, e)
            await self.diffuser(salle_id, {"type": "depart", "id": utilisateur_id})

    async def fermer_salle(self, salle_id: int):
        for uid in self.presents(salle_id):
            await self.expulser(salle_id, uid, "fin", code=4000)
        self.salles.pop(salle_id, None)


centre = Centre()


# ─────────────────────────────────────────────────────────────
# OUTILS
# ─────────────────────────────────────────────────────────────
def _val(x):
    return getattr(x, "value", x)


def _membre(db: Session, salle_id: int, user_id: int) -> Optional[MembreSalle]:
    return db.query(MembreSalle).filter(MembreSalle.salle_id == salle_id, MembreSalle.utilisateur_id == user_id).first()


def _acces(db: Session, user: User, salle_id: int, gestion: bool = False):
    """Salle et appartenance du compte connecté ; 404 si non membre ou bloqué, 403 si rôle insuffisant."""
    salle = db.get(Salle, salle_id)
    m = _membre(db, salle_id, user.id) if salle else None
    if not salle or not m or m.statut == "bloque":
        raise HTTPException(status_code=404, detail="Salle introuvable")
    if gestion and m.role not in ROLES_GESTION:
        raise HTTPException(status_code=403, detail="Réservé à l'hôte et aux modérateurs de la salle")
    return salle, m


def _message_systeme(db: Session, salle_id: int, texte: str) -> MessageSalle:
    m = MessageSalle(salle_id=salle_id, auteur_id=None, type="systeme", texte=texte, created_at=datetime.now())
    db.add(m)
    return m


def _serialiser_message(m: MessageSalle, noms: dict) -> dict:
    return {"id": m.id, "type": m.type, "texte": m.texte, "auteur": {"id": m.auteur_id, "nom": noms.get(m.auteur_id)} if m.auteur_id else None,
            "date": m.created_at.isoformat()}


def _noms(db: Session, ids) -> dict:
    ids = {i for i in ids if i}
    return {u.id: u.nom for u in db.query(User).filter(User.id.in_(ids))} if ids else {}


def _inviter(db: Session, salle: Salle, invitant: User, ids: List[int]) -> List[int]:
    autorises = {u.id for u in contacts_autorises(db, invitant).filter(User.id.in_(ids or [-1]))}
    nouveaux = []
    for uid in dict.fromkeys(ids):
        if uid not in autorises:
            raise HTTPException(status_code=422, detail="Un des comptes invités n'est pas un contact autorisé")
        m = _membre(db, salle.id, uid)
        if m and m.statut == "bloque":
            raise HTTPException(status_code=409, detail="Ce participant est bloqué : débloquez-le avant de l'inviter")
        if not m:
            db.add(MembreSalle(salle_id=salle.id, utilisateur_id=uid, role="participant", statut="invite",
                               invite_par=invitant.id, created_at=datetime.now()))
            nouveaux.append(uid)
    db.flush()
    if nouveaux:
        creer_notification(db.connection(), nouveaux, type_="room", niveau="info", page="room", objet_id=salle.id,
                           titre=f"Invitation à la salle « {salle.nom} »"[:200], message=f"{invitant.nom} vous invite à une réunion Room Live",
                           donnees={"modele": "room_invitation", "nom": salle.nom[:80], "par": invitant.nom})
    return nouveaux


# ─────────────────────────────────────────────────────────────
# SALLES
# ─────────────────────────────────────────────────────────────
class NouvelleSalle(BaseModel):
    nom: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    invites: List[int] = Field(default_factory=list, max_length=50)


@router.post("")
def creer(s: NouvelleSalle, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    maintenant = datetime.now()
    salle = Salle(nom=s.nom.strip(), description=(s.description or "").strip() or None, createur_id=user.id, active=True,
                  created_at=maintenant, maj=maintenant)
    db.add(salle)
    db.flush()
    db.add(MembreSalle(salle_id=salle.id, utilisateur_id=user.id, role="hote", statut="membre", created_at=maintenant))
    _inviter(db, salle, user, s.invites)
    db.commit()
    journal.info("Room Live : salle %s créée par l'utilisateur %s", salle.id, user.id)
    return detail(salle.id, db, user)


@router.get("")
def lister(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lignes = (db.query(Salle, MembreSalle).join(MembreSalle, MembreSalle.salle_id == Salle.id)
              .filter(MembreSalle.utilisateur_id == user.id, MembreSalle.statut != "bloque")
              .order_by(Salle.active.desc(), Salle.maj.desc()).limit(100).all())
    resultat = []
    for salle, m in lignes:
        nb = db.query(MembreSalle).filter(MembreSalle.salle_id == salle.id, MembreSalle.statut != "bloque").count()
        resultat.append({"id": salle.id, "nom": salle.nom, "description": salle.description, "active": salle.active,
                         "mon_role": m.role, "mon_statut": m.statut, "membres": nb, "en_ligne": len(centre.presents(salle.id)),
                         "maj": salle.maj.isoformat()})
    return resultat


@router.get("/{id}")
def detail(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    salle, m = _acces(db, user, id)
    membres = db.query(MembreSalle).filter(MembreSalle.salle_id == id).all()
    noms = _noms(db, [x.utilisateur_id for x in membres])
    en_ligne = set(centre.presents(id))
    gestion = m.role in ROLES_GESTION
    return {"id": salle.id, "nom": salle.nom, "description": salle.description, "active": salle.active,
            "mon_role": m.role, "mon_statut": m.statut, "max_participants": settings.ROOM_MAX_PARTICIPANTS,
            "membres": [{"id": x.utilisateur_id, "nom": noms.get(x.utilisateur_id), "role": x.role, "statut": x.statut,
                         "en_ligne": x.utilisateur_id in en_ligne}
                        for x in membres if x.statut != "bloque" or gestion]}


@router.get("/{id}/messages")
def messages(id: int, avant_id: Optional[int] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _acces(db, user, id)
    q = db.query(MessageSalle).filter(MessageSalle.salle_id == id)
    if avant_id:
        q = q.filter(MessageSalle.id < avant_id)
    liste = q.order_by(MessageSalle.id.desc()).limit(100).all()[::-1]
    noms = _noms(db, [x.auteur_id for x in liste])
    from app.api.rooms_partage import serialiser_fichier
    fichiers = {f.message_id: serialiser_fichier(f) for f in
                db.query(FichierSalle).filter(FichierSalle.message_id.in_([x.id for x in liste if x.type == "fichier"] or [-1]))}
    return [{**_serialiser_message(x, noms), **({"fichier": fichiers.get(x.id)} if x.type == "fichier" else {})} for x in liste]


class Invitation(BaseModel):
    utilisateurs: List[int] = Field(..., min_length=1, max_length=50)


@router.post("/{id}/invitations")
async def inviter(id: int, inv: Invitation, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    salle, _ = _acces(db, user, id, gestion=True)
    if not salle.active:
        raise HTTPException(status_code=409, detail="La réunion est terminée")
    nouveaux = _inviter(db, salle, user, inv.utilisateurs)
    db.commit()
    await centre.diffuser(id, {"type": "membres"})
    return {"invites": nouveaux}


async def _moderer(db: Session, user: User, id: int, cible_id: int, action: str):
    salle, moi = _acces(db, user, id, gestion=True)
    cible = _membre(db, id, cible_id)
    if not cible or cible_id == user.id:
        raise HTTPException(status_code=404, detail="Participant introuvable")
    if cible.role == "hote" or (cible.role == "moderateur" and moi.role != "hote"):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modérer ce participant")
    nom = (db.get(User, cible_id).nom if db.get(User, cible_id) else "—")
    if action == "retirer":
        db.delete(cible)
        _message_systeme(db, id, f"{nom} a été retiré de la salle par {user.nom}")
    elif action == "bloquer":
        cible.statut = "bloque"
        _message_systeme(db, id, f"{nom} a été bloqué par {user.nom}")
    db.commit()
    journal.info("Room Live : %s de l'utilisateur %s dans la salle %s par %s", action, cible_id, id, user.id)
    await centre.expulser(id, cible_id, action)
    await centre.diffuser(id, {"type": "membres"})


@router.post("/{id}/membres/{uid}/retirer")
async def retirer(id: int, uid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    await _moderer(db, user, id, uid, "retirer")
    return {"message": "Participant retiré"}


@router.post("/{id}/membres/{uid}/bloquer")
async def bloquer(id: int, uid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    await _moderer(db, user, id, uid, "bloquer")
    return {"message": "Participant bloqué"}


@router.post("/{id}/membres/{uid}/debloquer")
async def debloquer(id: int, uid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _acces(db, user, id, gestion=True)
    cible = _membre(db, id, uid)
    if not cible or cible.statut != "bloque":
        raise HTTPException(status_code=404, detail="Participant introuvable")
    db.delete(cible)                    # débloqué : il pourra être invité de nouveau
    db.commit()
    await centre.diffuser(id, {"type": "membres"})
    return {"message": "Participant débloqué"}


class ChangementRole(BaseModel):
    role: str


@router.put("/{id}/membres/{uid}/role")
async def changer_role(id: int, uid: int, c: ChangementRole, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _, moi = _acces(db, user, id)
    if moi.role != "hote":
        raise HTTPException(status_code=403, detail="Réservé à l'hôte de la salle")
    cible = _membre(db, id, uid)
    if c.role not in ("moderateur", "participant") or not cible or cible.statut == "bloque" or uid == user.id:
        raise HTTPException(status_code=422, detail="Changement de rôle impossible")
    cible.role = c.role
    db.commit()
    co = centre.salles.get(id, {}).get(uid)
    if co:
        co.role = c.role
    await centre.diffuser(id, {"type": "membres"})
    return {"message": "Rôle modifié"}


@router.post("/{id}/quitter")
async def quitter(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _, m = _acces(db, user, id)
    if m.role == "hote":
        raise HTTPException(status_code=409, detail="L'hôte termine la réunion au lieu de la quitter")
    db.delete(m)
    db.commit()
    await centre.expulser(id, user.id, "quitte", code=4000)
    await centre.diffuser(id, {"type": "membres"})
    return {"message": "Vous avez quitté la salle"}


@router.post("/{id}/terminer")
async def terminer(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    salle, m = _acces(db, user, id)
    if m.role != "hote":
        raise HTTPException(status_code=403, detail="Réservé à l'hôte de la salle")
    salle.active, salle.maj = False, datetime.now()
    _message_systeme(db, id, f"Réunion terminée par {user.nom}")
    db.commit()
    await centre.fermer_salle(id)
    return {"message": "Réunion terminée"}


def invitations_en_attente(db: Session, user: User) -> int:
    """Invitations à des réunions actives non encore rejointes (compteur des boutons flottants)."""
    return (db.query(MembreSalle).join(Salle, Salle.id == MembreSalle.salle_id)
            .filter(MembreSalle.utilisateur_id == user.id, MembreSalle.statut == "invite", Salle.active.is_(True)).count())


# ─────────────────────────────────────────────────────────────
# TEMPS RÉEL
# ─────────────────────────────────────────────────────────────
def _authentifier(jeton: str, salle_id: int):
    """Vérifie le jeton, la session et l'appartenance. Renvoie (user, role) ou lève HTTPException."""
    with SessionLocal() as db:
        session = get_current_session(HTTPAuthorizationCredentials(scheme="Bearer", credentials=jeton), db)
        user = get_current_user(session, db)
        salle, m = _acces(db, user, salle_id)
        if not salle.active:
            raise HTTPException(status_code=409, detail="La réunion est terminée")
        if m.statut == "invite":
            m.statut = "membre"                         # première entrée : l'invitation est acceptée
        salle.maj = datetime.now()
        identite, role = SimpleNamespace(id=user.id, nom=user.nom), m.role
        db.commit()
        return identite, role


def _enregistrer_chat(salle_id: int, user: User, texte: str) -> dict:
    with SessionLocal() as db:
        if not _membre(db, salle_id, user.id) or _membre(db, salle_id, user.id).statut != "membre":
            raise PermissionError
        m = MessageSalle(salle_id=salle_id, auteur_id=user.id, type="texte", texte=texte, created_at=datetime.now())
        db.add(m)
        db.commit()
        return _serialiser_message(m, {user.id: user.nom})


async def _accueillir(ws: WebSocket, salle_id: int):
    """Authentification par le premier message, puis contrôle de la capacité de la salle.
    Renvoie la connexion du participant, ou None si l'accès est refusé (le WebSocket est alors fermé)."""
    try:
        donnees = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=DELAI_AUTH))
        if not isinstance(donnees, dict) or donnees.get("type") != "auth" or not isinstance(donnees.get("token"), str):
            raise ValueError
        user, role = await asyncio.to_thread(_authentifier, donnees["token"], salle_id)
    except HTTPException as e:
        await ws.send_json({"type": "erreur", "detail": e.detail if isinstance(e.detail, str) else "Accès refusé"})
        await ws.close(code=4003)
        return None
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(code=4001)
        return None
    presents = centre.salles.setdefault(salle_id, {})
    if user.id not in presents and len(presents) >= settings.ROOM_MAX_PARTICIPANTS:
        await ws.send_json({"type": "erreur", "detail": f"Salle complète ({settings.ROOM_MAX_PARTICIPANTS} participants au maximum)"})
        await ws.close(code=4008)
        return None
    if user.id in presents:                                 # même compte ouvert ailleurs : l'ancienne connexion est fermée
        await centre.expulser(salle_id, user.id, "ailleurs", code=4009)
    return Connexion(ws, user, role)


@router.websocket("/ws/{salle_id}")
async def temps_reel(ws: WebSocket, salle_id: int):
    await ws.accept()
    moi = await _accueillir(ws, salle_id)
    if moi is None:
        return
    user = moi
    autres = [c.publique() for c in centre.salles.setdefault(salle_id, {}).values()]
    centre.salles[salle_id][user.id] = moi
    await centre.envoyer(moi, {"type": "bienvenue", "moi": moi.publique(), "participants": autres, "ice": ice_serveurs()})
    await centre.diffuser(salle_id, {"type": "arrivee", "participant": moi.publique()}, sauf=user.id)

    try:
        while True:
            brut = await ws.receive_text()
            if len(brut) > TAILLE_MAX_MESSAGE:
                await centre.envoyer(moi, {"type": "erreur", "detail": "Message trop volumineux"})
                continue
            try:
                msg = json.loads(brut)
                genre = msg.get("type")
            except (ValueError, AttributeError):
                continue
            if centre.salles.get(salle_id, {}).get(user.id) is not moi:
                break                                       # retiré, bloqué ou ouvert ailleurs entre-temps
            await _traiter(salle_id, user, moi, genre, msg)
    except WebSocketDisconnect:
        pass
    finally:
        if centre.salles.get(salle_id, {}).get(user.id) is moi:
            centre.salles[salle_id].pop(user.id, None)
            await centre.diffuser(salle_id, {"type": "depart", "id": user.id})
            if not centre.salles[salle_id]:
                centre.salles.pop(salle_id, None)


async def _traiter(salle_id: int, user: User, moi: Connexion, genre: str, msg: dict):
    if genre == "chat":
        texte = str(msg.get("texte", "")).strip()
        if not texte or len(texte) > 2000:
            return
        maintenant = time.monotonic()
        while moi.envois and moi.envois[0] < maintenant - CHAT_FENETRE:
            moi.envois.popleft()
        if len(moi.envois) >= CHAT_MAX:
            await centre.envoyer(moi, {"type": "erreur", "detail": "Trop de messages : patientez quelques secondes"})
            return
        moi.envois.append(maintenant)
        try:
            message = await asyncio.to_thread(_enregistrer_chat, salle_id, user, texte)
        except PermissionError:
            return
        await centre.diffuser(salle_id, {"type": "chat", "message": message})
    elif genre == "signal":
        cible = centre.salles.get(salle_id, {}).get(msg.get("cible"))
        if cible and cible.id != user.id and isinstance(msg.get("donnees"), dict):
            await centre.envoyer(cible, {"type": "signal", "de": user.id, "donnees": msg["donnees"]})
    elif genre == "media":
        moi.micro, moi.camera = bool(msg.get("micro")), bool(msg.get("camera"))
        moi.ecran = bool(msg.get("ecran", False))
        await centre.diffuser(salle_id, {"type": "media", "id": user.id, "micro": moi.micro, "camera": moi.camera, "ecran": moi.ecran}, sauf=user.id)
    elif genre == "ping":
        await centre.envoyer(moi, {"type": "pong"})
