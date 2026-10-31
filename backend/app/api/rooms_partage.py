"""Room Live : partage de fichiers et modération en direct.

Fichiers
  • Seuls les membres entrés dans une réunion active peuvent déposer un fichier ; seuls les membres de la salle
    peuvent le télécharger (404 pour toute autre personne).
  • Types acceptés : PDF, images, documents Word, Excel, PowerPoint, texte et CSV, contrôlés sur leur contenu
    réel et pas seulement sur leur extension ; taille limitée (ROOM_FICHIER_MAX_MO).
  • Le fichier reçoit un nom aléatoire sur le disque et n'est jamais servi directement : il est toujours
    téléchargé comme pièce jointe (jamais affiché ni exécuté par le navigateur depuis le serveur).

Modération en direct
  • L'hôte et les modérateurs peuvent demander à un participant connecté de couper son micro ou sa caméra,
    ou couper tous les micros. La demande est appliquée par l'application du participant, qui le prévient ;
    personne ne peut rallumer à distance le micro ou la caméra d'un autre.
"""
import re
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.rooms import ROLES_GESTION, _acces, _membre, _message_systeme, centre
from app.core.config import settings
from app.core.database import get_db
from app.core.journaux import journal
from app.core.security import get_current_user
from app.models.room import FichierSalle, MessageSalle
from app.models.user import User

router = APIRouter(prefix="/rooms", tags=["Room Live"])

# extension → (type MIME, signatures possibles du début du fichier ; None = fichier texte)
TYPES = {
    ".pdf": ("application/pdf", [b"%PDF"]),
    ".png": ("image/png", [b"\x89PNG\r\n\x1a\n"]),
    ".jpg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".jpeg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".webp": ("image/webp", [b"RIFF"]),
    ".gif": ("image/gif", [b"GIF87a", b"GIF89a"]),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [b"PK\x03\x04"]),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [b"PK\x03\x04"]),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", [b"PK\x03\x04"]),
    ".doc": ("application/msword", [b"\xd0\xcf\x11\xe0"]),
    ".xls": ("application/vnd.ms-excel", [b"\xd0\xcf\x11\xe0"]),
    ".txt": ("text/plain", None),
    ".csv": ("text/csv", None),
}


def dossier() -> Path:
    return Path(settings.ROOM_DOSSIER)


def nom_propre(nom: str) -> str:
    """Nom affiché : sans chemin, sans caractères de contrôle ni caractères réservés, 120 caractères au plus."""
    nom = unicodedata.normalize("NFC", Path(nom or "fichier").name)
    nom = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]', "_", nom).strip(" .") or "fichier"
    base, ext = Path(nom).stem[:110], Path(nom).suffix.lower()
    return f"{base}{ext}"


def verifier_contenu(ext: str, contenu: bytes):
    if ext not in TYPES:
        raise HTTPException(status_code=415, detail="Type de fichier non accepté (PDF, image, Word, Excel, PowerPoint, texte ou CSV)")
    mime, signatures = TYPES[ext]
    if signatures is None:
        if b"\x00" in contenu[:4096]:
            raise HTTPException(status_code=415, detail="Le contenu ne correspond pas à un fichier texte")
    elif not any(contenu.startswith(s) for s in signatures) or (ext == ".webp" and contenu[8:12] != b"WEBP"):
        raise HTTPException(status_code=415, detail="Le contenu du fichier ne correspond pas à son extension")
    return mime


def serialiser_fichier(f: FichierSalle) -> dict:
    return {"id": f.id, "nom": f.nom, "taille": f.taille, "type": f.type_mime, "auteur_id": f.auteur_id, "date": f.created_at.isoformat(),
            "image": f.type_mime.startswith("image/")}


@router.post("/{id}/fichiers")
async def deposer(id: int, fichier: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    salle, m = _acces(db, user, id)
    if not salle.active:
        raise HTTPException(status_code=409, detail="La réunion est terminée")
    if m.statut != "membre":
        raise HTTPException(status_code=403, detail="Rejoignez la réunion avant de partager un fichier")
    maximum = settings.ROOM_FICHIER_MAX_MO * 1024 * 1024
    contenu = await fichier.read(maximum + 1)
    if len(contenu) > maximum:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux ({settings.ROOM_FICHIER_MAX_MO} Mo maximum)")
    if not contenu:
        raise HTTPException(status_code=422, detail="Fichier vide")
    nom = nom_propre(fichier.filename)
    ext = Path(nom).suffix.lower()
    mime = verifier_contenu(ext, contenu)
    dossier().mkdir(parents=True, exist_ok=True)
    chemin = f"{uuid.uuid4().hex}{ext}"
    (dossier() / chemin).write_bytes(contenu)
    maintenant = datetime.now()
    message = MessageSalle(salle_id=id, auteur_id=user.id, type="fichier", texte=nom, created_at=maintenant)
    db.add(message)
    db.flush()
    f = FichierSalle(salle_id=id, message_id=message.id, auteur_id=user.id, nom=nom, chemin=chemin, type_mime=mime,
                     taille=len(contenu), created_at=maintenant)
    db.add(f)
    db.commit()
    journal.info("Room Live : fichier %s déposé dans la salle %s par %s", f.id, id, user.id)
    diffuse = {"id": message.id, "type": "fichier", "texte": nom, "auteur": {"id": user.id, "nom": user.nom},
               "date": maintenant.isoformat(), "fichier": serialiser_fichier(f)}
    await centre.diffuser(id, {"type": "chat", "message": diffuse})
    return diffuse


@router.get("/{id}/fichiers")
def lister_fichiers(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _acces(db, user, id)
    return [serialiser_fichier(f) for f in db.query(FichierSalle).filter(FichierSalle.salle_id == id).order_by(FichierSalle.id.desc()).limit(200)]


def _fichier(db: Session, user: User, id: int, fid: int) -> FichierSalle:
    _acces(db, user, id)
    f = db.query(FichierSalle).filter(FichierSalle.id == fid, FichierSalle.salle_id == id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return f


@router.get("/{id}/fichiers/{fid}")
def telecharger(id: int, fid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = _fichier(db, user, id, fid)
    chemin = (dossier() / f.chemin).resolve()
    if dossier().resolve() not in chemin.parents or not chemin.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    ascii_nom = f.nom.encode("ascii", "ignore").decode() or "fichier"
    return FileResponse(chemin, media_type=f.type_mime, headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_nom}\"; filename*=UTF-8''{quote(f.nom)}",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox"})


@router.delete("/{id}/fichiers/{fid}")
async def supprimer(id: int, fid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    f = _fichier(db, user, id, fid)
    m = _membre(db, id, user.id)
    if f.auteur_id != user.id and m.role not in ROLES_GESTION:
        raise HTTPException(status_code=403, detail="Seul l'auteur, l'hôte ou un modérateur peut retirer ce fichier")
    (dossier() / f.chemin).unlink(missing_ok=True)
    if f.message_id and (msg := db.get(MessageSalle, f.message_id)):
        msg.type, msg.auteur_id, msg.texte = "systeme", None, f"Fichier « {f.nom} » retiré par {user.nom}"
    db.delete(f)
    db.commit()
    await centre.diffuser(id, {"type": "fichier_retire", "fichier_id": fid, "message_id": f.message_id})
    return {"message": "Fichier retiré"}


# ─────────────────────────────────────────────────────────────
# MODÉRATION EN DIRECT
# ─────────────────────────────────────────────────────────────
class Coupure(BaseModel):
    peripherique: str = "micro"


async def _demander_coupure(id: int, cible_id: int, peripherique: str, par: str):
    c = centre.salles.get(id, {}).get(cible_id)
    if c:
        await centre.envoyer(c, {"type": "moderation", "peripherique": peripherique, "par": par})
    return bool(c)


@router.post("/{id}/membres/{uid}/couper")
async def couper(id: int, uid: int, c: Coupure, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _, moi = _acces(db, user, id, gestion=True)
    cible = _membre(db, id, uid)
    if c.peripherique not in ("micro", "camera"):
        raise HTTPException(status_code=422, detail="Périphérique inconnu")
    if not cible or uid == user.id or cible.statut == "bloque":
        raise HTTPException(status_code=404, detail="Participant introuvable")
    if cible.role == "hote" or (cible.role == "moderateur" and moi.role != "hote"):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modérer ce participant")
    if not await _demander_coupure(id, uid, c.peripherique, user.nom):
        raise HTTPException(status_code=409, detail="Ce participant n'est pas connecté à la réunion")
    return {"message": "Demande envoyée"}


@router.post("/{id}/couper-micros")
async def couper_micros(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _, moi = _acces(db, user, id, gestion=True)
    touches = 0
    for uid in centre.presents(id):
        cible = _membre(db, id, uid)
        if uid == user.id or not cible or cible.role == "hote" or (cible.role == "moderateur" and moi.role != "hote"):
            continue
        touches += await _demander_coupure(id, uid, "micro", user.nom)
    _message_systeme(db, id, f"{user.nom} a coupé les micros des participants")
    db.commit()
    return {"participants": touches}
