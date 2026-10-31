"""Messagerie interne et WhatsApp : conversations isolées entre participants, numéros partagés avec accord."""
from app.models.messagerie import Message
from app.models.user import User
from conftest import MOT_DE_PASSE

API = "/api/v1/messagerie"


def ident(db, email):
    return db.query(User).filter(User.email == email).first().id


def test_contacts_sans_moi_ni_comptes_desactives(client, technicien, admin, db):
    email = "inactif.msg@smartmaint-test.com"
    u = client.post("/api/v1/auth/register", headers=admin, json={"nom": "Ancien Compte", "email": email, "mot_de_passe": MOT_DE_PASSE}).json()
    client.put(f"/api/v1/admin/utilisateurs/{u['id']}", headers=admin, json={"actif": False})
    noms = [c["nom"] for c in client.get(f"{API}/contacts", headers=technicien).json()]
    assert "Technicien Test" not in noms and "Ancien Compte" not in noms and "Admin Test" in noms


def test_numero_partage_seulement_avec_accord(client, technicien, superviseur, db):
    assert client.put(f"{API}/mes-coordonnees", headers=superviseur, json={"telephone": "+213 6 12 34 56 78", "visible": False}).status_code == 200
    sup = next(c for c in client.get(f"{API}/contacts?q=Superviseur", headers=technicien).json() if c["nom"] == "Superviseur Test")
    assert sup["whatsapp"] is None, "numéro non partagé : jamais transmis"
    client.put(f"{API}/mes-coordonnees", headers=superviseur, json={"telephone": "+213 6 12 34 56 78", "visible": True})
    sup = next(c for c in client.get(f"{API}/contacts?q=Superviseur", headers=technicien).json() if c["nom"] == "Superviseur Test")
    assert sup["whatsapp"] == "213612345678"
    assert client.get("/api/v1/auth/me", headers=superviseur).json()["telephone_visible"] is True


def test_numero_invalide_refuse(client, technicien):
    assert client.put(f"{API}/mes-coordonnees", headers=technicien, json={"telephone": "123", "visible": True}).status_code == 422


def test_conversation_complete_et_non_lus(client, technicien, superviseur, db):
    sup_id = ident(db, "superviseur.test@smartmaint-test.com")
    conv = client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": sup_id}).json()
    # même conversation si on la rouvre, dans un sens ou dans l'autre
    tech_id = ident(db, "technicien.test@smartmaint-test.com")
    assert client.post(f"{API}/conversations", headers=superviseur, json={"destinataire_id": tech_id}).json()["id"] == conv["id"]
    avant = client.get(f"{API}/non-lus", headers=superviseur).json()["non_lus"]
    client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "Le roulement de P01 est arrivé"})
    client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "Je l'installe demain"})
    assert client.get(f"{API}/non-lus", headers=superviseur).json()["non_lus"] == avant + 2
    assert client.get("/api/v1/notifications/compteur", headers=superviseur).json()["messages_non_lus"] == avant + 2
    msgs = client.get(f"{API}/conversations/{conv['id']}/messages", headers=superviseur).json()
    assert [m["texte"] for m in msgs][-2:] == ["Le roulement de P01 est arrivé", "Je l'installe demain"] and not msgs[-1]["moi"]
    assert client.get(f"{API}/non-lus", headers=superviseur).json()["non_lus"] == avant, "lecture : compteur remis à zéro"
    liste = client.get(f"{API}/conversations", headers=superviseur).json()
    assert liste[0]["id"] == conv["id"] and liste[0]["dernier"]["texte"] == "Je l'installe demain"


def test_isolation_des_conversations(client, technicien, superviseur, admin, db):
    """Un utilisateur qui ne participe pas à une conversation ne peut ni la lire, ni y écrire, ni la voir."""
    sup_id = ident(db, "superviseur.test@smartmaint-test.com")
    conv = client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": sup_id}).json()
    client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "Message confidentiel"})
    assert client.get(f"{API}/conversations/{conv['id']}/messages", headers=admin).status_code == 404
    assert client.post(f"{API}/conversations/{conv['id']}/messages", headers=admin, json={"texte": "intrusion"}).status_code == 404
    assert conv["id"] not in [c["id"] for c in client.get(f"{API}/conversations", headers=admin).json()]
    assert db.query(Message).filter(Message.texte == "intrusion").count() == 0


def test_pas_de_conversation_avec_soi_meme_ou_un_inconnu(client, technicien, db):
    moi = ident(db, "technicien.test@smartmaint-test.com")
    assert client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": moi}).status_code == 404
    assert client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": 999999}).status_code == 404


def test_message_vide_ou_trop_long(client, technicien, db):
    sup_id = ident(db, "superviseur.test@smartmaint-test.com")
    conv = client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": sup_id}).json()
    assert client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "   "}).status_code == 422
    assert client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "x" * 2001}).status_code == 422


def test_texte_conserve_tel_quel(client, technicien, superviseur, db):
    """Le texte est stocké brut ; l'interface React l'affiche comme du texte (aucun HTML interprété)."""
    sup_id = ident(db, "superviseur.test@smartmaint-test.com")
    conv = client.post(f"{API}/conversations", headers=technicien, json={"destinataire_id": sup_id}).json()
    client.post(f"{API}/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "<script>alert(1)</script>"})
    msgs = client.get(f"{API}/conversations/{conv['id']}/messages", headers=superviseur).json()
    assert msgs[-1]["texte"] == "<script>alert(1)</script>"
