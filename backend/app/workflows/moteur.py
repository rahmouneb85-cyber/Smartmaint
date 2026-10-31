"""Moteur des workflows : surveille les événements toutes les 30 secondes et exécute les actions.

Gestion des erreurs :
  • chaque action est retentée (jusqu'à 3 fois, avec une attente croissante) si l'erreur est temporaire ;
  • « en cas d'erreur » : continuer avec les actions suivantes ou arrêter le workflow ;
  • un même événement n'est jamais traité deux fois (clé unique en base) ;
  • un workflow ne peut pas s'exécuter plus de N fois par heure (protection contre une avalanche d'alertes) ;
  • après 5 échecs consécutifs, le workflow est désactivé et l'équipe est prévenue ;
  • une erreur dans un workflow n'empêche jamais les autres de s'exécuter.
Les exécutions en échec peuvent être relancées depuis l'interface."""
import json
import threading
import time
import traceback
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.journaux import journal
from app.core.database import SessionLocal
from app.models.alert import Alert
from app.models.intervention import Intervention
from app.models.workflow import Workflow, WorkflowEtat, WorkflowExecution
from app.workflows import actions as A
from app.workflows import evenements as E

INTERVALLE = 30            # secondes entre deux tours du moteur
ATTENTES = [2, 6, 15]      # attente avant chaque nouvelle tentative (secondes)
ECHECS_AVANT_DESACTIVATION = 5
ETAT = {"actif": False, "dernier_tour": None, "duree_dernier_tour_ms": None, "derniere_erreur": None, "tours": 0}
_verrou = threading.Lock()


def _json(x):
    return json.dumps(x, ensure_ascii=False, default=str)


# ─────────────────────────────────────────────────────────────
# EXÉCUTION D'UN WORKFLOW SUR UN ÉVÉNEMENT
# ─────────────────────────────────────────────────────────────
def executer_actions(db: Session, wf: Workflow, ctx: dict, simulation: bool = False, attendre=time.sleep) -> tuple:
    """Exécute les actions dans l'ordre. Renvoie (statut, étapes, erreur)."""
    ctx = dict(ctx, workflow=wf.nom)
    etapes, statut, premiere_erreur = [], "succes", None
    arret = False
    for act in json.loads(wf.actions or "[]"):
        fonction = A.ACTIONS.get(act.get("type"))
        etape = {"action": act.get("type"), "statut": "", "message": "", "tentatives": 0, "duree_ms": 0}
        if arret:
            etape.update(statut="non_executee", message="Non exécutée : une action précédente a échoué")
            etapes.append(etape)
            continue
        if not fonction:
            etape.update(statut="erreur", message=f"Action inconnue : {act.get('type')}")
            etapes.append(etape)
            statut, premiere_erreur = "partiel", premiere_erreur or etape["message"]
            continue
        maxi = max(1, min(int(act.get("tentatives") or 3), 5))
        t0 = time.time()
        for essai in range(1, maxi + 1):
            etape["tentatives"] = essai
            try:
                etape["message"] = fonction(db, ctx, act.get("params") or {}, wf, simulation)
                etape["statut"] = "simulee" if simulation else "ok"
                break
            except A.Ignoree as e:
                etape.update(statut="ignoree", message=str(e))
                break
            except A.ErreurTemporaire as e:
                db.rollback()
                etape.update(statut="erreur", message=f"{e} (tentative {essai}/{maxi})")
                if essai < maxi and not simulation:
                    attendre(ATTENTES[min(essai - 1, len(ATTENTES) - 1)])
            except A.ErreurDefinitive as e:
                db.rollback()
                etape.update(statut="erreur", message=str(e))
                break
            except Exception as e:                      # erreur imprévue : on la trace sans faire tomber le moteur
                db.rollback()
                etape.update(statut="erreur", message=f"Erreur inattendue : {e.__class__.__name__} : {str(e)[:200]}")
                break
        etape["duree_ms"] = int((time.time() - t0) * 1000)
        etapes.append(etape)
        if etape["statut"] == "erreur":
            premiere_erreur = premiere_erreur or etape["message"]
            if act.get("en_cas_erreur") == "arreter":
                arret, statut = True, "echec"
            elif statut == "succes":
                statut = "partiel"
    if statut == "partiel" and all(e["statut"] in ("erreur", "non_executee") for e in etapes):
        statut = "echec"
    return statut, etapes, premiere_erreur, ctx


def traiter(db: Session, wf: Workflow, cle: str, ctx: dict, origine: str = "automatique", attendre=time.sleep):
    """Enregistre l'exécution (la clé unique bloque les doublons), exécute, met à jour le suivi du workflow."""
    maintenant = datetime.now()
    recentes = db.query(WorkflowExecution).filter(WorkflowExecution.workflow_id == wf.id, WorkflowExecution.debut >= maintenant - timedelta(hours=1),
                                                  WorkflowExecution.statut != "limite").count()
    if origine == "automatique" and recentes >= (wf.max_par_heure or 20):
        cle_limite = f"limite:{maintenant:%Y%m%d%H}"
        if not db.query(WorkflowExecution).filter_by(workflow_id=wf.id, cle=cle_limite).first():
            db.add(WorkflowExecution(workflow_id=wf.id, cle=cle_limite, evenement=_json(ctx), statut="limite", debut=maintenant, fin=maintenant,
                                     erreur=f"Plus de {wf.max_par_heure} exécutions en une heure : événements suivants ignorés jusqu'à l'heure prochaine"))
            db.commit()
        return None
    ex = WorkflowExecution(workflow_id=wf.id, cle=cle[:190], evenement=_json(ctx), statut="en_cours", origine=origine, debut=maintenant)
    db.add(ex)
    try:
        db.commit()
    except IntegrityError:            # déjà traité (autre tour du moteur, redémarrage…)
        db.rollback()
        return None
    statut, etapes, erreur, ctx_final = executer_actions(db, wf, ctx, attendre=attendre)
    ex.statut, ex.etapes, ex.erreur, ex.fin = statut, _json(etapes), (erreur or None) and erreur[:500], datetime.now()
    ex.evenement = _json(ctx_final)
    wf.derniere_execution = maintenant
    if statut == "echec":
        wf.echecs_consecutifs = (wf.echecs_consecutifs or 0) + 1
        if wf.echecs_consecutifs >= ECHECS_AVANT_DESACTIVATION and wf.actif:
            wf.actif = False
            wf.desactive_raison = f"Désactivé automatiquement après {wf.echecs_consecutifs} échecs consécutifs : {erreur or ''}"[:300]
            _prevenir_desactivation(db, wf)
    else:
        wf.echecs_consecutifs = 0
    db.commit()
    return ex


def _prevenir_desactivation(db, wf):
    try:
        from app.core.sessions import journaliser, alerte_telegram
        journaliser(db, None, "workflow_desactive", details=wf.desactive_raison)
        from app.notifications.service import notifier_session
        notifier_session(db, roles=["admin"], type_="workflow", niveau="attention", page="workflows", objet_id=wf.id,
                         titre=f"Workflow désactivé : {wf.nom}", message=wf.desactive_raison, donnees={"modele": "workflow", "nom": wf.nom})
        alerte_telegram(f"⚠️ SmartMaint : le workflow « {wf.nom} » a été désactivé.\n{wf.desactive_raison}")
    except Exception:                       # l'information ne doit jamais empêcher la désactivation
        journal.warning("Désactivation du workflow « %s » non notifiée", wf.nom, exc_info=True)


# ─────────────────────────────────────────────────────────────
# TOUR DU MOTEUR
# ─────────────────────────────────────────────────────────────
def _etat(db, cle, defaut=None):
    e = db.get(WorkflowEtat, cle)
    return e.valeur if e else defaut


def _ecrire_etat(db, cle, valeur):
    e = db.get(WorkflowEtat, cle)
    if e:
        e.valeur = str(valeur)
    else:
        db.add(WorkflowEtat(cle=cle, valeur=str(valeur)))


def nouveaux_evenements(db: Session) -> dict:
    """Alertes, interventions terminées et documents validés apparus depuis le dernier tour."""
    maintenant = datetime.now()
    dernier_alerte = _etat(db, "alerte_id")
    if dernier_alerte is None:            # premier démarrage : on ne rejoue pas tout l'historique
        dernier_alerte = (db.query(Alert.id).order_by(Alert.id.desc()).first() or [0])[0]
        _ecrire_etat(db, "alerte_id", dernier_alerte)
    alertes = db.query(Alert).filter(Alert.id > int(dernier_alerte)).order_by(Alert.id).limit(500).all()
    depuis = datetime.fromisoformat(_etat(db, "depuis", maintenant.isoformat()))
    interventions = db.query(Intervention).filter(Intervention.statut == "terminee", Intervention.date_fin > depuis,
                                                  Intervention.date_fin <= maintenant).all()
    documents = []
    try:
        from app.models.document_idp import DocumentIDP
        documents = db.query(DocumentIDP).filter(DocumentIDP.statut == "valide", DocumentIDP.traite_le > depuis,
                                                 DocumentIDP.traite_le <= maintenant).all()
    except Exception:                       # module IDP absent ou table pas encore créée
        db.rollback()
        journal.warning("Documents validés non lus par le moteur des workflows", exc_info=True)
    return {"alertes": alertes, "interventions": interventions, "documents": documents, "maintenant": maintenant}


def tour(db: Session, attendre=time.sleep) -> int:
    """Un passage complet : détecte les événements et exécute les workflows actifs. Renvoie le nombre d'exécutions."""
    nouv = nouveaux_evenements(db)
    n = 0
    for wf in db.query(Workflow).filter(Workflow.actif.is_(True)).order_by(Workflow.id).all():
        try:
            d = json.loads(wf.declencheur or "{}")
            p = d.get("params") or {}
            if d.get("type") == "planifie":
                if wf.prochaine_execution is None:
                    wf.prochaine_execution = E.prochaine_echeance(p, nouv["maintenant"])
                    db.commit()
                evs = E.ev_planifie(db, wf, p, nouv["maintenant"])
                if evs:
                    wf.prochaine_execution = E.prochaine_echeance(p, nouv["maintenant"])
                    db.commit()
            else:
                detecteur = E.DETECTEURS.get(d.get("type"))
                evs = detecteur(db, wf.id, p, nouv) if detecteur else []
            for cle, ctx in evs:
                if not wf.actif:                         # désactivé en cours de tour après trop d'échecs
                    break
                if traiter(db, wf, cle, ctx, attendre=attendre):
                    n += 1
        except Exception as e:                           # un workflow défaillant ne bloque pas les autres
            db.rollback()
            ETAT["derniere_erreur"] = f"{wf.nom} : {e.__class__.__name__} : {str(e)[:200]}"
            traceback.print_exc()
    if nouv["alertes"]:
        _ecrire_etat(db, "alerte_id", nouv["alertes"][-1].id)
    _ecrire_etat(db, "depuis", nouv["maintenant"].isoformat())
    db.commit()
    return n


def _boucle():
    while True:
        debut = time.time()
        if _verrou.acquire(blocking=False):
            db = SessionLocal()
            try:
                tour(db)
                ETAT["tours"] += 1
            except Exception as e:
                ETAT["derniere_erreur"] = f"{e.__class__.__name__} : {str(e)[:200]}"
                traceback.print_exc()
            finally:
                db.close()
                _verrou.release()
                ETAT["dernier_tour"] = datetime.now()
                ETAT["duree_dernier_tour_ms"] = int((time.time() - debut) * 1000)
        time.sleep(INTERVALLE)


def reparer_interrompues(db: Session) -> int:
    """Au démarrage : une exécution restée « en cours » a été coupée par un arrêt du serveur → échec, relançable."""
    n = 0
    for ex in db.query(WorkflowExecution).filter(WorkflowExecution.statut == "en_cours").all():
        ex.statut, ex.fin = "echec", datetime.now()
        ex.erreur = "Exécution interrompue par un redémarrage du serveur : vous pouvez la relancer"
        n += 1
    db.commit()
    return n


def demarrer():
    """Démarre le moteur en tâche de fond (une seule fois par processus)."""
    if ETAT["actif"]:
        return
    ETAT["actif"] = True
    db = SessionLocal()
    try:
        n = reparer_interrompues(db)
        if n:
            print(f"⚙️  {n} exécution(s) de workflow interrompue(s) marquée(s) en échec")
    except Exception:
        db.rollback()
    finally:
        db.close()
    threading.Thread(target=_boucle, name="moteur-workflows", daemon=True).start()
    print("⚙️  Moteur des workflows démarré (vérification toutes les 30 secondes)")


# ─────────────────────────────────────────────────────────────
# SIMULATION : « que se serait-il passé ces derniers jours ? »
# ─────────────────────────────────────────────────────────────
def simuler(db: Session, wf: Workflow, jours: int = 7, limite: int = 30) -> dict:
    d = json.loads(wf.declencheur or "{}")
    p, type_ = d.get("params") or {}, d.get("type")
    depuis = datetime.now() - timedelta(days=jours)
    evs = []
    if type_ in ("alerte", "recidive"):
        alertes = db.query(Alert).filter(Alert.created_at >= depuis).order_by(Alert.id).all()
        nouv = {"alertes": alertes, "interventions": [], "documents": []}
        evs = E.DETECTEURS[type_](db, wf.id, p, nouv)
    elif type_ == "alerte_non_traitee":
        evs = E.ev_alerte_non_traitee(db, wf.id, dict(p), {})
    elif type_ == "intervention_terminee":
        its = db.query(Intervention).filter(Intervention.statut == "terminee", Intervention.date_fin >= depuis).all()
        evs = E.ev_intervention_terminee(db, wf.id, p, {"interventions": its})
    elif type_ == "planifie":
        t, echeances = depuis, []
        while len(echeances) < 60:
            t = E.prochaine_echeance(p, t)
            if t > datetime.now() + timedelta(days=jours):
                break
            echeances.append(t)
        for t in echeances:
            class _W:
                prochaine_execution = t
            evs += E.ev_planifie(db, _W, p, t)
    elif type_ == "document_valide":
        try:
            from app.models.document_idp import DocumentIDP
            docs = db.query(DocumentIDP).filter(DocumentIDP.statut == "valide", DocumentIDP.traite_le >= depuis).all()
            evs = E.ev_document_valide(db, wf.id, p, {"documents": docs})
        except Exception:
            evs = []
    exemples = []
    for cle, ctx in evs[:limite]:
        statut, etapes, erreur, _ = executer_actions(db, wf, ctx, simulation=True)
        exemples.append({"cle": cle, "evenement": {k: ctx.get(k) for k in ("type_evenement", "equipement", "alerte_id", "severite", "date", "nb_alertes", "intervention")},
                         "etapes": etapes})
    db.rollback()
    return {"periode_jours": jours, "declenchements": len(evs), "exemples": exemples,
            "par_heure_max": wf.max_par_heure}
