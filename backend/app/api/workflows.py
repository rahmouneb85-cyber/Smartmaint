"""Routes des workflows automatiques (administrateurs et superviseurs)."""
import json
import threading
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db, SessionLocal
from app.core.security import exiger_roles, get_current_user
from app.core.sessions import journaliser
from app.models.equipment import Equipment
from app.models.user import User
from app.models.workflow import Workflow, WorkflowExecution
from app.workflows import catalogue as C
from app.workflows import evenements as E
from app.workflows import moteur

router = APIRouter(prefix="/workflows", tags=["Workflows automatiques"],
                   dependencies=[Depends(exiger_roles("admin", "superviseur"))])
router.add_event_handler("startup", moteur.demarrer)      # le moteur démarre avec le backend


class Action(BaseModel):
    type: str
    params: dict = {}
    en_cas_erreur: str = "continuer"
    tentatives: int = Field(3, ge=1, le=5)


class Declencheur(BaseModel):
    type: str
    params: dict = {}


class DonneesWorkflow(BaseModel):
    nom: str = Field(..., min_length=3, max_length=150)
    description: Optional[str] = None
    actif: bool = True
    declencheur: Declencheur
    actions: List[Action] = Field(..., min_length=1, max_length=10)
    max_par_heure: int = Field(20, ge=1, le=500)


def _verifier(d: DonneesWorkflow):
    if not C.definition(C.DECLENCHEURS, d.declencheur.type):
        raise HTTPException(status_code=422, detail=f"Déclencheur inconnu : {d.declencheur.type}")
    for a in d.actions:
        if not C.definition(C.ACTIONS, a.type):
            raise HTTPException(status_code=422, detail=f"Action inconnue : {a.type}")
        if a.en_cas_erreur not in ("continuer", "arreter"):
            raise HTTPException(status_code=422, detail="« en cas d'erreur » doit valoir continuer ou arreter")
        if a.type == "webhook" and not str(a.params.get("url", "")).startswith(("https://", "http://")):
            raise HTTPException(status_code=422, detail="L'adresse du webhook doit commencer par https://")
    if d.declencheur.type == "planifie":
        try:
            h, m = (int(x) for x in str(d.declencheur.params.get("heure", "08:00")).split(":")[:2])
            assert 0 <= h < 24 and 0 <= m < 60
        except (ValueError, AssertionError):
            raise HTTPException(status_code=422, detail="Heure invalide (format HH:MM)") from None


def _resume(db: Session, wf: Workflow) -> dict:
    q = db.query(WorkflowExecution.statut, func.count(WorkflowExecution.id)).filter(
        WorkflowExecution.workflow_id == wf.id).group_by(WorkflowExecution.statut).all()
    stats = {s: n for s, n in q}
    total = sum(n for s, n in stats.items() if s in ("succes", "partiel", "echec"))
    return {"id": wf.id, "nom": wf.nom, "description": wf.description, "actif": wf.actif,
            "declencheur": json.loads(wf.declencheur), "actions": json.loads(wf.actions), "max_par_heure": wf.max_par_heure,
            "echecs_consecutifs": wf.echecs_consecutifs, "desactive_raison": wf.desactive_raison,
            "prochaine_execution": wf.prochaine_execution, "derniere_execution": wf.derniere_execution,
            "statistiques": {"executions": total, "succes": stats.get("succes", 0), "partiel": stats.get("partiel", 0),
                             "echec": stats.get("echec", 0), "limite": stats.get("limite", 0),
                             "taux_reussite": round(100 * stats.get("succes", 0) / total) if total else None}}


def _serialiser_execution(db, ex: WorkflowExecution) -> dict:
    wf = db.get(Workflow, ex.workflow_id)
    return {"id": ex.id, "workflow_id": ex.workflow_id, "workflow": wf.nom if wf else "?", "cle": ex.cle, "statut": ex.statut,
            "origine": ex.origine, "evenement": json.loads(ex.evenement or "{}"), "etapes": json.loads(ex.etapes or "[]"),
            "erreur": ex.erreur, "debut": ex.debut, "fin": ex.fin,
            "duree_ms": int((ex.fin - ex.debut).total_seconds() * 1000) if ex.fin else None}


@router.get("/catalogue")
def catalogue(db: Session = Depends(get_db)):
    return {"declencheurs": C.DECLENCHEURS, "actions": C.ACTIONS, "variables": C.VARIABLES, "modeles": C.MODELES,
            "equipements": [{"id": e.id, "nom": e.nom} for e in db.query(Equipment).order_by(Equipment.nom).all()],
            "techniciens": [{"id": u.id, "nom": u.nom} for u in db.query(User).filter(User.role == "technicien", User.actif.is_(True)).all()],
            "telegram_configure": bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)}


@router.get("/moteur")
def etat_moteur(db: Session = Depends(get_db)):
    return {**moteur.ETAT, "intervalle_secondes": moteur.INTERVALLE,
            "workflows_actifs": db.query(Workflow).filter(Workflow.actif.is_(True)).count(),
            "executions_aujourdhui": db.query(WorkflowExecution).filter(
                WorkflowExecution.debut >= datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)).count()}


@router.get("")
def lister(db: Session = Depends(get_db)):
    return [_resume(db, wf) for wf in db.query(Workflow).order_by(Workflow.id).all()]


@router.post("")
def creer(d: DonneesWorkflow, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _verifier(d)
    maintenant = datetime.now()
    wf = Workflow(nom=d.nom.strip(), description=d.description, actif=d.actif, declencheur=d.declencheur.model_dump_json(),
                  actions=json.dumps([a.model_dump() for a in d.actions], ensure_ascii=False), max_par_heure=d.max_par_heure,
                  cree_par=user.id, created_at=maintenant, maj=maintenant)
    if d.declencheur.type == "planifie":
        wf.prochaine_execution = E.prochaine_echeance(d.declencheur.params, maintenant)
    db.add(wf)
    db.commit()
    db.refresh(wf)
    journaliser(db, request, "workflow_cree", email=user.email, utilisateur_id=user.id, details=wf.nom)
    return _resume(db, wf)


@router.put("/{id}")
def modifier(id: int, d: DonneesWorkflow, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf = db.get(Workflow, id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    _verifier(d)
    wf.nom, wf.description, wf.actif, wf.max_par_heure = d.nom.strip(), d.description, d.actif, d.max_par_heure
    wf.declencheur = d.declencheur.model_dump_json()
    wf.actions = json.dumps([a.model_dump() for a in d.actions], ensure_ascii=False)
    wf.prochaine_execution = E.prochaine_echeance(d.declencheur.params, datetime.now()) if d.declencheur.type == "planifie" else None
    if d.actif:
        wf.echecs_consecutifs, wf.desactive_raison = 0, None
    wf.maj = datetime.now()
    db.commit()
    journaliser(db, request, "workflow_modifie", email=user.email, utilisateur_id=user.id, details=wf.nom)
    return _resume(db, wf)


@router.post("/{id}/activer")
def activer(id: int, actif: bool, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf = db.get(Workflow, id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    wf.actif = actif
    if actif:
        wf.echecs_consecutifs, wf.desactive_raison = 0, None
    db.commit()
    journaliser(db, request, "workflow_active" if actif else "workflow_desactive", email=user.email, utilisateur_id=user.id, details=wf.nom)
    return _resume(db, wf)


@router.delete("/{id}")
def supprimer(id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    wf = db.get(Workflow, id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    db.query(WorkflowExecution).filter(WorkflowExecution.workflow_id == id).delete()
    db.delete(wf)
    db.commit()
    journaliser(db, request, "workflow_supprime", email=user.email, utilisateur_id=user.id, details=wf.nom)
    return {"message": "Workflow supprimé"}


@router.post("/{id}/simuler")
def simuler(id: int, jours: int = 7, db: Session = Depends(get_db)):
    """Que se serait-il passé sur les derniers jours ? Rien n'est modifié, rien n'est envoyé."""
    wf = db.get(Workflow, id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    return moteur.simuler(db, wf, max(1, min(jours, 90)))


def _en_arriere_plan(workflow_id: int, cle: str, ctx: dict, origine: str):
    db = SessionLocal()
    try:
        wf = db.get(Workflow, workflow_id)
        if wf:
            moteur.traiter(db, wf, cle, ctx, origine=origine)
    finally:
        db.close()


@router.post("/{id}/executer")
def executer_maintenant(id: int, db: Session = Depends(get_db)):
    """Exécution manuelle immédiate (test réel), sur le dernier événement correspondant ou, à défaut, sans événement."""
    wf = db.get(Workflow, id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow introuvable")
    sim = moteur.simuler(db, wf, 30, limite=1)
    d = json.loads(wf.declencheur)
    if sim["exemples"]:
        # contexte complet de l'événement le plus récent
        if d["type"] in ("alerte", "recidive", "alerte_non_traitee"):
            from app.models.alert import Alert
            a = db.get(Alert, int(sim["exemples"][-1]["evenement"]["alerte_id"]))
            ctx = E.contexte_alerte(db, a)
            ctx.update({k: v for k, v in sim["exemples"][-1]["evenement"].items() if v is not None})
        else:
            ctx = {k: v for k, v in sim["exemples"][-1]["evenement"].items() if v is not None}
            if d["type"] == "planifie":
                p = d.get("params") or {}
                ids = [int(x) for x in p.get("equipements") or []]
                if ids:
                    eq = db.get(Equipment, ids[0])
                    ctx.update(equipement_id=eq.id, equipement=eq.nom)
    else:
        ctx = {"type_evenement": "manuel", "equipement": "aucun"}
    cle = f"manuel:{datetime.now():%Y%m%d%H%M%S%f}"
    threading.Thread(target=_en_arriere_plan, args=(wf.id, cle, ctx, "manuelle"), daemon=True).start()
    return {"message": "Exécution lancée", "cle": cle, "evenement": ctx}


@router.get("/executions")
def executions(workflow_id: Optional[int] = None, statut: Optional[str] = None, limite: int = 100, db: Session = Depends(get_db)):
    q = db.query(WorkflowExecution)
    if workflow_id:
        q = q.filter(WorkflowExecution.workflow_id == workflow_id)
    if statut:
        q = q.filter(WorkflowExecution.statut == statut)
    return [_serialiser_execution(db, ex) for ex in q.order_by(WorkflowExecution.id.desc()).limit(max(1, min(limite, 500))).all()]


@router.post("/executions/{id}/relancer")
def relancer(id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Rejoue une exécution en échec avec le même événement (après avoir corrigé la cause : clé Telegram, adresse…)."""
    ex = db.get(WorkflowExecution, id)
    if not ex:
        raise HTTPException(status_code=404, detail="Exécution introuvable")
    if ex.statut not in ("echec", "partiel"):
        raise HTTPException(status_code=409, detail="Seule une exécution en échec ou partielle peut être relancée")
    n = db.query(WorkflowExecution).filter(WorkflowExecution.workflow_id == ex.workflow_id, WorkflowExecution.cle.like(f"{ex.cle}:relance%")).count()
    ctx = json.loads(ex.evenement or "{}")
    for cle in ("intervention", "intervention_id", "technicien", "analyse", "workflow"):
        if ctx.get("type_evenement") in ("alerte", "recidive", "alerte_non_traitee", "planifie", "manuel"):
            ctx.pop(cle, None)                               # valeurs produites par la première tentative
    cle = f"{ex.cle}:relance{n + 1}"
    threading.Thread(target=_en_arriere_plan, args=(ex.workflow_id, cle, ctx, "relance"), daemon=True).start()
    journaliser(db, request, "workflow_relance", email=user.email, utilisateur_id=user.id, details=f"exécution {ex.id}")
    return {"message": "Relance lancée", "cle": cle}
