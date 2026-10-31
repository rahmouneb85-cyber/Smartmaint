"""Assistance intelligente à la saisie des interventions."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, exiger_roles
from app.models.saisie_usage import SaisieUsage
from app.models.user import User
from app.saisie import propositions, suggestions

router = APIRouter(prefix="/saisie", tags=["Saisie intelligente"])


class DemandeSuggestion(BaseModel):
    champ: str
    texte: str = ""
    equipement_id: Optional[int] = None
    langue: str = "fr"


class DemandeProposition(BaseModel):
    equipement_id: Optional[int] = None
    description: str = ""
    alerte_id: Optional[int] = None
    type_intervention: Optional[str] = None
    avec_ia: bool = True
    intervention_id: Optional[int] = None       # compte rendu : intervention à exclure des comparaisons


class DemandeReformulation(BaseModel):
    texte: str
    champ: str = "description"


class Usage(BaseModel):
    type_aide: str
    champ: Optional[str] = None
    source: Optional[str] = None
    accepte: bool = True
    caracteres_economises: Optional[int] = None


@router.post("/suggestions")
def suggerer(d: DemandeSuggestion, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return suggestions.suggerer(db, d.champ, d.texte[:2000], d.equipement_id, d.langue)


@router.post("/proposer")
def proposer(d: DemandeProposition, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return propositions.proposer(db, d.equipement_id, d.description[:2000], d.alerte_id, d.type_intervention,
                                 d.avec_ia, d.intervention_id)


@router.post("/reformuler")
def reformuler(d: DemandeReformulation, user: User = Depends(get_current_user)):
    return propositions.reformuler(d.texte[:3000], d.champ)


@router.post("/usage")
def usage(u: Usage, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.add(SaisieUsage(utilisateur_id=user.id, type_aide=u.type_aide[:20], champ=(u.champ or "")[:40], source=(u.source or "")[:20],
                       accepte=u.accepte, caracteres_economises=u.caracteres_economises, created_at=datetime.now()))
    db.commit()
    return {"ok": True}


@router.get("/statistiques", dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def statistiques(db: Session = Depends(get_db)):
    res = {}
    for t, in db.query(SaisieUsage.type_aide).distinct().all():
        q = db.query(SaisieUsage).filter(SaisieUsage.type_aide == t)
        total, acceptes = q.count(), q.filter(SaisieUsage.accepte.is_(True)).count()
        res[t] = {"total": total, "acceptes": acceptes, "taux_acceptation": round(100 * acceptes / total) if total else 0,
                  "caracteres_economises": int(q.with_entities(func.sum(SaisieUsage.caracteres_economises)).scalar() or 0)}
    return res
