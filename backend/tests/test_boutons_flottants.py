"""Boutons flottants : notifications isolées par utilisateur et fonctions publiques sans données."""
from datetime import datetime

import requests

from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.notification import DemandeContact, Notification
from app.models.user import User
from conftest import MOT_DE_PASSE

API = "/api/v1"


def utilisateur(db, email):
    return db.query(User).filter(User.email == email).first()


def creer_alerte(db, severite="critique", type_="Dépassement seuil temperature"):
    eq = db.query(Equipment).filter(Equipment.nom == "Pompe test P01").first()
    a = Alert(equipement_id=eq.id, type=type_, severite=severite, message="120 °C", created_at=datetime.now())
    db.add(a)
    db.commit()
    return a


def test_alerte_critique_notifie_admins_et_superviseurs(client, admin, superviseur, technicien, db):
    avant = {r: client.get(f"{API}/notifications/compteur", headers=h).json()["non_lues"]
             for r, h in (("admin", admin), ("sup", superviseur), ("tech", technicien))}
    creer_alerte(db, type_="Test notification unique")
    apres = {r: client.get(f"{API}/notifications/compteur", headers=h).json()["non_lues"]
             for r, h in (("admin", admin), ("sup", superviseur), ("tech", technicien))}
    assert apres["admin"] == avant["admin"] + 1 and apres["sup"] == avant["sup"] + 1
    assert apres["tech"] == avant["tech"], "les techniciens ne reçoivent pas les alertes générales"


def test_alerte_faible_sans_notification(client, admin, db):
    avant = client.get(f"{API}/notifications/compteur", headers=admin).json()["non_lues"]
    creer_alerte(db, severite="faible", type_="Alerte faible")
    assert client.get(f"{API}/notifications/compteur", headers=admin).json()["non_lues"] == avant


def test_alertes_repetees_regroupees(client, admin, db):
    for _ in range(3):
        creer_alerte(db, type_="Vibration répétée")
    liste = [n for n in client.get(f"{API}/notifications", headers=admin).json() if "Vibration répétée" in n["titre"]]
    assert len(liste) == 1 and liste[0]["nombre"] == 3 and liste[0]["titre"].startswith("3 alertes")


def test_intervention_assignee_notifie_le_technicien(client, superviseur, technicien, db):
    tech = utilisateur(db, "technicien.test@smartmaint-test.com")
    eq = db.query(Equipment).first()
    avant = client.get(f"{API}/notifications/compteur", headers=technicien).json()["non_lues"]
    r = client.post(f"{API}/interventions/", headers=superviseur,
                    json={"equipement_id": eq.id, "technicien_id": tech.id, "description": "Contrôle du palier", "priorite": "urgente"})
    assert r.status_code == 200
    notes = client.get(f"{API}/notifications?non_lues=true", headers=technicien).json()
    assert len(notes) == avant + 1 or client.get(f"{API}/notifications/compteur", headers=technicien).json()["non_lues"] == avant + 1
    assert any(n["type"] == "intervention" and n["niveau"] == "attention" and n["page"] == "interventions" for n in notes)


def test_isolation_entre_comptes(client, admin, superviseur, db):
    """Un utilisateur ne peut ni lire, ni marquer, ni supprimer la notification d'un autre."""
    creer_alerte(db, type_="Isolation")
    note_admin = next(n for n in client.get(f"{API}/notifications", headers=admin).json() if "Isolation" in n["titre"])
    ids_sup = {n["id"] for n in client.get(f"{API}/notifications?limite=100", headers=superviseur).json()}
    assert note_admin["id"] not in ids_sup
    assert client.post(f"{API}/notifications/{note_admin['id']}/lue", headers=superviseur).status_code == 404
    assert client.delete(f"{API}/notifications/{note_admin['id']}", headers=superviseur).status_code == 404
    db.expire_all()
    assert db.get(Notification, note_admin["id"]).lue is False, "la notification de l'admin n'a pas été modifiée"


def test_tout_lire_ne_touche_que_mes_notifications(client, admin, superviseur, db):
    creer_alerte(db, type_="Tout lire")
    client.post(f"{API}/notifications/tout-lire", headers=admin)
    assert client.get(f"{API}/notifications/compteur", headers=admin).json()["non_lues"] == 0
    assert client.get(f"{API}/notifications/compteur", headers=superviseur).json()["non_lues"] > 0


def test_lire_puis_supprimer(client, admin, db):
    creer_alerte(db, type_="Lecture")
    n = next(x for x in client.get(f"{API}/notifications", headers=admin).json() if "Lecture" in x["titre"])
    assert client.post(f"{API}/notifications/{n['id']}/lue", headers=admin).status_code == 200
    assert client.delete(f"{API}/notifications/{n['id']}", headers=admin).status_code == 200
    assert client.post(f"{API}/notifications/{n['id']}/lue", headers=admin).status_code == 404


def test_nouveau_compte_recoit_ses_propres_notifications(client, admin, db):
    email = "notif.supprime@smartmaint-test.com"
    client.post(f"{API}/auth/register", headers=admin, json={"nom": "Temp", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "superviseur"})
    u = utilisateur(db, email)
    creer_alerte(db, type_="Compte temporaire")
    db.expire_all()
    assert db.query(Notification).filter(Notification.utilisateur_id == u.id).count() >= 1


# ── Pages publiques ──
def test_configuration_publique_sans_donnees(client):
    r = client.get(f"{API}/public/config").json()
    assert set(r) == {"whatsapp", "contact", "assistant", "boutons"} and r["whatsapp"] is None   # aucun numéro configuré en test
    assert all(set(b) == {"cle", "ordre", "couleur", "icone", "taille", "animation", "langues", "appareils", "condition"} for b in r["boutons"]), "aucune donnée de la plateforme"


def test_assistant_public_sans_outils(client, monkeypatch):
    envoye = {}

    def faux_post(url, json=None, **kw):
        envoye.update(json or {})
        class R:
            status_code = 200
            headers = {}
            def json(self):
                return {"choices": [{"message": {"content": "**SmartMaint** supervise vos équipements."}}]}
        return R()
    monkeypatch.setattr(requests, "post", faux_post)
    from app.core.config import settings
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "cle-test")
    r = client.post(f"{API}/public/assistant", json={"question": "Quelles sont les alertes de la pompe ?", "langue": "fr"})
    assert r.status_code == 200 and r.json()["reponse"] == "SmartMaint supervise vos équipements."
    assert "tools" not in envoye, "l'assistant public ne doit avoir accès à aucun outil"
    assert "N'EST PAS connecté" in envoye["messages"][0]["content"]


def test_assistant_public_sans_modele_repond_quand_meme(client):
    r = client.post(f"{API}/public/assistant", json={"question": "J'ai oublié mon mot de passe", "langue": "fr"})
    assert r.status_code == 200 and r.json()["source"] == "faq" and "administrateur" in r.json()["reponse"]
    r = client.post(f"{API}/public/assistant", json={"question": "نسيت كلمة المرور", "langue": "ar"})
    assert "المسؤول" in r.json()["reponse"]


def test_contact_enregistre_et_notifie_les_admins(client, admin, db):
    avant = client.get(f"{API}/notifications/compteur", headers=admin).json()["non_lues"]
    r = client.post(f"{API}/public/contact", json={"nom": "Visiteur", "email": "visiteur@exemple.com", "message": "Demande de démonstration"},
                    headers={"X-Forwarded-For": "10.9.9.1"})
    assert r.status_code == 200
    assert db.query(DemandeContact).filter(DemandeContact.email == "visiteur@exemple.com").count() == 1
    assert client.get(f"{API}/notifications/compteur", headers=admin).json()["non_lues"] == avant + 1


def test_contact_invalide_et_limite(client):
    assert client.post(f"{API}/public/contact", json={"nom": "X", "email": "pas-un-email", "message": "court"}).status_code == 422
    codes = [client.post(f"{API}/public/contact", json={"nom": "Robot", "email": "robot@exemple.com", "message": "Message répété"}).status_code
             for _ in range(5)]
    assert 429 in codes, "le nombre de messages par minute est limité"


def test_intervention_sans_technicien_sans_notification(client, superviseur, db):
    avant = db.query(Notification).count()
    eq = db.query(Equipment).first()
    client.post(f"{API}/interventions/", headers=superviseur, json={"equipement_id": eq.id, "description": "Sans technicien"})
    assert db.query(Notification).count() == avant
    assert db.query(Intervention).filter(Intervention.description == "Sans technicien").count() == 1


def test_titre_traduisible(client, admin, db):
    """Le titre est accompagné de son modèle et de ses valeurs : l'interface l'affiche dans la langue choisie."""
    for _ in range(2):
        creer_alerte(db, type_="Traduction")
    n = next(x for x in client.get(f"{API}/notifications", headers=admin).json() if "Traduction" in x["titre"])
    assert n["donnees"] == {"modele": "alerte", "severite": "critique", "type": "Traduction", "equipement": "Pompe test P01", "n": 2}
