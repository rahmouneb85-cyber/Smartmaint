"""Room Live : salles privées, rôles, modération et temps réel (WebSocket) isolés par salle."""
import pytest
from starlette.websockets import WebSocketDisconnect

from app.models.room import MessageSalle
from app.models.user import User
from conftest import MOT_DE_PASSE, connecter

API = "/api/v1/rooms"


@pytest.fixture(scope="module")
def client():
    """Un seul client ouvert pour tout le module : REST et WebSocket partagent la même boucle d'événements,
    comme avec le vrai serveur (sinon une déconnexion décidée par une route REST viserait une autre boucle)."""
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


def ident(db, email):
    return db.query(User).filter(User.email == email).first().id


@pytest.fixture
def tech2(client, admin):
    email = "technicien2.room@smartmaint-test.com"
    client.post("/api/v1/auth/register", headers=admin, json={"nom": "Technicien Room", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"})
    r = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def jeton(entete):
    return entete["Authorization"].split(" ", 1)[1]


def salle(client, hote, db, invites=("technicien.test@smartmaint-test.com",), nom="Réunion maintenance P01"):
    r = client.post(API, headers=hote, json={"nom": nom, "invites": [ident(db, e) for e in invites]})
    assert r.status_code == 200, r.text
    return r.json()


def entrer(client, salle_id, entete):
    ws = client.websocket_connect(f"{API}/ws/{salle_id}")
    s = ws.__enter__()
    s.send_json({"type": "auth", "token": jeton(entete)})
    return ws, s


# ── Salles et isolation ──
def test_creation_invitation_et_notification(client, superviseur, technicien, db):
    s = salle(client, superviseur, db)
    assert s["mon_role"] == "hote" and {m["statut"] for m in s["membres"]} == {"membre", "invite"}
    liste = client.get(API, headers=technicien).json()
    assert any(x["id"] == s["id"] and x["mon_statut"] == "invite" for x in liste)
    assert client.get("/api/v1/notifications/compteur", headers=technicien).json()["rooms_invitations"] >= 1
    notifs = client.get("/api/v1/notifications", headers=technicien).json()
    assert any(n["type"] == "room" and n["objet_id"] == s["id"] for n in notifs)


def test_salle_invisible_pour_les_non_membres(client, superviseur, admin, tech2, db):
    s = salle(client, superviseur, db)
    for entete in (admin, tech2):
        assert client.get(f"{API}/{s['id']}", headers=entete).status_code == 404
        assert client.get(f"{API}/{s['id']}/messages", headers=entete).status_code == 404
        assert client.post(f"{API}/{s['id']}/invitations", headers=entete, json={"utilisateurs": [1]}).status_code == 404
        assert all(x["id"] != s["id"] for x in client.get(API, headers=entete).json())


def test_websocket_refuse_les_non_membres_et_les_jetons_invalides(client, superviseur, tech2, db):
    s = salle(client, superviseur, db)
    for token in (jeton(tech2), "jeton-invalide"):
        with client.websocket_connect(f"{API}/ws/{s['id']}") as ws:
            ws.send_json({"type": "auth", "token": token})
            assert ws.receive_json()["type"] == "erreur"
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
    with client.websocket_connect(f"{API}/ws/{s['id']}") as ws:      # premier message autre que l'authentification
        ws.send_json({"type": "chat", "texte": "bonjour"})
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()


def test_invitation_limitee_aux_contacts_autorises(client, superviseur, technicien, admin, db):
    s = salle(client, superviseur, db)
    assert client.post(f"{API}/{s['id']}/invitations", headers=technicien, json={"utilisateurs": [ident(db, "admin.test@smartmaint-test.com")]}).status_code == 403, \
        "un participant ne peut pas inviter"
    c = client.get("/api/v1/boutons/configuration", headers=admin).json()
    c["contacts"]["superviseur"] = ["admin"]
    client.put("/api/v1/boutons/configuration", headers=admin, json=c)
    try:
        r = client.post(API, headers=superviseur, json={"nom": "Réunion interdite", "invites": [ident(db, "technicien.test@smartmaint-test.com")]})
        assert r.status_code == 422
    finally:
        client.post("/api/v1/boutons/configuration/reinitialiser", headers=admin)


# ── Temps réel ──
def test_presence_chat_signalisation(client, superviseur, technicien, db):
    s = salle(client, superviseur, db)
    sup_id, tech_id = ident(db, "superviseur.test@smartmaint-test.com"), ident(db, "technicien.test@smartmaint-test.com")
    with client.websocket_connect(f"{API}/ws/{s['id']}") as a:
        a.send_json({"type": "auth", "token": jeton(superviseur)})
        b0 = a.receive_json()
        assert b0["type"] == "bienvenue" and b0["participants"] == [] and b0["moi"]["role"] == "hote"
        with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
            b.send_json({"type": "auth", "token": jeton(technicien)})
            bienvenue = b.receive_json()
            assert [p["id"] for p in bienvenue["participants"]] == [sup_id]
            assert a.receive_json() == {"type": "arrivee", "participant": {"id": tech_id, "nom": "Technicien Test", "role": "participant", "micro": True, "camera": True, "ecran": False}}
            # signalisation WebRTC relayée uniquement à la cible
            b.send_json({"type": "signal", "cible": sup_id, "donnees": {"sdp": {"type": "offer", "sdp": "v=0"}}})
            assert a.receive_json() == {"type": "signal", "de": tech_id, "donnees": {"sdp": {"type": "offer", "sdp": "v=0"}}}
            # chat enregistré et diffusé à tous
            b.send_json({"type": "chat", "texte": "Le roulement est changé"})
            for ws in (a, b):
                m = ws.receive_json()
                assert m["type"] == "chat" and m["message"]["texte"] == "Le roulement est changé"
            b.send_json({"type": "media", "micro": False, "camera": True})
            assert a.receive_json()["micro"] is False
        assert a.receive_json() == {"type": "depart", "id": tech_id}
    # l'invitation est acceptée à la première entrée, l'historique est conservé
    assert next(x for x in client.get(API, headers=technicien).json() if x["id"] == s["id"])["mon_statut"] == "membre"
    assert client.get(f"{API}/{s['id']}/messages", headers=technicien).json()[-1]["texte"] == "Le roulement est changé"


def test_message_html_et_limites(client, superviseur, db):
    s = salle(client, superviseur, db, invites=())
    with client.websocket_connect(f"{API}/ws/{s['id']}") as a:
        a.send_json({"type": "auth", "token": jeton(superviseur)})
        a.receive_json()
        a.send_json({"type": "chat", "texte": "<img src=x onerror=alert(1)>"})
        assert a.receive_json()["message"]["texte"] == "<img src=x onerror=alert(1)>", "conservé tel quel, affiché comme texte"
        a.send_json({"type": "chat", "texte": "x" * 2001})
        a.send_json({"type": "chat", "texte": "   "})
        for i in range(9):
            a.send_json({"type": "chat", "texte": f"message {i}"})
            a.receive_json()
        a.send_json({"type": "chat", "texte": "un de trop"})
        assert a.receive_json()["type"] == "erreur", "10 messages par 10 secondes au maximum"
    assert db.query(MessageSalle).filter(MessageSalle.salle_id == s["id"], MessageSalle.texte.like("x%")).count() == 0


# ── Modération ──
def test_retrait_et_blocage_deconnectent(client, superviseur, technicien, tech2, db):
    t2 = ident(db, "technicien2.room@smartmaint-test.com")
    s = salle(client, superviseur, db, invites=("technicien.test@smartmaint-test.com", "technicien2.room@smartmaint-test.com"))
    tech_id = ident(db, "technicien.test@smartmaint-test.com")
    assert client.post(f"{API}/{s['id']}/membres/{tech_id}/bloquer", headers=technicien).status_code == 403, "un participant ne modère pas"
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        b.receive_json()
        assert client.post(f"{API}/{s['id']}/membres/{tech_id}/bloquer", headers=superviseur).status_code == 200
        assert b.receive_json() == {"type": "expulse", "raison": "bloquer"}
        with pytest.raises(WebSocketDisconnect):
            b.receive_json()
    assert client.get(f"{API}/{s['id']}", headers=technicien).status_code == 404, "bloqué : la salle devient inaccessible"
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        assert b.receive_json()["type"] == "erreur"
    assert client.post(f"{API}/{s['id']}/invitations", headers=superviseur, json={"utilisateurs": [tech_id]}).status_code == 409
    assert client.post(f"{API}/{s['id']}/membres/{t2}/retirer", headers=superviseur).status_code == 200
    assert all(x["id"] != s["id"] for x in client.get(API, headers=tech2).json())
    assert client.post(f"{API}/{s['id']}/membres/{tech_id}/debloquer", headers=superviseur).status_code == 200
    assert client.post(f"{API}/{s['id']}/invitations", headers=superviseur, json={"utilisateurs": [tech_id]}).status_code == 200


def test_roles_hote_moderateur(client, superviseur, technicien, tech2, db):
    s = salle(client, superviseur, db, invites=("technicien.test@smartmaint-test.com", "technicien2.room@smartmaint-test.com"))
    tech_id, t2, sup_id = (ident(db, e) for e in ("technicien.test@smartmaint-test.com", "technicien2.room@smartmaint-test.com", "superviseur.test@smartmaint-test.com"))
    assert client.put(f"{API}/{s['id']}/membres/{tech_id}/role", headers=technicien, json={"role": "moderateur"}).status_code == 403
    assert client.put(f"{API}/{s['id']}/membres/{tech_id}/role", headers=superviseur, json={"role": "moderateur"}).status_code == 200
    assert client.post(f"{API}/{s['id']}/membres/{sup_id}/retirer", headers=technicien).status_code == 403, "personne ne retire l'hôte"
    assert client.post(f"{API}/{s['id']}/membres/{t2}/retirer", headers=technicien).status_code == 200, "le modérateur retire un participant"
    assert client.post(f"{API}/{s['id']}/quitter", headers=superviseur).status_code == 409


def test_fin_de_reunion(client, superviseur, technicien, db):
    s = salle(client, superviseur, db)
    assert client.post(f"{API}/{s['id']}/terminer", headers=technicien).status_code == 403
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        b.receive_json()
        assert client.post(f"{API}/{s['id']}/terminer", headers=superviseur).status_code == 200
        assert b.receive_json() == {"type": "expulse", "raison": "fin"}
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        assert b.receive_json()["detail"] == "La réunion est terminée"
    assert client.get(f"{API}/{s['id']}/messages", headers=technicien).json()[-1]["type"] == "systeme"


def test_sans_connexion(client):
    assert client.get(API).status_code == 401
    assert client.post(API, json={"nom": "Test"}).status_code == 401


def test_jeton_de_session_fermee_refuse(client, superviseur, admin, db):
    s = salle(client, superviseur, db, invites=())
    entete = connecter(client, "superviseur")
    assert entete == superviseur
    r = client.post("/api/v1/auth/login", json={"email": "superviseur.test@smartmaint-test.com", "mot_de_passe": MOT_DE_PASSE})
    autre = r.json()["access_token"]
    client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {autre}"})
    with client.websocket_connect(f"{API}/ws/{s['id']}") as ws:
        ws.send_json({"type": "auth", "token": autre})
        assert ws.receive_json()["type"] == "erreur", "session fermée : accès refusé"


# ── Partage de fichiers ──
def deposer(client, entete, salle_id, nom="rapport.pdf", contenu=b"%PDF-1.4 test", type_="application/pdf"):
    return client.post(f"{API}/{salle_id}/fichiers", headers=entete, files={"fichier": (nom, contenu, type_)})


def test_partage_de_fichier(client, superviseur, technicien, tech2, admin, db):
    s = salle(client, superviseur, db)
    assert deposer(client, technicien, s["id"]).status_code == 403, "invité pas encore entré : refus"
    with client.websocket_connect(f"{API}/ws/{s['id']}") as a:
        a.send_json({"type": "auth", "token": jeton(superviseur)})
        a.receive_json()
        r = deposer(client, superviseur, s["id"], nom="../../Rapport P01 <final>.pdf")
        assert r.status_code == 200, r.text
        f = r.json()["fichier"]
        assert f["nom"] == "Rapport P01 _final_.pdf", "nom nettoyé, sans chemin"
        diffuse = a.receive_json()
        assert diffuse["type"] == "chat" and diffuse["message"]["fichier"]["id"] == f["id"]
    # téléchargement réservé aux membres, toujours en pièce jointe
    d = client.get(f"{API}/{s['id']}/fichiers/{f['id']}", headers=technicien)
    assert d.status_code == 200 and d.content == b"%PDF-1.4 test"
    assert d.headers["content-disposition"].startswith("attachment") and d.headers["x-content-type-options"] == "nosniff"
    for entete in (tech2, admin):
        assert client.get(f"{API}/{s['id']}/fichiers/{f['id']}", headers=entete).status_code == 404
        assert client.get(f"{API}/{s['id']}/fichiers", headers=entete).status_code == 404
    assert client.get(f"{API}/{s['id']}/messages", headers=technicien).json()[-1]["fichier"]["nom"] == "Rapport P01 _final_.pdf"
    # un fichier d'une autre salle n'est pas accessible par cette salle
    autre = salle(client, superviseur, db, nom="Autre réunion")
    assert client.get(f"{API}/{autre['id']}/fichiers/{f['id']}", headers=superviseur).status_code == 404


@pytest.mark.parametrize("nom,contenu,code", [
    ("script.js", b"alert(1)", 415), ("page.html", b"<script>", 415), ("faux.pdf", b"MZ\x90\x00 executable", 415),
    ("image.png", b"<svg onload=alert(1)>", 415), ("texte.txt", b"\x00\x01\x02binaire", 415), ("vide.pdf", b"", 422),
])
def test_fichiers_refuses(client, superviseur, db, nom, contenu, code):
    s = salle(client, superviseur, db, invites=())
    assert deposer(client, superviseur, s["id"], nom=nom, contenu=contenu).status_code == code


def test_fichier_trop_lourd_et_suppression(client, superviseur, technicien, db):
    from app.core.config import settings
    s = salle(client, superviseur, db)
    gros = b"%PDF" + b"0" * (settings.ROOM_FICHIER_MAX_MO * 1024 * 1024)
    assert deposer(client, superviseur, s["id"], contenu=gros).status_code == 413
    f = deposer(client, superviseur, s["id"], nom="notes.txt", contenu="Pièces à commander".encode(), type_="text/plain").json()["fichier"]
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        b.receive_json()
    assert client.delete(f"{API}/{s['id']}/fichiers/{f['id']}", headers=technicien).status_code == 403, "pas l'auteur"
    assert client.delete(f"{API}/{s['id']}/fichiers/{f['id']}", headers=superviseur).status_code == 200
    assert client.get(f"{API}/{s['id']}/fichiers/{f['id']}", headers=superviseur).status_code == 404
    assert client.get(f"{API}/{s['id']}/messages", headers=superviseur).json()[-1]["type"] == "systeme"


# ── Modération en direct ──
def test_couper_micro_d_un_participant(client, superviseur, technicien, db):
    s = salle(client, superviseur, db)
    tech_id, sup_id = ident(db, "technicien.test@smartmaint-test.com"), ident(db, "superviseur.test@smartmaint-test.com")
    assert client.post(f"{API}/{s['id']}/membres/{tech_id}/couper", headers=superviseur, json={"peripherique": "micro"}).status_code == 409, "hors ligne"
    with client.websocket_connect(f"{API}/ws/{s['id']}") as b:
        b.send_json({"type": "auth", "token": jeton(technicien)})
        b.receive_json()
        assert client.post(f"{API}/{s['id']}/membres/{sup_id}/couper", headers=technicien, json={"peripherique": "micro"}).status_code == 403
        assert client.post(f"{API}/{s['id']}/membres/{tech_id}/couper", headers=superviseur, json={"peripherique": "camera"}).status_code == 200
        assert b.receive_json() == {"type": "moderation", "peripherique": "camera", "par": "Superviseur Test"}
        assert client.post(f"{API}/{s['id']}/couper-micros", headers=superviseur).json()["participants"] == 1
        assert b.receive_json()["peripherique"] == "micro"
    assert client.post(f"{API}/{s['id']}/membres/{tech_id}/couper", headers=superviseur, json={"peripherique": "haut-parleur"}).status_code == 422
