"""Traitement intelligent des documents : dépôt, lecture, contrôles, validation.
Un bon d'intervention lu n'est jamais enregistré directement : l'utilisateur relit les champs, corrige si besoin,
et l'intervention n'est créée que s'il n'y a plus d'erreur bloquante."""
import base64
import binascii
import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.copilote import recherche
from app.copilote.outils import numero_intervention
from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, exiger_roles
from app.core.sessions import journaliser
from app.idp import controles, extraction, lecture
from app.models.copilote import CopiloteDocument
from app.models.document_idp import DocumentIDP
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["Documents (IDP)"])
DOSSIER = Path(settings.IDP_DOSSIER)
TYPES = {"bon_intervention", "manuel"}


class Depot(BaseModel):
    nom: str
    contenu: str                 # fichier encodé en base64
    type_document: str = "bon_intervention"


class Champs(BaseModel):
    champs: dict


def _role(user):
    return getattr(user.role, "value", user.role)


def _choix(db: Session) -> dict:
    """Listes proposées dans le formulaire de correction."""
    return {"equipements": [{"id": e.id, "nom": e.nom} for e in db.query(Equipment).order_by(Equipment.nom).all()],
            "techniciens": [{"id": u.id, "nom": u.nom} for u in db.query(User).filter(User.role == "technicien", User.actif.is_(True)).order_by(User.nom).all()]}


def _serialiser(doc: DocumentIDP, db: Session, details=True) -> dict:
    d = {"id": doc.id, "type_document": doc.type_document, "nom_fichier": doc.nom_fichier, "format": doc.format,
         "taille": doc.taille, "statut": doc.statut, "methode": doc.methode, "pages": doc.pages, "duree_ms": doc.duree_ms,
         "message": doc.message, "created_at": doc.created_at, "traite_le": doc.traite_le, "intervention_id": doc.intervention_id}
    if doc.intervention_id:
        i = db.get(Intervention, doc.intervention_id)
        d["intervention_numero"] = numero_intervention(i) if i else None
    if details:
        d.update({"texte": (doc.texte or "")[:20000], "donnees": json.loads(doc.donnees or "{}"),
                  "verification": json.loads(doc.controles or "{}"), "choix": _choix(db)})
    return d


def _document(db, id, user) -> DocumentIDP:
    doc = db.get(DocumentIDP, id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    if doc.utilisateur_id != user.id and _role(user) not in ("admin", "superviseur"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    return doc


def _verification_json(v: dict) -> str:
    r = {k: (x.strftime("%Y-%m-%d %H:%M") if isinstance(x, datetime) else x) for k, x in v["resolus"].items()}
    return json.dumps({**v, "resolus": r}, ensure_ascii=False)


@router.post("/analyser")
def analyser(data: Depot, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lit un document déposé. Bon d'intervention : extraction des champs et contrôles. Manuel : ajout à la base de connaissances."""
    if data.type_document not in TYPES:
        raise HTTPException(status_code=400, detail="Type de document inconnu")
    if data.type_document == "manuel" and _role(user) not in ("admin", "superviseur"):
        raise HTTPException(status_code=403, detail="Seuls les administrateurs et superviseurs ajoutent des manuels")
    nom = re.sub(r"[^\w.\- ()À-ÿ]", "_", Path(data.nom).name)[:200] or "document"
    try:
        contenu = base64.b64decode(data.contenu.split(",")[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Fichier mal encodé") from None
    if len(contenu) > settings.IDP_TAILLE_MAX_MO * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (maximum {settings.IDP_TAILLE_MAX_MO} Mo)")
    try:
        lu = lecture.lire(nom, contenu)
    except lecture.ErreurLecture as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    empreinte = hashlib.sha256(contenu).hexdigest()
    deja = db.query(DocumentIDP).filter(DocumentIDP.empreinte == empreinte, DocumentIDP.type_document == data.type_document,
                                        DocumentIDP.statut.in_(["valide", "indexe"])).first()
    DOSSIER.mkdir(exist_ok=True)
    chemin = DOSSIER / f"{empreinte}{Path(nom).suffix.lower()}"
    if not chemin.exists():
        chemin.write_bytes(contenu)
    doc = DocumentIDP(utilisateur_id=user.id, type_document=data.type_document, nom_fichier=nom, format=lu["format"],
                      taille=len(contenu), empreinte=empreinte, chemin=str(chemin), statut="a_valider",
                      pages=lu.get("pages"), created_at=datetime.now())
    debut = datetime.now()

    if data.type_document == "bon_intervention":
        ex = extraction.extraire_bon(lu)
        v = controles.verifier(db, ex["champs"], ex["confiance"])
        if deja:
            v["controles"].insert(0, {"niveau": "avertissement", "champ": None,
                                      "message": f"Ce fichier a déjà été traité le {deja.created_at:%d/%m/%Y}"})
        doc.texte = ex["texte_lu"] if isinstance(ex["texte_lu"], str) else lu["texte"]
        doc.methode = ex["methode"]
        doc.donnees = json.dumps({"champs": ex["champs"], "confiance": ex["confiance"], "remarques": ex["remarques"]},
                                 ensure_ascii=False, default=str)
        doc.controles = _verification_json(v)
        if not any(ex["champs"].values()):
            doc.statut, doc.message = "erreur", "Aucune information de bon d'intervention trouvée dans ce document"
    else:
        texte = lu["texte"]
        doc.methode = "texte du fichier"
        if lu.get("scanne") and lu.get("images"):          # manuel scanné : transcription des premières pages
            transcrit = _transcrire(lu["images"])
            texte, doc.methode = transcrit if transcrit else (lecture.ocr_local(lu["images"]), "lecteur local")
        if not (texte or "").strip():
            doc.statut, doc.message, doc.texte = "erreur", "Aucun texte lisible dans ce document", ""
        else:
            doc.texte = texte
            db.add(doc)
            db.flush()
            n = recherche.ajouter_document(db, "manuel", doc.id, Path(nom).stem, texte)
            doc.statut, doc.message = "indexe", f"Ajouté à la base de connaissances du copilote ({n} passage(s))"
            doc.traite_le = datetime.now()
    doc.duree_ms = int((datetime.now() - debut).total_seconds() * 1000)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    journaliser(db, request, "document_depose", email=user.email, utilisateur_id=user.id,
                details=f"{doc.type_document} « {nom} » ({doc.format}, {doc.statut})")
    return _serialiser(doc, db)


def _transcrire(images):
    """Transcrit les pages scannées d'un manuel avec le modèle de vision. Renvoie (texte, méthode) ou None."""
    from app.copilote import llm
    contenu = [{"type": "text", "text": "Transcris fidèlement tout le texte de ces pages, sans commentaire."}]
    contenu += [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(p).decode()}} for p in images]
    try:
        r = llm.discuter([{"role": "user", "content": contenu}], None, modele_local=settings.IDP_MODELE_VISION_LOCAL)
        return r["contenu"], f"{r['fournisseur']} ({r['modele']})"
    except llm.ErreurLLM:
        return None


@router.post("/{id}/verifier")
def reverifier(id: int, data: Champs, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Relance les contrôles avec les champs corrigés par l'utilisateur."""
    doc = _document(db, id, user)
    d = json.loads(doc.donnees or "{}")
    v = controles.verifier(db, data.champs, {})       # champs relus par l'utilisateur : plus de doute de lecture
    d["corrections"] = data.champs
    doc.donnees = json.dumps(d, ensure_ascii=False, default=str)
    doc.controles = _verification_json(v)
    db.commit()
    return _serialiser(doc, db)


@router.post("/{id}/valider")
def valider(id: int, data: Champs, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Crée l'intervention à partir des champs relus, uniquement s'il ne reste aucune erreur."""
    doc = _document(db, id, user)
    if doc.type_document != "bon_intervention":
        raise HTTPException(status_code=400, detail="Seuls les bons d'intervention se valident")
    if doc.statut == "valide":
        raise HTTPException(status_code=409, detail="Ce document a déjà été validé")
    v = controles.verifier(db, data.champs, {})
    doc.controles = _verification_json(v)
    if v["bloquant"]:
        db.commit()
        raise HTTPException(status_code=422, detail={"message": "Des erreurs doivent être corrigées",
                                                     "controles": [c for c in v["controles"] if c["niveau"] == "erreur"]})
    r, c = v["resolus"], data.champs
    i = Intervention(equipement_id=r["equipement_id"], technicien_id=r.get("technicien_id"), alerte_id=r.get("alerte_id"),
                     type_intervention=r["type_intervention"], priorite=r["priorite"], statut=v["statut_prevu"],
                     description=(c.get("description") or "").strip()[:2000] + f"\n(Saisie automatique depuis le document « {doc.nom_fichier} »)",
                     diagnostic=c.get("diagnostic") or None, actions_realisees=c.get("actions_realisees") or None,
                     pieces_remplacees=c.get("pieces_remplacees") or None, observations=c.get("observations") or None,
                     date_intervention=r["date_debut"], date_debut=r["date_debut"] if v["statut_prevu"] != "planifiee" else None,
                     date_fin=r["date_fin"] if v["statut_prevu"] == "terminee" else None)
    db.add(i)
    if r.get("alerte_id"):
        from app.models.alert import Alert
        a = db.get(Alert, r["alerte_id"])
        if a:
            a.acquittee = True
    db.flush()
    d = json.loads(doc.donnees or "{}")
    d["corrections"] = c
    doc.donnees = json.dumps(d, ensure_ascii=False, default=str)
    doc.statut, doc.intervention_id, doc.traite_le = "valide", i.id, datetime.now()
    doc.message = f"Intervention {numero_intervention(i)} créée"
    db.commit()
    journaliser(db, request, "document_valide", email=user.email, utilisateur_id=user.id,
                details=f"« {doc.nom_fichier} » → {numero_intervention(i)}")
    return _serialiser(doc, db)


@router.post("/{id}/rejeter")
def rejeter(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = _document(db, id, user)
    if doc.statut == "valide":
        raise HTTPException(status_code=409, detail="Un document validé ne peut plus être rejeté")
    doc.statut, doc.traite_le, doc.message = "rejete", datetime.now(), "Rejeté par l'utilisateur"
    db.commit()
    return _serialiser(doc, db, details=False)


@router.get("")
def lister(type_document: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(DocumentIDP)
    if _role(user) not in ("admin", "superviseur"):
        q = q.filter(DocumentIDP.utilisateur_id == user.id)
    if type_document:
        q = q.filter(DocumentIDP.type_document == type_document)
    return [_serialiser(d, db, details=False) for d in q.order_by(DocumentIDP.id.desc()).limit(100).all()]


@router.get("/{id}")
def detail(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _serialiser(_document(db, id, user), db)


@router.get("/{id}/fichier")
def fichier(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = _document(db, id, user)
    chemin = Path(doc.chemin).resolve()
    if DOSSIER.resolve() not in chemin.parents or not chemin.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(chemin, filename=doc.nom_fichier)


@router.delete("/{id}", dependencies=[Depends(exiger_roles("admin"))])
def supprimer(id: int, db: Session = Depends(get_db)):
    """Supprime un document (et ses passages dans la base de connaissances). L'intervention créée est conservée."""
    doc = db.get(DocumentIDP, id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    db.query(CopiloteDocument).filter(CopiloteDocument.source_type == "manuel", CopiloteDocument.source_id == doc.id).delete()
    autres = db.query(DocumentIDP).filter(DocumentIDP.chemin == doc.chemin, DocumentIDP.id != doc.id).count()
    if not autres:
        try:
            os.remove(doc.chemin)
        except OSError:
            pass
    db.delete(doc)
    db.commit()
    return {"message": "Document supprimé"}
