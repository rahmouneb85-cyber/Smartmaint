"""Personnalisation des boutons flottants : réservée à l'administrateur, sans effet sur les droits d'accès,
et contacts de la messagerie restreints par rôle côté serveur."""
from datetime import datetime

import pytest

from app.api.boutons import dans_horaires
from app.models.user import User

API = "/api/v1/boutons"


@pytest.fixture(autouse=True)
def reglages_par_defaut(client, admin):
    """Chaque test part des réglages d'origine et les rétablit à la fin."""
    client.post(f"{API}/configuration/reinitialiser", headers=admin)
    yield
    client.post(f"{API}/configuration/reinitialiser", headers=admin)


def config(client, admin):
    return client.get(f"{API}/configuration", headers=admin).json()


def modifier(client, admin, cle, **changements):
    c = config(client, admin)
    for b in c["boutons"]:
        if b["cle"] == cle:
            b.update(changements)
    return client.put(f"{API}/configuration", headers=admin, json={"boutons": c["boutons"], "contacts": c["contacts"]})


def cles(client, entete):
    return [b["cle"] for b in client.get(f"{API}/mes-boutons", headers=entete).json()["boutons"]]


def test_reserve_a_l_administrateur(client, superviseur, technicien, admin):
    for entete in (superviseur, technicien):
        assert client.get(f"{API}/configuration", headers=entete).status_code == 403
        assert client.put(f"{API}/configuration", headers=entete, json={"boutons": []}).status_code == 403
        assert client.post(f"{API}/configuration/reinitialiser", headers=entete).status_code == 403
    assert client.get(f"{API}/configuration").status_code == 401
    assert len(config(client, admin)["boutons"]) == 18


def test_masquer_un_bouton_ne_retire_pas_la_fonction(client, admin, technicien):
    assert "prive.messagerie" in cles(client, technicien)
    assert modifier(client, admin, "prive.messagerie", visible=False).status_code == 200
    assert "prive.messagerie" not in cles(client, technicien)
    # la fonctionnalité et les droits restent intacts
    assert client.get("/api/v1/messagerie/contacts", headers=technicien).status_code == 200
    assert client.get("/api/v1/messagerie/non-lus", headers=technicien).status_code == 200


def test_bouton_reserve_a_un_role(client, admin, technicien, superviseur):
    modifier(client, admin, "prive.support", roles=["admin", "superviseur"])
    assert "prive.support" not in cles(client, technicien)
    assert "prive.support" in cles(client, superviseur)
    assert client.get("/api/v1/support/demandes", headers=technicien).status_code == 200, "le support reste accessible"


def test_ordre_couleur_pages_et_reinitialisation(client, admin, technicien):
    modifier(client, admin, "prive.compte", ordre=0, couleur="#ABCDEF", pages=["dashboard"], appareils="mobile")
    b = client.get(f"{API}/mes-boutons", headers=technicien).json()["boutons"]
    compte = next(x for x in b if x["cle"] == "prive.compte")
    assert compte["couleur"] == "#abcdef" and compte["pages"] == ["dashboard"] and compte["appareils"] == "mobile"
    assert b[0]["cle"] in ("prive.compte", "prive.recherche")
    assert config(client, admin)["maj_par"] == "Admin Test"
    r = client.post(f"{API}/configuration/reinitialiser", headers=admin).json()
    assert next(x for x in r["boutons"] if x["cle"] == "prive.compte")["couleur"] == "#0f766e"


def test_bouton_public_masque(client, admin):
    assert "public.contact" in [b["cle"] for b in client.get("/api/v1/public/config").json()["boutons"]]
    modifier(client, admin, "public.contact", visible=False)
    assert "public.contact" not in [b["cle"] for b in client.get("/api/v1/public/config").json()["boutons"]]
    r = client.post("/api/v1/public/contact", json={"nom": "Visiteur", "email": "visiteur.masque@exemple.com", "message": "Bonjour, une question."})
    assert r.status_code == 200, "la route publique fonctionne toujours"


@pytest.mark.parametrize("changement", [
    {"couleur": "rouge"}, {"couleur": "#12345"}, {"roles": ["directeur"]}, {"pages": ["inconnue"]},
    {"appareils": "montre"}, {"condition": "non_lus"}, {"condition": "horaires", "heure_debut": 9, "heure_fin": 9},
])
def test_valeurs_invalides_refusees(client, admin, changement):
    assert modifier(client, admin, "prive.compte", **changement).status_code == 422


def test_bouton_inconnu_ou_double_refuse(client, admin):
    c = config(client, admin)
    assert client.put(f"{API}/configuration", headers=admin, json={"boutons": c["boutons"] + [{**c["boutons"][0], "cle": "prive.pirate"}]}).status_code == 422
    assert client.put(f"{API}/configuration", headers=admin, json={"boutons": c["boutons"] + [c["boutons"][0]]}).status_code == 422


def test_plage_horaire():
    b = {"condition": "horaires", "heure_debut": 8, "heure_fin": 18}
    assert dans_horaires(b, datetime(2026, 10, 27, 9)) and not dans_horaires(b, datetime(2026, 10, 27, 20))
    nuit = {"condition": "horaires", "heure_debut": 22, "heure_fin": 6}
    assert dans_horaires(nuit, datetime(2026, 10, 27, 23)) and dans_horaires(nuit, datetime(2026, 10, 27, 2))
    assert not dans_horaires(nuit, datetime(2026, 10, 27, 12))


def test_contacts_restreints_par_role(client, admin, technicien, superviseur, db):
    sup_id = db.query(User).filter(User.email == "superviseur.test@smartmaint-test.com").first().id
    conv = client.post("/api/v1/messagerie/conversations", headers=technicien, json={"destinataire_id": sup_id}).json()
    c = config(client, admin)
    c["contacts"]["technicien"] = ["admin"]
    assert client.put(f"{API}/configuration", headers=admin, json=c).status_code == 200
    roles = {x["role"] for x in client.get("/api/v1/messagerie/contacts", headers=technicien).json()}
    assert roles <= {"admin"}, roles
    assert client.post("/api/v1/messagerie/conversations", headers=technicien, json={"destinataire_id": sup_id}).status_code == 404
    r = client.post(f"/api/v1/messagerie/conversations/{conv['id']}/messages", headers=technicien, json={"texte": "toujours là ?"})
    assert r.status_code == 403
    assert client.get(f"/api/v1/messagerie/conversations/{conv['id']}/messages", headers=technicien).status_code == 200, "historique consultable"
    # le superviseur garde ses propres droits : il peut toujours écrire au technicien
    assert any(x["role"] == "technicien" for x in client.get("/api/v1/messagerie/contacts", headers=superviseur).json())
    # la recherche suit la même règle
    groupes = {g["groupe"]: g["elements"] for g in client.get("/api/v1/recherche?q=superviseur", headers=technicien).json()["resultats"]}
    assert "utilisateurs" not in groupes


# ─────────────────────────────────────────────────────────────
# Icônes, tailles, animations, langues, événement et boutons ajoutés
# ─────────────────────────────────────────────────────────────
def test_icone_taille_animation_langues(client, admin, technicien):
    assert modifier(client, admin, "prive.recherche", icone="🧭", taille="grand", animation="marquee", langues=["ar"]).status_code == 200
    b = next(x for x in client.get(f"{API}/mes-boutons", headers=technicien).json()["boutons"] if x["cle"] == "prive.recherche")
    assert (b["icone"], b["taille"], b["animation"], b["langues"]) == ("🧭", "grand", "marquee", ["ar"])


@pytest.mark.parametrize("changement", [{"icone": "<img src=x>"}, {"taille": "geant"}, {"animation": "clignotant"}, {"langues": ["de"]}])
def test_apparence_invalide_refusee(client, admin, changement):
    assert modifier(client, admin, "prive.recherche", **changement).status_code == 422


def test_condition_evenement_alerte_critique(client, admin, technicien):
    assert modifier(client, admin, "contextuel.support", condition="non_lus_ou_alerte").status_code == 200
    assert modifier(client, admin, "prive.support", condition="alerte_critique").status_code == 200
    assert modifier(client, admin, "prive.compte", condition="alerte_critique").status_code == 422, "condition réservée à certains boutons"


def ajouter(client, admin, **bouton):
    c = config(client, admin)
    nouveau = {"cle": "perso.wiki", "visible": True, "ordre": 20, "couleur": "#0f766e", "icone": "🔗", "roles": ["technicien"],
               "libelles": {"fr": "Procédures", "ar": "الإجراءات"}, "cible_type": "lien", "cible": "https://exemple.com/procedures", **bouton}
    return client.put(f"{API}/configuration", headers=admin, json={"boutons": c["boutons"] + [nouveau], "contacts": c["contacts"]})


def test_bouton_ajoute_selon_le_role(client, admin, technicien, superviseur):
    assert ajouter(client, admin).status_code == 200
    b = next(x for x in client.get(f"{API}/mes-boutons", headers=technicien).json()["boutons"] if x["cle"] == "perso.wiki")
    assert b["libelles"]["fr"] == "Procédures" and b["cible"] == "https://exemple.com/procedures"
    assert "perso.wiki" not in cles(client, superviseur)
    assert ajouter(client, admin, cle="perso.carte", cible_type="page", cible="capteurs").status_code == 200


@pytest.mark.parametrize("bouton", [
    {"cible": "javascript:alert(1)"}, {"cible": "http://exemple.com"}, {"cible": "data:text/html,<script>"}, {"cible": "//exemple.com"},
    {"cible_type": "page", "cible": "inconnue"}, {"libelles": {"en": "Only English"}}, {"libelles": {"fr": "x" * 41}}, {"cle": "perso.<b>"},
])
def test_bouton_ajoute_invalide(client, admin, bouton):
    assert ajouter(client, admin, **bouton).status_code == 422


def test_nombre_de_boutons_ajoutes_limite(client, admin):
    c = config(client, admin)
    perso = [{"cle": f"perso.b{i}", "ordre": 20 + i, "couleur": "#0f766e", "libelles": {"fr": f"Lien {i}"}, "cible_type": "page", "cible": "dashboard"} for i in range(11)]
    assert client.put(f"{API}/configuration", headers=admin, json={"boutons": c["boutons"] + perso}).status_code == 422


# ─────────────────────────────────────────────────────────────
# Préférences personnelles : isolées par compte
# ─────────────────────────────────────────────────────────────
@pytest.fixture
def prefs_propres(client, technicien, superviseur):
    for e in (technicien, superviseur):
        client.delete(f"{API}/mes-preferences", headers=e)
    yield
    for e in (technicien, superviseur):
        client.delete(f"{API}/mes-preferences", headers=e)


def test_preferences_isolees(client, technicien, superviseur, prefs_propres):
    r = client.put(f"{API}/mes-preferences", headers=technicien, json={"masques": ["prive.whatsapp"], "actions": ["capteurs", "support"], "animations_reduites": True})
    assert r.status_code == 200 and r.json()["actions"] == ["capteurs", "support"]
    assert client.get(f"{API}/mes-boutons", headers=technicien).json()["preferences"]["masques"] == ["prive.whatsapp"]
    autre = client.get(f"{API}/mes-preferences", headers=superviseur).json()
    assert autre["masques"] == [] and autre["animations_reduites"] is False, "les préférences d'un compte ne touchent pas les autres"
    assert "prive.whatsapp" in cles(client, technicien), "le bouton reste fourni par le serveur : seul l'affichage personnel change"
    assert client.get("/api/v1/messagerie/contacts", headers=technicien).status_code == 200


def test_preferences_actions_selon_le_role(client, technicien, superviseur, prefs_propres):
    assert client.put(f"{API}/mes-preferences", headers=technicien, json={"actions": ["workflows"]}).status_code == 422
    assert client.put(f"{API}/mes-preferences", headers=superviseur, json={"actions": ["workflows"]}).status_code == 200
    assert client.put(f"{API}/mes-preferences", headers=technicien, json={"masques": ["prive.inconnu"]}).status_code == 422
    ids = {a["id"] for a in client.get(f"{API}/mes-preferences", headers=technicien).json()["actions_disponibles"]}
    assert "parametres" not in ids and "workflows" not in ids and "intervention" in ids


def test_preferences_sans_connexion(client):
    assert client.get(f"{API}/mes-preferences").status_code == 401
    assert client.put(f"{API}/mes-preferences", json={}).status_code == 401
