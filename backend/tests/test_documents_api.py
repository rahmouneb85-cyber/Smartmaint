"""Parcours complet d'un document : dépôt, lecture sans modèle (étiquettes), contrôles, validation, intervention créée."""
import base64
import io

import docx

from app.models.intervention import Intervention

API = "/api/v1/documents"


def bon_word(lignes):
    d = docx.Document()
    for ligne in lignes:
        d.add_paragraph(ligne)
    tampon = io.BytesIO()
    d.save(tampon)
    return base64.b64encode(tampon.getvalue()).decode()


def test_parcours_bon_intervention(client, superviseur, db):
    contenu = bon_word(["BON D'INTERVENTION", "Équipement : Pompe test P01", "Type : préventive", "Priorité : normale",
                        "Date de début : 22/10/2026 08:00", "Description : Graissage des paliers de la pompe",
                        "Technicien : Technicien Test"])
    r = client.post(f"{API}/analyser", headers=superviseur, json={"nom": "bon.docx", "contenu": contenu})
    assert r.status_code == 200, r.text
    doc = r.json()
    champs = doc.get("champs") or doc.get("donnees", {}).get("champs") or {}
    assert "Pompe" in str(champs), "les champs sont lus même sans modèle de langage"
    r = client.post(f"{API}/{doc['id']}/valider", headers=superviseur, json={"champs": champs})
    assert r.status_code == 200, r.text
    if r.status_code == 200:
        assert db.query(Intervention).filter(Intervention.description.like("%Graissage des paliers%")).count() == 1
        assert client.post(f"{API}/{doc['id']}/valider", headers=superviseur, json={"champs": champs}).status_code == 409


def test_type_inconnu_refuse(client, superviseur):
    r = client.post(f"{API}/analyser", headers=superviseur, json={"nom": "a.txt", "contenu": "", "type_document": "facture"})
    assert r.status_code == 400


def test_technicien_ne_depose_pas_de_manuel(client, technicien):
    r = client.post(f"{API}/analyser", headers=technicien, json={"nom": "m.docx", "contenu": bon_word(["Manuel"]), "type_document": "manuel"})
    assert r.status_code == 403


def test_contenu_mal_encode(client, superviseur):
    r = client.post(f"{API}/analyser", headers=superviseur, json={"nom": "bon.pdf", "contenu": "%%%pas-du-base64%%%"})
    assert r.status_code in (400, 422)


def test_liste_des_documents(client, superviseur):
    r = client.get(API, headers=superviseur)
    assert r.status_code == 200 and isinstance(r.json(), list)

