"""Support avec capture d'écran et recherche intelligente : isolation des données entre comptes."""
import io
from pathlib import Path

from PIL import Image

from app.core.config import settings
from app.models.document_idp import DocumentIDP
from app.models.intervention import Intervention
from app.models.notification import Notification
from app.models.support import DemandeSupport
from app.models.user import User
from conftest import MOT_DE_PASSE

API = "/api/v1/support"


def image(format_="PNG", taille=(40, 30), exif=False) -> bytes:
    sortie = io.BytesIO()
    img = Image.new("RGB", taille, (200, 30, 30))
    if exif:
        donnees = Image.Exif()
        donnees[0x010F] = "Fabricant secret"           # champ « Make » : doit disparaître au réencodage
        img.save(sortie, format_, exif=donnees)
    else:
        img.save(sortie, format_)
    return sortie.getvalue()


def second_technicien(client, admin):
    """Un deuxième compte technicien : même rôle, mais aucun accès aux demandes du premier."""
    email = "technicien2.support@smartmaint-test.com"
    client.post("/api/v1/auth/register", headers=admin, json={"nom": "Technicien Deux", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"})
    r = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def envoyer(client, entete, sujet="Écran figé sur la page Capteurs", capture=None, **champs):
    fichiers = {"capture": ("capture.png", capture, "image/png")} if capture is not None else None
    data = {"sujet": sujet, "description": "La liste ne se met plus à jour après un filtre.", "page": "capteurs", **champs}
    return client.post(f"{API}/demandes", headers=entete, data=data, files=fichiers)


# ─────────────────────────────────────────────────────────────
# SUPPORT
# ─────────────────────────────────────────────────────────────
def test_demande_avec_capture_et_notification(client, technicien, admin, superviseur, db):
    r = envoyer(client, technicien, capture=image(exif=True))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["statut"] == "ouverte" and d["capture"] is True
    # l'équipe de support est notifiée, pas l'auteur
    for entete, attendu in ((admin, True), (superviseur, True), (technicien, False)):
        notifs = client.get("/api/v1/notifications", headers=entete).json()
        assert any(n["type"] == "support" and n["objet_id"] == d["id"] for n in notifs) is attendu
    # capture réencodée par le serveur, sans métadonnées
    fichier = db.get(DemandeSupport, d["id"]).capture
    with Image.open(Path(settings.SUPPORT_DOSSIER) / fichier) as img:
        assert img.format == "JPEG" and 0x010F not in img.getexif()
    assert client.get(f"{API}/demandes/{d['id']}/capture", headers=technicien).status_code == 200
    assert client.get(f"{API}/demandes/{d['id']}/capture", headers=admin).headers["content-type"].startswith("image/")


def test_isolation_entre_utilisateurs(client, technicien, admin, db):
    d = envoyer(client, technicien, sujet="Demande privée du technicien", capture=image()).json()
    autre = second_technicien(client, admin)
    for methode, chemin, corps in (("get", f"{API}/demandes/{d['id']}", None),
                                   ("get", f"{API}/demandes/{d['id']}/capture", None),
                                   ("post", f"{API}/demandes/{d['id']}/reponses", {"texte": "intrusion"}),
                                   ("put", f"{API}/demandes/{d['id']}/statut", {"statut": "fermee"})):
        r = getattr(client, methode)(chemin, headers=autre, **({"json": corps} if corps else {}))
        assert r.status_code == 404, f"{methode} {chemin} : {r.status_code}"
    # même avec « toutes », un technicien ne voit que ses propres demandes
    assert all(x["auteur"]["nom"] == "Technicien Deux" for x in client.get(f"{API}/demandes?toutes=true", headers=autre).json())
    assert db.get(DemandeSupport, d["id"]).statut == "ouverte"
    # l'administrateur voit toutes les demandes
    assert any(x["id"] == d["id"] for x in client.get(f"{API}/demandes?toutes=true", headers=admin).json())


def test_suivi_reponse_statut_et_compteur(client, technicien, admin, db):
    d = envoyer(client, technicien, sujet="Export PDF vide").json()
    r = client.post(f"{API}/demandes/{d['id']}/reponses", headers=admin, json={"texte": "Pouvez-vous préciser l'équipement ?"})
    assert r.status_code == 200 and r.json()["statut"] == "en_cours", "réponse de l'équipe : prise en charge"
    assert r.json()["reponses"][-1]["equipe"] is True
    compteur = client.get("/api/v1/notifications/compteur", headers=technicien).json()
    assert compteur["support_reponses"] >= 1
    # la lecture de la demande remet le compteur à zéro et marque ses notifications comme lues
    detail = client.get(f"{API}/demandes/{d['id']}", headers=technicien).json()
    assert detail["reponses"][0]["texte"] == "Pouvez-vous préciser l'équipement ?"
    assert not any(x["id"] == d["id"] and x["nouveau"] for x in client.get(f"{API}/demandes", headers=technicien).json())
    tech_id = db.query(User).filter(User.email == "technicien.test@smartmaint-test.com").first().id
    db.expire_all()
    assert db.query(Notification).filter(Notification.utilisateur_id == tech_id, Notification.objet_id == d["id"],
                                         Notification.type == "support", Notification.lue.is_(False)).count() == 0
    # statut : réservé à l'équipe ; l'auteur peut seulement fermer
    assert client.put(f"{API}/demandes/{d['id']}/statut", headers=technicien, json={"statut": "resolue"}).status_code == 403
    assert client.put(f"{API}/demandes/{d['id']}/statut", headers=admin, json={"statut": "resolue"}).json()["statut"] == "resolue"
    # l'auteur répond après résolution : la demande est rouverte
    assert client.post(f"{API}/demandes/{d['id']}/reponses", headers=technicien, json={"texte": "Le problème revient"}).json()["statut"] == "ouverte"
    assert client.put(f"{API}/demandes/{d['id']}/statut", headers=technicien, json={"statut": "fermee"}).json()["statut"] == "fermee"


def test_captures_refusees(client, technicien):
    assert envoyer(client, technicien, capture=b"<script>alert(1)</script>").status_code == 415
    assert envoyer(client, technicien, capture=b"%PDF-1.4 faux document").status_code == 415
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, "GIF")
    assert envoyer(client, technicien, capture=gif.getvalue()).status_code == 415
    trop_gros = b"\x89PNG" + b"0" * (settings.SUPPORT_TAILLE_MAX_MO * 1024 * 1024 + 10)
    assert envoyer(client, technicien, capture=trop_gros).status_code == 413


def test_champs_invalides(client, technicien):
    assert envoyer(client, technicien, sujet="a").status_code == 422
    assert envoyer(client, technicien, categorie="inconnue").status_code == 422
    assert client.post(f"{API}/demandes", data={"sujet": "Sans connexion", "description": "test test"}).status_code == 401


# ─────────────────────────────────────────────────────────────
# RECHERCHE
# ─────────────────────────────────────────────────────────────
def groupes(r):
    return {g["groupe"]: g["elements"] for g in r.json()["resultats"]}


def test_recherche_equipement_ordre_libre(client, technicien):
    g = groupes(client.get("/api/v1/recherche?q=atelier pompe", headers=technicien))
    assert [e["titre"] for e in g["equipements"]] == ["Pompe test P01"]


def test_recherche_numero_et_statut(client, admin, db):
    pompe = client.get("/api/v1/equipements/", headers=admin).json()[0]
    i = Intervention(equipement_id=pompe["id"], description="Remplacement du roulement", priorite="urgente", statut="en_cours")
    db.add(i)
    db.commit()
    g = groupes(client.get(f"/api/v1/recherche?q=%23{i.id}", headers=admin))
    assert g["interventions"][0]["id"] == i.id
    r = client.get("/api/v1/recherche?q=urgente en cours", headers=admin)
    assert r.json()["comprise"]["filtres"] == {"priorite": "urgente", "intervention": "en_cours"}
    assert all(x["priorite"] == "urgente" and x["statut"] == "en_cours" for x in groupes(r)["interventions"])
    assert "equipements" not in groupes(r)


def test_recherche_respecte_les_droits(client, technicien, admin, superviseur, db):
    tech_id = db.query(User).filter(User.email == "technicien.test@smartmaint-test.com").first().id
    admin_id = db.query(User).filter(User.email == "admin.test@smartmaint-test.com").first().id
    from datetime import datetime
    for uid, nom in ((tech_id, "rapport_vanne_technicien.pdf"), (admin_id, "rapport_vanne_confidentiel.pdf")):
        db.add(DocumentIDP(utilisateur_id=uid, type_document="manuel", nom_fichier=nom, format="pdf", taille=1,
                           empreinte="0" * 64, chemin="x", statut="indexe", created_at=datetime.now()))
    db.commit()
    tech = groupes(client.get("/api/v1/recherche?q=rapport vanne", headers=technicien))
    assert [d["titre"] for d in tech["documents"]] == ["rapport_vanne_technicien.pdf"], "documents d'un autre compte invisibles"
    adm = groupes(client.get("/api/v1/recherche?q=rapport vanne", headers=admin))
    assert len(adm["documents"]) == 2
    # comptes : email visible pour l'administrateur seulement
    assert "detail" not in groupes(client.get("/api/v1/recherche?q=superviseur", headers=technicien))["utilisateurs"][0]
    assert groupes(client.get("/api/v1/recherche?q=superviseur", headers=admin))["utilisateurs"][0]["detail"].endswith("@smartmaint-test.com")
    # un technicien ne trouve ni les workflows ni les demandes de support des autres
    envoyer(client, superviseur, sujet="Problème confidentiel du superviseur")
    t = groupes(client.get("/api/v1/recherche?q=confidentiel superviseur", headers=technicien))
    assert "support" not in t and "workflows" not in t
    assert "support" in groupes(client.get("/api/v1/recherche?q=confidentiel superviseur", headers=admin))


def test_recherche_caracteres_speciaux_et_limites(client, technicien):
    assert groupes(client.get("/api/v1/recherche?q=%25%25", headers=technicien)) == {}, "% n'est pas un joker"
    assert client.get("/api/v1/recherche?q=a", headers=technicien).status_code == 422
    assert client.get("/api/v1/recherche?q=" + "x" * 101, headers=technicien).status_code == 422
    assert client.get("/api/v1/recherche?q=pompe").status_code == 401
