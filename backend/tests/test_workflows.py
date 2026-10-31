"""Workflows automatiques : création, gestion des erreurs, doublons, limite, désactivation, simulation."""
import json
from datetime import datetime

import pytest
import requests

from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.workflow import Workflow, WorkflowExecution
from app.workflows import actions as A
from app.workflows import moteur

API = "/api/v1/workflows"


class Reponse:
    def __init__(self, code):
        self.status_code = code


def faux_service(codes):
    """Service externe simulé : renvoie successivement les codes HTTP donnés."""
    appels = []

    def post(url, json=None, timeout=None, **kw):
        appels.append(url)
        return Reponse(codes[min(len(appels) - 1, len(codes) - 1)])
    return post, appels


def creer_workflow(db, actions, declencheur=None, nom="Workflow de test"):
    wf = Workflow(nom=nom, actif=True, declencheur=json.dumps(declencheur or {"type": "alerte", "params": {}}),
                  actions=json.dumps(actions), max_par_heure=20, echecs_consecutifs=0)
    db.add(wf)
    db.commit()
    return wf


def alerte_critique(db):
    eq = db.query(Equipment).filter(Equipment.nom == "Moteur test M01").first()
    a = Alert(equipement_id=eq.id, type="Dépassement seuil vibration", severite="critique", message="9.5 mm/s", created_at=datetime.now())
    db.add(a)
    db.commit()
    return a


def test_catalogue_et_modeles(client, admin):
    r = client.get(f"{API}/catalogue", headers=admin).json()
    assert len(r["declencheurs"]) == 6 and len(r["actions"]) == 8 and len(r["modeles"]) == 5


def test_creation_depuis_un_modele(client, admin):
    modele = client.get(f"{API}/catalogue", headers=admin).json()["modeles"][0]
    r = client.post(API, headers=admin, json={k: modele[k] for k in ("nom", "description", "declencheur", "actions")} | {"actif": False})
    assert r.status_code == 200, r.text
    assert any(w["nom"] == modele["nom"] for w in client.get(API, headers=admin).json())


def test_declencheur_inconnu_refuse(client, admin):
    r = client.post(API, headers=admin, json={"nom": "Invalide", "declencheur": {"type": "inexistant"},
                                               "actions": [{"type": "journaliser"}]})
    assert r.status_code == 422


def test_nouvelle_tentative_apres_erreur_temporaire(db, monkeypatch):
    post, appels = faux_service([503, 503, 200])
    monkeypatch.setattr(requests, "post", post)
    wf = creer_workflow(db, [{"type": "webhook", "params": {"url": "https://erp.exemple/api"}, "tentatives": 3}])
    attentes = []
    statut, etapes, erreur, _ = moteur.executer_actions(db, wf, {"equipement": "M01"}, attendre=attentes.append)
    assert statut == "succes" and etapes[0]["tentatives"] == 3 and len(appels) == 3
    assert attentes == moteur.ATTENTES[:2], "délais croissants entre les tentatives"


def test_erreur_definitive_sans_nouvelle_tentative(db, monkeypatch):
    post, appels = faux_service([401])
    monkeypatch.setattr(requests, "post", post)
    wf = creer_workflow(db, [{"type": "webhook", "params": {"url": "https://erp.exemple/api"}, "tentatives": 3},
                             {"type": "journaliser", "params": {"message": "suite"}}])
    statut, etapes, erreur, _ = moteur.executer_actions(db, wf, {}, attendre=lambda s: None)
    assert len(appels) == 1 and statut == "partiel" and etapes[1]["statut"] == "ok"


def test_arret_du_workflow_en_cas_erreur(db):
    wf = creer_workflow(db, [{"type": "webhook", "params": {"url": "adresse-invalide"}, "en_cas_erreur": "arreter"},
                             {"type": "journaliser", "params": {}}])
    statut, etapes, _, _ = moteur.executer_actions(db, wf, {}, attendre=lambda s: None)
    assert statut == "echec" and etapes[1]["statut"] == "non_executee"


def test_telegram_non_configure_est_signale(db):
    wf = creer_workflow(db, [{"type": "notifier_telegram", "params": {"message": "test"}}])
    statut, etapes, erreur, _ = moteur.executer_actions(db, wf, {}, attendre=lambda s: None)
    assert statut == "echec" and "Telegram n'est pas configuré" in erreur


def test_aucun_doublon_pour_un_meme_evenement(db):
    wf = creer_workflow(db, [{"type": "journaliser", "params": {"message": "{equipement}"}}])
    assert moteur.traiter(db, wf, "alerte:42", {"equipement": "M01"}, attendre=lambda s: None) is not None
    assert moteur.traiter(db, wf, "alerte:42", {"equipement": "M01"}, attendre=lambda s: None) is None
    assert db.query(WorkflowExecution).filter_by(workflow_id=wf.id).count() == 1


def test_limite_par_heure(db):
    wf = creer_workflow(db, [{"type": "journaliser", "params": {}}])
    wf.max_par_heure = 2
    db.commit()
    for n in range(4):
        moteur.traiter(db, wf, f"evenement:{n}", {}, attendre=lambda s: None)
    statuts = [e.statut for e in db.query(WorkflowExecution).filter_by(workflow_id=wf.id)]
    assert statuts.count("succes") == 2 and statuts.count("limite") == 1


def test_desactivation_apres_cinq_echecs(db):
    wf = creer_workflow(db, [{"type": "webhook", "params": {"url": "invalide"}, "en_cas_erreur": "arreter"}])
    for n in range(5):
        moteur.traiter(db, wf, f"panne:{n}", {}, attendre=lambda s: None)
    db.refresh(wf)
    assert wf.actif is False and "5 échecs" in wf.desactive_raison


def test_alerte_critique_cree_une_seule_intervention(db):
    a = alerte_critique(db)
    wf = creer_workflow(db, [{"type": "creer_intervention", "params": {"priorite": "urgente", "technicien": "auto"}}],
                        nom="Alerte critique test")
    ctx = {"alerte_id": a.id, "equipement_id": a.equipement_id, "equipement": "Moteur test M01", "type_alerte": a.type, "message": a.message}
    statut, etapes, _, ctx1 = moteur.executer_actions(db, wf, ctx, attendre=lambda s: None)
    assert statut == "succes" and ctx1["intervention"].startswith("OI-")
    statut, etapes, _, ctx2 = moteur.executer_actions(db, wf, ctx, attendre=lambda s: None)
    assert etapes[0]["statut"] == "ignoree" and ctx2["intervention"] == ctx1["intervention"]
    assert ctx2["technicien"] == ctx1["technicien"], "le technicien est repris de l'intervention existante"
    assert db.query(Intervention).filter(Intervention.alerte_id == a.id).count() == 1


def test_simulation_sans_effet(client, admin, db):
    alerte_critique(db)
    wf = creer_workflow(db, [{"type": "creer_intervention", "params": {}}], declencheur={"type": "alerte", "params": {"severites": ["critique"]}},
                        nom="Simulation test")
    avant = db.query(Intervention).count()
    r = client.post(f"{API}/{wf.id}/simuler?jours=7", headers=admin)
    assert r.status_code == 200 and r.json()["declenchements"] >= 1
    db.expire_all()
    assert db.query(Intervention).count() == avant


def test_execution_interrompue_reparee(db):
    wf = creer_workflow(db, [{"type": "journaliser", "params": {}}])
    db.add(WorkflowExecution(workflow_id=wf.id, cle="coupure", evenement="{}", statut="en_cours", origine="manuelle", debut=datetime.now()))
    db.commit()
    assert moteur.reparer_interrompues(db) >= 1
    ex = db.query(WorkflowExecution).filter_by(cle="coupure").first()
    assert ex.statut == "echec" and "redémarrage" in ex.erreur


def test_relancer_une_execution_reussie_refuse(client, admin, db):
    ex = db.query(WorkflowExecution).filter_by(statut="succes").first()
    assert client.post(f"{API}/executions/{ex.id}/relancer", headers=admin).status_code == 409


@pytest.mark.parametrize("texte,attendu", [
    ("**Cause :** surchauffe", "Cause : surchauffe"), ("## Titre", "Titre"), ("- point", "• point"), ("`code`", "code")])
def test_message_telegram_sans_mise_en_forme(texte, attendu):
    assert A.sans_markdown(texte) == attendu


def test_variable_inconnue_reste_vide():
    assert A.rendre("{equipement} / {inconnue}", {"equipement": "P01"}) == "P01 /"

