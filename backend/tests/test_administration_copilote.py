"""Administration des comptes, moteur des workflows et copilote (modèle de langage simulé)."""
import json
from datetime import datetime

from app.copilote import llm
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.user import User
from app.models.workflow import Workflow, WorkflowExecution
from app.workflows import moteur
from conftest import MOT_DE_PASSE

API = "/api/v1"


def test_tableau_de_bord_securite(client, admin):
    assert client.get(f"{API}/admin/securite/resume", headers=admin).status_code == 200
    assert len(client.get(f"{API}/admin/utilisateurs", headers=admin).json()) >= 3
    assert client.get(f"{API}/admin/sessions", headers=admin).status_code == 200
    assert client.get(f"{API}/admin/appareils", headers=admin).status_code == 200


def test_compte_desactive_ne_peut_plus_se_connecter(client, admin, db):
    email = "desactive.test@smartmaint-test.com"
    u = client.post(f"{API}/auth/register", headers=admin,
                    json={"nom": "À désactiver", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"}).json()
    jeton = client.post(f"{API}/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE}).json()["access_token"]
    r = client.put(f"{API}/admin/utilisateurs/{u['id']}", headers=admin, json={"actif": False})
    assert r.status_code == 200
    assert client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {jeton}"}).status_code == 401, "sessions fermées"
    assert client.post(f"{API}/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE}).status_code == 403


def test_administrateur_ne_se_retire_pas_ses_droits(client, admin, db):
    moi = db.query(User).filter(User.email == "admin.test@smartmaint-test.com").first()
    r = client.put(f"{API}/admin/utilisateurs/{moi.id}", headers=admin, json={"actif": False})
    assert r.status_code == 400


def test_moteur_detecte_les_nouvelles_alertes(db):
    moteur.tour(db, attendre=lambda s: None)            # initialise le curseur
    wf = Workflow(nom="Journal des alertes critiques", actif=True,
                  declencheur=json.dumps({"type": "alerte", "params": {"severites": ["critique"]}}),
                  actions=json.dumps([{"type": "journaliser", "params": {"message": "Alerte {alerte_id} sur {equipement}"}}]))
    db.add(wf)
    db.commit()
    eq = db.query(Equipment).first()
    db.add_all([Alert(equipement_id=eq.id, type="Test", severite="critique", message="a", created_at=datetime.now()),
                Alert(equipement_id=eq.id, type="Test", severite="faible", message="b", created_at=datetime.now())])
    db.commit()
    assert moteur.tour(db, attendre=lambda s: None) == 1, "seule l'alerte critique déclenche le workflow"
    assert moteur.tour(db, attendre=lambda s: None) == 0, "une alerte déjà traitée ne relance rien"
    assert db.query(WorkflowExecution).filter_by(workflow_id=wf.id, statut="succes").count() == 1


def test_etat_du_moteur(client, admin):
    r = client.get(f"{API}/workflows/moteur", headers=admin)
    assert r.status_code == 200


def lire_flux(reponse):
    return [json.loads(ligne) for ligne in reponse.text.splitlines() if ligne.strip()]


def test_copilote_utilise_un_outil_puis_repond(client, technicien, monkeypatch):
    reponses = iter([
        {"contenu": "", "fournisseur": "test", "modele": "simule",
         "appels_outils": [{"id": "1", "function": {"name": "lister_equipements", "arguments": "{}"}}]},
        {"contenu": "Il y a plusieurs équipements suivis.", "fournisseur": "test", "modele": "simule", "appels_outils": []},
    ])
    monkeypatch.setattr(llm, "discuter", lambda *a, **k: next(reponses))
    evenements = lire_flux(client.post(f"{API}/copilote/question", headers=technicien, json={"question": "Quels équipements ?"}))
    types = [e["type"] for e in evenements]
    assert "etape" in types and types[-1] == "reponse"
    assert evenements[-1]["etapes"][0]["outil"] == "lister_equipements" and evenements[-1]["etapes"][0]["statut"] == "ok"


def test_copilote_indisponible_message_clair(client, technicien, monkeypatch):
    def panne(*a, **k):
        raise llm.ErreurLLM("Aucun modèle disponible")
    monkeypatch.setattr(llm, "discuter", panne)
    evenements = lire_flux(client.post(f"{API}/copilote/question", headers=technicien, json={"question": "Bonjour"}))
    assert evenements[-1]["type"] == "erreur"


def test_question_vide_refusee(client, technicien):
    assert client.post(f"{API}/copilote/question", headers=technicien, json={"question": "  "}).status_code == 400


def test_entrainement_et_analyse_ia(client, superviseur, db):
    """Isolation Forest entraîné sur des mesures de test, dans un dossier temporaire."""
    import random
    from app.models.sensor import Sensor
    from app.models.sensor_data import SensorData
    capteur = db.query(Sensor).filter(Sensor.type == "vibration").first()
    hasard = random.Random(1)  # noqa: S311  (données de test)
    db.add_all([SensorData(capteur_id=capteur.id, valeur=3 + hasard.random()) for _ in range(120)])
    db.commit()
    r = client.post(f"{API}/ia/entrainer", headers=superviseur)
    assert r.status_code == 200
    r = client.get(f"{API}/ia/analyse?nb_points=20", headers=superviseur)
    assert r.status_code == 200


def test_sante_du_systeme(client, admin, technicien):
    assert client.get(f"{API}/sante", headers=technicien).status_code == 403
    r = client.get(f"{API}/sante", headers=admin).json()
    noms = {c["composant"]: c["etat"] for c in r["composants"]}
    assert noms["Base de données"] == "ok"
    assert noms["Notifications Telegram"] == "attention"          # non configuré pendant les tests
    assert r["etat"] in ("ok", "attention", "panne") and len(noms) == 7


def test_erreur_inattendue_sans_detail_technique():
    from fastapi.testclient import TestClient
    from app.main import app as application

    @application.get("/api/v1/test-erreur-interne")
    def plantage():
        raise RuntimeError("secret interne")
    r = TestClient(application, raise_server_exceptions=False).get("/api/v1/test-erreur-interne")
    assert r.status_code == 500 and "secret interne" not in r.text
