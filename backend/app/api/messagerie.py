"""Messagerie interne et contacts WhatsApp.

Isolation des données, contrôlée par le serveur :
  • une conversation n'est lisible et modifiable que par ses participants ; pour toute autre personne,
    elle est traitée comme inexistante (404), sans révéler son existence ;
  • le numéro WhatsApp d'un collègue n'est transmis que s'il a choisi de le partager ;
  • la liste des contacts autorisés est calculée en un seul endroit (contacts_autorises).
"""
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.messagerie import Conversation, Message, Participant
from app.models.user import User

router = APIRouter(prefix="/messagerie", tags=["Messagerie et WhatsApp"])


def _val(x):
    return getattr(x, "value", x)


def contacts_autorises(db: Session, user: User):
    """Utilisateurs que `user` peut contacter : les comptes actifs, sauf lui-même, dont le rôle est autorisé
    pour son propre rôle (Paramètres → contacts de la messagerie ; par défaut, tous les rôles)."""
    from app.api.boutons import contacts_par_role
    roles = contacts_par_role(db).get(_val(user.role), [])
    return db.query(User).filter(User.actif.is_(True), User.id != user.id, User.role.in_(roles))


def _contact(u: User) -> dict:
    numero = u.telephone if (u.telephone_visible and u.telephone) else None
    return {"id": u.id, "nom": u.nom, "role": _val(u.role), "whatsapp": numero}


@router.get("/contacts")
def contacts(q: str = "", limite: int = 50, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    requete = contacts_autorises(db, user)
    if q.strip():
        motif = f"%{q.strip()}%"
        requete = requete.filter(or_(User.nom.ilike(motif), User.email.ilike(motif)))
    return [_contact(u) for u in requete.order_by(User.nom).limit(max(1, min(limite, 200))).all()]


class Coordonnees(BaseModel):
    telephone: Optional[str] = Field(None, max_length=25)
    visible: bool = False


@router.put("/mes-coordonnees")
def mes_coordonnees(c: Coordonnees, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    numero = re.sub(r"[^\d]", "", c.telephone or "")
    if numero and not 8 <= len(numero) <= 15:
        raise HTTPException(status_code=422, detail="Numéro invalide : format international attendu, par exemple +213 6 12 34 56 78")
    user.telephone = numero or None
    user.telephone_visible = bool(numero) and c.visible
    db.commit()
    return {"telephone": user.telephone, "visible": user.telephone_visible}


# ─────────────────────────────────────────────────────────────
# CONVERSATIONS
# ─────────────────────────────────────────────────────────────
def _ma_participation(db: Session, user: User, conversation_id: int) -> Participant:
    p = db.query(Participant).filter(Participant.conversation_id == conversation_id, Participant.utilisateur_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return p


def _non_lus(db: Session, p: Participant) -> int:
    q = db.query(func.count(Message.id)).filter(Message.conversation_id == p.conversation_id, Message.auteur_id != p.utilisateur_id)
    if p.derniere_lecture:
        q = q.filter(Message.created_at > p.derniere_lecture)
    return q.scalar() or 0


def messages_non_lus(db: Session, user: User) -> int:
    return sum(_non_lus(db, p) for p in db.query(Participant).filter(Participant.utilisateur_id == user.id).all())


@router.get("/non-lus")
def non_lus(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"non_lus": messages_non_lus(db, user)}


@router.get("/conversations")
def conversations(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    resultat = []
    for p in db.query(Participant).filter(Participant.utilisateur_id == user.id).all():
        conv = db.get(Conversation, p.conversation_id)
        autre = (db.query(User).join(Participant, Participant.utilisateur_id == User.id)
                 .filter(Participant.conversation_id == conv.id, User.id != user.id).first())
        dernier = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.id.desc()).first()
        resultat.append({"id": conv.id, "contact": _contact(autre) if autre else None, "maj": conv.maj,
                         "dernier": {"texte": dernier.texte[:120], "moi": dernier.auteur_id == user.id} if dernier else None,
                         "non_lus": _non_lus(db, p)})
    return sorted(resultat, key=lambda c: c["maj"], reverse=True)


class NouvelleConversation(BaseModel):
    destinataire_id: int


@router.post("/conversations")
def ouvrir(d: NouvelleConversation, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Ouvre la conversation avec un contact autorisé (la crée si elle n'existe pas encore)."""
    autre = contacts_autorises(db, user).filter(User.id == d.destinataire_id).first()
    if not autre:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    mes_convs = {p.conversation_id for p in db.query(Participant).filter(Participant.utilisateur_id == user.id)}
    existante = db.query(Participant).filter(Participant.utilisateur_id == autre.id, Participant.conversation_id.in_(mes_convs)).first() if mes_convs else None
    if existante:
        return {"id": existante.conversation_id, "contact": _contact(autre)}
    maintenant = datetime.now()
    conv = Conversation(created_at=maintenant, maj=maintenant)
    db.add(conv)
    db.flush()
    db.add_all([Participant(conversation_id=conv.id, utilisateur_id=user.id, derniere_lecture=maintenant),
                Participant(conversation_id=conv.id, utilisateur_id=autre.id)])
    db.commit()
    return {"id": conv.id, "contact": _contact(autre)}


@router.get("/conversations/{id}/messages")
def lire(id: int, apres_id: int = 0, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = _ma_participation(db, user, id)
    msgs = (db.query(Message).filter(Message.conversation_id == id, Message.id > apres_id)
            .order_by(Message.id.desc()).limit(200).all())[::-1]
    p.derniere_lecture = datetime.now()
    db.commit()
    return [{"id": m.id, "texte": m.texte, "moi": m.auteur_id == user.id, "date": m.created_at} for m in msgs]


class NouveauMessage(BaseModel):
    texte: str = Field(min_length=1, max_length=2000)


@router.post("/conversations/{id}/messages")
def ecrire(id: int, m: NouveauMessage, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = _ma_participation(db, user, id)
    autre = db.query(Participant).filter(Participant.conversation_id == id, Participant.utilisateur_id != user.id).first()
    if autre and not contacts_autorises(db, user).filter(User.id == autre.utilisateur_id).first():
        raise HTTPException(status_code=403, detail="Ce contact n'est plus joignable depuis votre compte : l'historique reste consultable")
    texte = m.texte.strip()
    if not texte:
        raise HTTPException(status_code=422, detail="Message vide")
    maintenant = datetime.now()
    msg = Message(conversation_id=id, auteur_id=user.id, texte=texte, created_at=maintenant)
    db.add(msg)
    db.get(Conversation, id).maj = maintenant
    p.derniere_lecture = maintenant
    db.commit()
    return {"id": msg.id, "texte": msg.texte, "moi": True, "date": msg.created_at}
