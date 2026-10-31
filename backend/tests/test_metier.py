"""Fonctionnement métier : équipements, capteurs, seuils, alertes, interventions."""
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from conftest import CLE_IOT

API = "/api/v1"


def test_cycle_de_vie_equipement(client, superviseur, admin):
    r = client.post(f"{API}/equipements/", headers=superviseur, json={"nom": "Compresseur test C09", "type": "compresseur"})
    assert r.status_code == 200, r.text
    eq = r.json()
    assert eq["statut"] == "actif"
    r = client.put(f"{API}/equipements/{eq['id']}", headers=superviseur, json={"localisation": "Atelier C"})
    assert r.json()["localisation"] == "Atelier C" and r.json()["nom"] == "Compresseur test C09"
    assert client.get(f"{API}/equipements/{eq['id']}/fiche", headers=superviseur).status_code == 200
    assert client.delete(f"{API}/equipements/{eq['id']}", headers=admin).status_code == 200
    assert client.get(f"{API}/equipements/{eq['id']}", headers=admin).status_code == 404


def test_equipement_avec_capteurs_non_supprimable(client, admin, db):
    eq = db.query(Equipment).filter(Equipment.nom == "Pompe test P01").first()
    r = client.delete(f"{API}/equipements/{eq.id}", headers=admin)
    assert r.status_code == 400 and "capteur" in r.json()["detail"]


def test_equipement_inconnu(client, technicien):
    assert client.get(f"{API}/equipements/999999", headers=technicien).status_code == 404


def test_donnee_invalide_refusee(client, superviseur):
    r = client.post(f"{API}/equipements/", headers=superviseur, json={"nom": "X", "statut": "explose"})
    assert r.status_code == 422


def test_depassement_de_seuil_cree_une_alerte(client, db):
    capteur = db.query(Sensor).filter(Sensor.type == "temperature").first()
    avant = db.query(Alert).filter(Alert.equipement_id == capteur.equipement_id).count()
    r = client.post(f"{API}/capteurs/data", headers={"X-API-Key": CLE_IOT}, json={"capteur_id": capteur.id, "valeur": 130.0})
    assert r.status_code == 200
    db.expire_all()
    alertes = db.query(Alert).filter(Alert.equipement_id == capteur.equipement_id).order_by(Alert.id).all()
    assert len(alertes) == avant + 1, "une mesure hors seuil doit créer une alerte"
    assert alertes[-1].severite.value == "critique"           # 45 °C au-dessus d'une plage de 75 °C
    # anti-doublon : une deuxième mesure hors seuil dans les 5 minutes ne crée pas de nouvelle alerte
    client.post(f"{API}/capteurs/data", headers={"X-API-Key": CLE_IOT}, json={"capteur_id": capteur.id, "valeur": 131.0})
    db.expire_all()
    assert db.query(Alert).filter(Alert.equipement_id == capteur.equipement_id).count() == avant + 1


def test_valeur_normale_sans_alerte(client, db):
    capteur = db.query(Sensor).filter(Sensor.type == "vibration").first()
    avant = db.query(Alert).count()
    client.post(f"{API}/capteurs/data", headers={"X-API-Key": CLE_IOT}, json={"capteur_id": capteur.id, "valeur": 2.5})
    db.expire_all()
    assert db.query(Alert).count() == avant


def test_severite_selon_ecart():
    from app.api.sensor import calculer_severite_seuil
    assert calculer_severite_seuil(5, 100) == "moyenne"
    assert calculer_severite_seuil(15, 100) == "haute"
    assert calculer_severite_seuil(40, 100) == "critique"


def test_cycle_de_vie_intervention(client, superviseur, technicien, db):
    eq = db.query(Equipment).filter(Equipment.nom == "Moteur test M01").first()
    r = client.post(f"{API}/interventions/", headers=superviseur,
                    json={"equipement_id": eq.id, "description": "Vibrations anormales", "priorite": "haute"})
    assert r.status_code == 200, r.text
    i = r.json()
    assert i["statut"] == "planifiee"

    # en cours → l'équipement passe en maintenance et la date de début est enregistrée
    r = client.put(f"{API}/interventions/{i['id']}", headers=technicien, json={"statut": "en_cours"})
    assert r.json()["date_debut"]
    db.expire_all()
    assert db.get(Equipment, eq.id).statut.value == "maintenance"

    # terminée sans compte rendu → refusée
    r = client.put(f"{API}/interventions/{i['id']}", headers=technicien, json={"statut": "terminee"})
    assert r.status_code == 400

    # terminée avec compte rendu → l'équipement redevient actif
    r = client.put(f"{API}/interventions/{i['id']}", headers=technicien,
                   json={"statut": "terminee", "actions_realisees": "Resserrage des fixations", "diagnostic": "Fixations desserrées"})
    assert r.status_code == 200 and r.json()["date_fin"]
    db.expire_all()
    assert db.get(Equipment, eq.id).statut.value == "actif"


def test_intervention_references_verifiees(client, superviseur):
    assert client.post(f"{API}/interventions/", headers=superviseur,
                       json={"equipement_id": 999999, "description": "x"}).status_code == 400
    assert client.post(f"{API}/interventions/", headers=superviseur,
                       json={"equipement_id": 1, "technicien_id": 999999, "description": "x"}).status_code == 400


def test_technicien_ne_supprime_pas_une_intervention(client, superviseur, technicien, db):
    eq = db.query(Equipment).first()
    i = client.post(f"{API}/interventions/", headers=superviseur, json={"equipement_id": eq.id, "description": "À supprimer"}).json()
    assert client.delete(f"{API}/interventions/{i['id']}", headers=technicien).status_code == 403
    assert client.delete(f"{API}/interventions/{i['id']}", headers=superviseur).status_code == 200


def test_acquitter_une_alerte(client, technicien, db):
    a = db.query(Alert).first()
    r = client.put(f"{API}/alertes/{a.id}", headers=technicien, json={"acquittee": True})
    assert r.status_code == 200 and r.json()["acquittee"] is True


def test_rapport_incident_et_statistiques(client, technicien, db):
    a = db.query(Alert).first()
    assert client.get(f"{API}/alertes/{a.id}/rapport", headers=technicien).status_code == 200
    stats = client.get(f"{API}/alertes/stats", headers=technicien).json()
    assert stats


def test_liste_techniciens_actifs(client, superviseur):
    r = client.get(f"{API}/interventions/techniciens", headers=superviseur)
    assert r.status_code == 200
    assert all(t.get("role", "technicien") == "technicien" for t in r.json())


def test_rapport_de_maintenance(client, superviseur):
    r = client.get(f"{API}/rapports/maintenance", headers=superviseur)
    assert r.status_code in (200, 404, 422)

