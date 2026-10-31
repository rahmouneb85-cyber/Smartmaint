"""Support : signaler un problème avec une capture d'écran et suivre sa demande.

Isolation des données, contrôlée par le serveur :
  • un utilisateur ne voit que ses propres demandes, leurs réponses et leurs captures ;
  • les administrateurs et superviseurs voient toutes les demandes, répondent et changent leur statut ;
  • pour toute autre personne, une demande est traitée comme inexistante (404), sans révéler son existence.

Sécurité des captures : seules les images PNG, JPEG et WebP sont acceptées (contrôle du contenu réel, pas de
l'extension), dans la limite de SUPPORT_TAILLE_MAX_MO. Chaque image est décodée puis réenregistrée par le
serveur : les métadonnées (position GPS, appareil) et tout contenu caché sont supprimés. Le fichier reçoit un
nom aléatoire et n'est jamais servi directement : il passe par une route qui vérifie les droits.
"""
import io
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.notification import Notification
from app.models.support import DemandeSupport, ReponseSupport
from app.models.user import User
from app.notifications.service import creer as creer_notification, destinataires

router = APIRouter(prefix="/support", tags=["Support"])

GESTION = ("admin", "superviseur")
CATEGORIES = ("probleme", "question", "amelioration")
STATUTS = ("ouverte", "en_cours", "resolue", "fermee")
FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}
LARGEUR_MAX = 2560
DEMANDES_PAR_HEURE = 10


def dossier() -> Path:
    return Path(settings.SUPPORT_DOSSIER)


def _role(user: User) -> str:
    return getattr(user.role, "value", user.role)


def est_gestion(user: User) -> bool:
    return _role(user) in GESTION


def demandes_visibles(db: Session, user: User):
    """Point unique du contrôle d'accès : ses propres demandes, ou toutes pour l'administration."""
    q = db.query(DemandeSupport)
    return q if est_gestion(user) else q.filter(DemandeSupport.utilisateur_id == user.id)


def _visible(db: Session, user: User, id: int) -> DemandeSupport:
    d = demandes_visibles(db, user).filter(DemandeSupport.id == id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    return d


def _comptes_gestion(db: Session) -> list:
    return destinataires(db.connection(), roles=list(GESTION))


def _notifier(db: Session, utilisateurs: list, **kwargs):
    if utilisateurs:
        creer_notification(db.connection(), utilisateurs, **kwargs)


def _noms(db: Session, ids) -> dict:
    ids = {i for i in ids if i}
    return {u.id: u.nom for u in db.query(User).filter(User.id.in_(ids))} if ids else {}


def _serialiser(d: DemandeSupport, noms: dict, details: bool = False, db: Session = None) -> dict:
    r = {"id": d.id, "sujet": d.sujet, "categorie": d.categorie, "statut": d.statut, "page": d.page,
         "capture": bool(d.capture), "auteur": {"id": d.utilisateur_id, "nom": noms.get(d.utilisateur_id)},
         "nouveau": not d.vue_par_auteur, "date": d.created_at, "maj": d.maj}
    if details:
        reponses = db.query(ReponseSupport).filter(ReponseSupport.demande_id == d.id).order_by(ReponseSupport.id).all()
        noms = {**noms, **_noms(db, [x.auteur_id for x in reponses])}
        r["description"] = d.description
        r["navigateur"] = d.navigateur
        r["reponses"] = [{"id": x.id, "texte": x.texte, "date": x.created_at, "auteur": noms.get(x.auteur_id),
                          "equipe": x.auteur_id != d.utilisateur_id} for x in reponses]
    return r


def _lire_capture(contenu: bytes) -> tuple:
    """Vérifie et réencode l'image. Renvoie (octets, extension)."""
    if len(contenu) > settings.SUPPORT_TAILLE_MAX_MO * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Capture trop volumineuse (maximum {settings.SUPPORT_TAILLE_MAX_MO} Mo)")
    try:
        with Image.open(io.BytesIO(contenu)) as img:
            if img.format not in FORMATS:
                raise HTTPException(status_code=415, detail="Format d'image non accepté (PNG, JPEG ou WebP)")
            if img.width * img.height > 40_000_000:
                raise HTTPException(status_code=413, detail="Image trop grande")
            img.load()
            image = img.copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise HTTPException(status_code=415, detail="Le fichier n'est pas une image valide (PNG, JPEG ou WebP)") from e
    if image.width > LARGEUR_MAX:
        image = image.resize((LARGEUR_MAX, round(image.height * LARGEUR_MAX / image.width)))
    sortie = io.BytesIO()
    if image.mode in ("RGBA", "LA", "P"):
        image.convert("RGBA").save(sortie, "PNG", optimize=True)
        return sortie.getvalue(), "png"
    image.convert("RGB").save(sortie, "JPEG", quality=85)
    return sortie.getvalue(), "jpg"


# ─────────────────────────────────────────────────────────────
# DEMANDES
# ─────────────────────────────────────────────────────────────
@router.post("/demandes")
async def creer(sujet: str = Form(..., min_length=3, max_length=150), description: str = Form(..., min_length=5, max_length=4000),
                categorie: str = Form("probleme"), page: Optional[str] = Form(None, max_length=40),
                navigateur: Optional[str] = Form(None, max_length=255), capture: Optional[UploadFile] = File(None),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if categorie not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Catégorie inconnue")
    recentes = db.query(DemandeSupport).filter(DemandeSupport.utilisateur_id == user.id,
                                               DemandeSupport.created_at >= datetime.now() - timedelta(hours=1)).count()
    if recentes >= DEMANDES_PAR_HEURE:
        raise HTTPException(status_code=429, detail="Trop de demandes envoyées : réessayez dans une heure")

    nom_fichier = None
    if capture is not None and capture.filename:
        octets, extension = _lire_capture(await capture.read(settings.SUPPORT_TAILLE_MAX_MO * 1024 * 1024 + 1))
        dossier().mkdir(parents=True, exist_ok=True)
        nom_fichier = f"{uuid.uuid4().hex}.{extension}"
        (dossier() / nom_fichier).write_bytes(octets)

    maintenant = datetime.now()
    d = DemandeSupport(utilisateur_id=user.id, sujet=sujet.strip(), description=description.strip(), categorie=categorie,
                       page=page, navigateur=navigateur, capture=nom_fichier, statut="ouverte", vue_par_auteur=True,
                       created_at=maintenant, maj=maintenant)
    db.add(d)
    db.flush()
    destinataires = [i for i in _comptes_gestion(db) if i != user.id]   # équipe de support, sauf l'auteur
    _notifier(db, destinataires, type_="support", niveau="attention" if categorie == "probleme" else "info",
                     titre=f"Nouvelle demande de support : {d.sujet}"[:200], message=f"{user.nom} : {d.description[:150]}",
                     objet_id=d.id, donnees={"modele": "support_nouvelle", "sujet": d.sujet[:80]})
    db.commit()
    return _serialiser(d, {user.id: user.nom})


@router.get("/demandes")
def lister(toutes: bool = False, statut: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Ses propres demandes ; `toutes=true` affiche aussi celles des autres pour l'administration seulement."""
    q = demandes_visibles(db, user) if toutes else db.query(DemandeSupport).filter(DemandeSupport.utilisateur_id == user.id)
    if statut:
        q = q.filter(DemandeSupport.statut == statut)
    liste = q.order_by(DemandeSupport.maj.desc()).limit(100).all()
    noms = _noms(db, [d.utilisateur_id for d in liste])
    return [_serialiser(d, noms) for d in liste]


@router.get("/demandes/{id}")
def detail(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _visible(db, user, id)
    if d.utilisateur_id == user.id and not d.vue_par_auteur:
        d.vue_par_auteur = True
    # les notifications liées à cette demande sont considérées comme lues
    db.query(Notification).filter(Notification.utilisateur_id == user.id, Notification.type == "support",
                                  Notification.objet_id == d.id, Notification.lue.is_(False)).update({"lue": True})
    db.commit()
    return _serialiser(d, _noms(db, [d.utilisateur_id]), details=True, db=db)


@router.get("/demandes/{id}/capture")
def voir_capture(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _visible(db, user, id)
    chemin = (dossier() / (d.capture or "")).resolve()
    if not d.capture or dossier().resolve() not in chemin.parents or not chemin.exists():
        raise HTTPException(status_code=404, detail="Aucune capture")
    return FileResponse(chemin, media_type="image/png" if chemin.suffix == ".png" else "image/jpeg",
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


class Reponse(BaseModel):
    texte: str = Field(..., min_length=1, max_length=4000)


@router.post("/demandes/{id}/reponses")
def repondre(id: int, r: Reponse, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = _visible(db, user, id)
    texte = r.texte.strip()
    if not texte:
        raise HTTPException(status_code=422, detail="Réponse vide")
    maintenant = datetime.now()
    db.add(ReponseSupport(demande_id=d.id, auteur_id=user.id, texte=texte, created_at=maintenant))
    d.maj = maintenant
    donnees = {"modele": "support_reponse", "sujet": d.sujet[:80]}
    if user.id == d.utilisateur_id:
        if d.statut in ("resolue", "fermee"):
            d.statut = "ouverte"                     # l'auteur relance sa demande
        gestion = [i for i in _comptes_gestion(db) if i != user.id]
        _notifier(db, gestion, type_="support", titre=f"Nouvelle réponse : {d.sujet}"[:200],
                         message=f"{user.nom} : {texte[:150]}", objet_id=d.id, donnees=donnees)
    else:
        if d.statut == "ouverte":
            d.statut = "en_cours"                    # prise en charge par l'équipe
        d.vue_par_auteur = False
        _notifier(db, [d.utilisateur_id], type_="support", titre=f"Nouvelle réponse : {d.sujet}"[:200],
                         message=texte[:150], objet_id=d.id, donnees=donnees)
    db.commit()
    return detail(id, db, user)


class ChangementStatut(BaseModel):
    statut: str


@router.put("/demandes/{id}/statut")
def changer_statut(id: int, c: ChangementStatut, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """L'administration peut choisir n'importe quel statut ; l'auteur peut seulement fermer sa demande."""
    d = _visible(db, user, id)
    if c.statut not in STATUTS:
        raise HTTPException(status_code=422, detail="Statut inconnu")
    if not est_gestion(user) and c.statut != "fermee":
        raise HTTPException(status_code=403, detail="Seule l'équipe de support peut changer ce statut")
    if d.statut != c.statut:
        d.statut = c.statut
        d.maj = datetime.now()
        if user.id != d.utilisateur_id:
            d.vue_par_auteur = False
            _notifier(db, [d.utilisateur_id], type_="support", niveau="info",
                             titre=f"Demande « {d.sujet} » : {c.statut}"[:200], objet_id=d.id,
                             donnees={"modele": "support_statut", "sujet": d.sujet[:80], "statut": c.statut})
        db.commit()
    return detail(id, db, user)


def compteurs(db: Session, user: User) -> dict:
    """Utilisé par le compteur des boutons flottants."""
    reponses = db.query(DemandeSupport).filter(DemandeSupport.utilisateur_id == user.id, DemandeSupport.vue_par_auteur.is_(False)).count()
    a_traiter = db.query(DemandeSupport).filter(DemandeSupport.statut == "ouverte").count() if est_gestion(user) else 0
    return {"support_reponses": reponses, "support_a_traiter": a_traiter}
