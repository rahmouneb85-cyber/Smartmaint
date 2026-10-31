"""Notifications de l'utilisateur connecté.

Isolation : chaque requête est filtrée sur l'identifiant du compte connecté, lu dans le jeton côté serveur.
Une notification d'un autre compte est traitée comme inexistante (404) : son existence n'est pas révélée."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.notifications import service  # noqa: F401  (enregistre les écouteurs d'événements)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _mes(db: Session, user: User):
    return db.query(Notification).filter(Notification.utilisateur_id == user.id)


def _serialiser(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "niveau": n.niveau, "titre": n.titre, "message": n.message, "page": n.page,
            "donnees": json.loads(n.donnees) if n.donnees else None,
            "objet_id": n.objet_id, "nombre": n.nombre, "lue": n.lue, "date": n.created_at}


@router.get("")
def lister(non_lues: bool = False, limite: int = 30, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = _mes(db, user)
    if non_lues:
        q = q.filter(Notification.lue.is_(False))
    return [_serialiser(n) for n in q.order_by(Notification.created_at.desc()).limit(max(1, min(limite, 100))).all()]


@router.get("/compteur")
def compteur(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Appel léger, interrogé régulièrement par les boutons flottants."""
    non_lues = _mes(db, user).filter(Notification.lue.is_(False))
    derniere = non_lues.order_by(Notification.created_at.desc()).first()
    from app.api.messagerie import messages_non_lus
    from app.api.support import compteurs as compteurs_support
    from app.api.rooms import invitations_en_attente
    return {**compteurs_support(db, user), "rooms_invitations": invitations_en_attente(db, user), "non_lues": non_lues.count(), "critiques": non_lues.filter(Notification.niveau == "critique").count(),
            "messages_non_lus": messages_non_lus(db, user),
            "derniere_id": derniere.id if derniere else None, "derniere_date": derniere.created_at if derniere else None}


def _la_mienne(db: Session, user: User, id: int) -> Notification:
    n = _mes(db, user).filter(Notification.id == id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    return n


@router.post("/{id}/lue")
def marquer_lue(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = _la_mienne(db, user, id)
    n.lue = True
    db.commit()
    return {"message": "Notification lue"}


@router.post("/tout-lire")
def tout_lire(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = _mes(db, user).filter(Notification.lue.is_(False)).update({Notification.lue: True}, synchronize_session=False)
    db.commit()
    return {"message": "Notifications lues", "nombre": n}


@router.delete("/{id}")
def supprimer(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(_la_mienne(db, user, id))
    db.commit()
    return {"message": "Notification supprimée"}
