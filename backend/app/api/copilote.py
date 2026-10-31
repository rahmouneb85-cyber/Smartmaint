"""Routes du copilote de maintenance : questions (en streaming), actions à confirmer, base de connaissances."""
import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.copilote import agent, llm, outils, recherche
from app.core.database import get_db, SessionLocal
from app.core.security import get_current_user, exiger_roles
from app.core.sessions import journaliser
from app.models.copilote import CopiloteAction, CopiloteDocument, CopiloteEchange
from app.models.user import User

router = APIRouter(prefix="/copilote", tags=["Copilote IA"])


class MessageHisto(BaseModel):
    role: str
    content: str


class Question(BaseModel):
    question: str
    historique: List[MessageHisto] = []
    langue: str = "fr"


class Avis(BaseModel):
    avis: int   # 1 ou -1


@router.post("/question")
def poser_question(data: Question, user: User = Depends(get_current_user)):
    """Réponse en streaming (une ligne JSON par événement) : étapes de l'agent, puis réponse finale."""
    if not data.question.strip():
        raise HTTPException(status_code=400, detail="Question vide")
    user_id = user.id

    def flux():
        db = SessionLocal()   # session propre au flux : la réponse continue après la fin de la requête initiale
        try:
            u = db.query(User).filter(User.id == user_id).first()
            for evenement in agent.executer(db, u, data.question.strip(), [m.model_dump() for m in data.historique], data.langue):
                yield json.dumps(evenement, ensure_ascii=False, default=str) + "\n"
        except Exception as e:
            yield json.dumps({"type": "erreur", "message": f"Erreur inattendue : {str(e)[:200]}"}, ensure_ascii=False) + "\n"
        finally:
            db.close()

    return StreamingResponse(flux(), media_type="application/x-ndjson")


@router.post("/actions/{id}/confirmer")
def confirmer_action(id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    action = db.query(CopiloteAction).filter(CopiloteAction.id == id, CopiloteAction.utilisateur_id == user.id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action introuvable")
    if action.statut != "en_attente":
        raise HTTPException(status_code=409, detail=f"Action déjà {action.statut}")
    if (datetime.now() - action.created_at).total_seconds() > 3600:
        action.statut = "annulee"
        db.commit()
        raise HTTPException(status_code=410, detail="Action expirée (plus d'une heure) : reposez la question")
    try:
        resultat = outils.executer_action(db, action)
        action.statut, action.resultat = "confirmee", json.dumps(resultat, ensure_ascii=False)
    except Exception as e:
        db.rollback()
        action.statut, action.resultat = "echec", str(e)[:500]
        db.commit()
        raise HTTPException(status_code=500, detail=f"Échec de l'action : {e}") from e
    action.traitee_le = datetime.now()
    db.commit()
    journaliser(db, request, "copilote_action", email=user.email, utilisateur_id=user.id,
                details=f"{action.resume} → {resultat.get('numero')}")
    return {"message": f"Intervention {resultat['numero']} créée", **resultat}


@router.post("/actions/{id}/annuler")
def annuler_action(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    action = db.query(CopiloteAction).filter(CopiloteAction.id == id, CopiloteAction.utilisateur_id == user.id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action introuvable")
    if action.statut == "en_attente":
        action.statut, action.traitee_le = "annulee", datetime.now()
        db.commit()
    return {"message": "Action annulée"}


@router.post("/echanges/{id}/avis")
def donner_avis(id: int, data: Avis, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    e = db.query(CopiloteEchange).filter(CopiloteEchange.id == id, CopiloteEchange.utilisateur_id == user.id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Échange introuvable")
    e.avis = 1 if data.avis > 0 else -1
    db.commit()
    return {"message": "Merci pour votre avis"}


@router.get("/statut")
def statut(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = llm.statut()
    s["documents_indexes"] = db.query(CopiloteDocument).count()
    s["documents_avec_vecteurs"] = db.query(CopiloteDocument).filter(CopiloteDocument.embedding.isnot(None)).count()
    return s


@router.post("/indexer", dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def indexer(db: Session = Depends(get_db)):
    return {"message": "Base de connaissances mise à jour", **recherche.indexer(db)}


@router.get("/statistiques", dependencies=[Depends(exiger_roles("admin"))])
def statistiques(db: Session = Depends(get_db)):
    q = db.query(CopiloteEchange)
    total = q.count()
    return {
        "questions": total,
        "duree_moyenne_ms": int(db.query(func.avg(CopiloteEchange.duree_ms)).scalar() or 0),
        "avis_positifs": q.filter(CopiloteEchange.avis == 1).count(),
        "avis_negatifs": q.filter(CopiloteEchange.avis == -1).count(),
        "sans_reponse": q.filter(CopiloteEchange.reponse.is_(None)).count(),
        "actions_confirmees": db.query(CopiloteAction).filter(CopiloteAction.statut == "confirmee").count(),
        "actions_annulees": db.query(CopiloteAction).filter(CopiloteAction.statut == "annulee").count(),
    }
