"""Copilote (recherche et outils), traitement des documents (IDP) et assistance à la saisie, sans appel au modèle de langage."""
import io
import json

import pytest

from app.copilote import outils, recherche
from app.idp import controles, lecture
from app.models.equipment import Equipment
from app.saisie import suggestions, vocabulaire  # noqa: F401
from app.workflows.actions import rendre  # noqa: F401


# ── Lecture multiformat ──
def test_lecture_word():
    import docx
    d = docx.Document()
    d.add_paragraph("Bon d'intervention : remplacement du roulement SKF 6205")
    tampon = io.BytesIO()
    d.save(tampon)
    r = lecture.lire("bon.docx", tampon.getvalue())
    assert r["format"] == "word" and "SKF 6205" in r["texte"]


def test_lecture_excel():
    import openpyxl
    wb = openpyxl.Workbook()
    wb.active.append(["Équipement", "Action"])
    wb.active.append(["Pompe P01", "Graissage"])
    tampon = io.BytesIO()
    wb.save(tampon)
    r = lecture.lire("suivi.xlsx", tampon.getvalue())
    assert "Graissage" in r["texte"]


def test_lecture_json():
    r = lecture.lire("ordre.json", json.dumps({"equipement": "Pompe P01", "priorite": "haute"}).encode())
    assert "Pompe P01" in r["texte"]


def test_fichier_vide_refuse():
    with pytest.raises(lecture.ErreurLecture):
        lecture.lire("vide.pdf", b"")


def test_extension_mensongere_refusee():
    """Un fichier dont le contenu ne correspond pas à l'extension est refusé (ex. exécutable renommé)."""
    with pytest.raises(lecture.ErreurLecture):
        lecture.lire("facture.pdf", b"MZ\x90\x00 programme")


def test_xml_avec_entites_refuse():
    """Protection contre les fichiers XML piégés (expansion d'entités)."""
    piege = b'<?xml version="1.0"?><!DOCTYPE b [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><bon>&b;</bon>'
    with pytest.raises(lecture.ErreurLecture):
        lecture.lire("piege.xml", piege)


# ── Contrôles de cohérence ──
def test_controles_signalent_les_incoherences(db):
    eq = db.query(Equipment).filter(Equipment.nom == "Pompe test P01").first()
    r = controles.verifier(db, {"equipement": eq.nom, "date_debut": "2026-10-20 10:00", "date_fin": "2026-10-19 09:00",
                                "statut": "terminee", "description": "Fuite"})
    assert r["bloquant"] is True
    assert any(c["champ"] in ("date_fin", "dates") for c in r["controles"])


def test_controles_document_correct(db):
    eq = db.query(Equipment).filter(Equipment.nom == "Pompe test P01").first()
    r = controles.verifier(db, {"equipement": eq.nom, "description": "Graissage des paliers", "type_intervention": "preventive",
                                "priorite": "normale", "statut": "planifiee", "date_debut": "2026-10-22 08:00"})
    assert r["resolus"].get("equipement_id") == eq.id and r["bloquant"] is False, r["controles"]


# ── Copilote : recherche et outils ──
def test_trouver_equipement_ne_confond_pas_les_numeros(db):
    assert outils.trouver_equipement(db, "pompe P01").nom == "Pompe test P01"
    with pytest.raises(outils.OutilErreur):
        outils.trouver_equipement(db, "compresseur Z99")


def test_recherche_bm25_sans_modele(db):
    recherche.ajouter_document(db, "manuel", 1, "Manuel pompe", "Le roulement de la pompe doit être graissé toutes les 500 heures.")
    recherche.ajouter_document(db, "manuel", 2, "Manuel moteur", "Vérifier l'alignement de l'accouplement du moteur.")
    r = recherche.rechercher(db, "graissage roulement pompe", 2)
    assert r and r[0]["source"].startswith("Manuel pompe")


def test_normalisation_texte():
    assert recherche.normaliser("Équipement ÉLECTRIQUE") == "equipement electrique"


# ── Assistance à la saisie ──
def test_suggestions_par_api(client, technicien):
    r = client.post("/api/v1/saisie/suggestions", headers=technicien, json={"champ": "pieces_remplacees", "texte": "roul"})
    assert r.status_code == 200
    textes = json.dumps(r.json(), ensure_ascii=False).lower()
    assert "roulement" in textes


def test_suggestions_multilingues(client, technicien):
    r = client.post("/api/v1/saisie/suggestions", headers=technicien, json={"champ": "pieces_remplacees", "texte": "bearing", "langue": "fr"})
    assert "roulement" in json.dumps(r.json(), ensure_ascii=False).lower()


def test_fragment_courant_garde_le_debut_de_phrase():
    avant, fragment = suggestions.fragment_courant("Graissage effectué, rempl")
    assert fragment.strip() == "rempl" and avant.startswith("Graissage")


def test_reformulation_sans_modele(client, technicien):
    """Sans modèle de langage, la reformulation répond quand même (traduction du vocabulaire connu)."""
    r = client.post("/api/v1/saisie/reformuler", headers=technicien, json={"texte": "bearing changed", "champ": "actions_realisees"})
    assert r.status_code == 200


def test_proposition_sans_modele(client, superviseur, db):
    eq = db.query(Equipment).filter(Equipment.nom == "Moteur test M01").first()
    r = client.post("/api/v1/saisie/proposer", headers=superviseur,
                    json={"equipement_id": eq.id, "description": "fuite importante et odeur de brûlé", "avec_ia": False})
    assert r.status_code == 200
    assert r.json()["propositions"].get("priorite") in ("haute", "urgente")

