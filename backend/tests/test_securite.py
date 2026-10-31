"""Sécurité : authentification de chaque route, droits par rôle, mots de passe, blocage, 2FA, en-têtes."""
import re

import pyotp
import pytest

from app.main import app
from conftest import CLE_IOT, MOT_DE_PASSE, connecter

# Routes volontairement accessibles sans être connecté
PUBLIQUES = {("GET", "/"), ("GET", "/health"), ("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/2fa/connexion"),
             ("POST", "/api/v1/auth/refresh"), ("POST", "/api/v1/auth/logout"),
             # pages publiques : aucune donnée de la plateforme (voir test_boutons_flottants.py)
             ("GET", "/api/v1/public/config"), ("POST", "/api/v1/public/assistant"), ("POST", "/api/v1/public/contact")}
# Routes réservées aux appareils IoT (clé X-API-Key au lieu d'un compte)
IOT = {("POST", "/api/v1/capteurs/data"), ("POST", "/api/v1/alertes/")}


def toutes_les_routes():
    """Toutes les routes déclarées par l'API, lues dans sa description OpenAPI."""
    for chemin, operations in app.openapi()["paths"].items():
        if chemin.startswith("/api/v1"):
            for methode in operations:
                yield methode.upper(), chemin


@pytest.mark.parametrize("methode,chemin", sorted(set(toutes_les_routes())))
def test_chaque_route_exige_une_authentification(client, methode, chemin):
    if (methode, chemin) in PUBLIQUES:
        pytest.skip("route publique")
    url = re.sub(r"\{[^}]+\}", "1", chemin)
    r = client.request(methode, url, json={})
    assert r.status_code in (401, 403), f"{methode} {chemin} accessible sans connexion ({r.status_code})"


@pytest.mark.parametrize("methode,chemin", sorted(IOT))
def test_routes_iot_refusent_une_mauvaise_cle(client, methode, chemin):
    r = client.request(methode, chemin, json={}, headers={"X-API-Key": "mauvaise-cle"})
    assert r.status_code in (401, 403)


@pytest.mark.parametrize("methode,chemin", [
    ("POST", "/api/v1/auth/register"), ("GET", "/api/v1/admin/utilisateurs"), ("GET", "/api/v1/admin/sessions"),
    ("GET", "/api/v1/workflows"), ("GET", "/api/v1/copilote/statistiques"), ("DELETE", "/api/v1/equipements/1"),
    ("POST", "/api/v1/equipements/"), ("POST", "/api/v1/capteurs/"), ("DELETE", "/api/v1/alertes/1"),
    ("GET", "/api/v1/saisie/statistiques"), ("POST", "/api/v1/copilote/indexer"), ("DELETE", "/api/v1/documents/1"),
])
def test_technicien_sans_droits_administrateur(client, technicien, methode, chemin):
    r = client.request(methode, chemin, json={}, headers=technicien)
    assert r.status_code == 403, f"{methode} {chemin} : {r.status_code}"


def test_superviseur_ne_gere_pas_les_comptes(client, superviseur):
    assert client.get("/api/v1/admin/utilisateurs", headers=superviseur).status_code == 403
    assert client.get("/api/v1/workflows", headers=superviseur).status_code == 200


def test_mauvais_mot_de_passe(client):
    r = client.post("/api/v1/auth/login", json={"email": "technicien.test@smartmaint-test.com", "mot_de_passe": "Faux#2026xx"})
    assert r.status_code == 401
    assert "incorrect" in r.json()["detail"]


def test_email_inconnu_meme_message(client):
    """Pas d'indice sur l'existence d'un compte."""
    r = client.post("/api/v1/auth/login", json={"email": "personne@smartmaint-test.com", "mot_de_passe": "Faux#2026xx"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Email ou mot de passe incorrect"


def test_blocage_apres_cinq_echecs(client, admin):
    email = "bloque.test@smartmaint-test.com"
    r = client.post("/api/v1/auth/register", headers=admin,
                    json={"nom": "Compte Bloqué", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"})
    assert r.status_code == 200, r.text
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": "Faux#2026xx"})
    r = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE})
    assert r.status_code == 429, "le bon mot de passe doit être refusé pendant le blocage"
    assert "Retry-After" in r.headers


@pytest.mark.parametrize("faible", ["court1!", "sansmajuscule1!", "SANSMINUSCULE1!", "SansChiffre!!", "SansSpecial123"])
def test_politique_mot_de_passe(client, admin, faible):
    r = client.post("/api/v1/auth/register", headers=admin,
                    json={"nom": "Faible", "email": "faible@smartmaint-test.com", "mot_de_passe": faible, "role": "technicien"})
    assert r.status_code == 422


def test_email_deja_utilise(client, admin):
    r = client.post("/api/v1/auth/register", headers=admin,
                    json={"nom": "Doublon", "email": "admin.test@smartmaint-test.com", "mot_de_passe": MOT_DE_PASSE})
    assert r.status_code == 400


def test_jeton_falsifie_refuse(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.e30.faux"})
    assert r.status_code == 401


def test_deconnexion_invalide_le_jeton(client, admin):
    email = "deconnexion.test@smartmaint-test.com"
    client.post("/api/v1/auth/register", headers=admin,
                json={"nom": "Déconnexion", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"})
    jeton = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE}).json()["access_token"]
    entete = {"Authorization": f"Bearer {jeton}"}
    assert client.get("/api/v1/auth/me", headers=entete).status_code == 200
    client.post("/api/v1/auth/logout", headers=entete)
    assert client.get("/api/v1/auth/me", headers=entete).status_code == 401


def test_double_authentification_complete(client, admin):
    email = "mfa.test@smartmaint-test.com"
    client.post("/api/v1/auth/register", headers=admin,
                json={"nom": "Double Facteur", "email": email, "mot_de_passe": MOT_DE_PASSE, "role": "technicien"})
    jeton = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE}).json()["access_token"]
    entete = {"Authorization": f"Bearer {jeton}"}
    secret = client.post("/api/v1/auth/2fa/preparer", headers=entete).json()["secret"]
    assert client.post("/api/v1/auth/2fa/activer", headers=entete, json={"code": "000000"}).status_code == 400
    r = client.post("/api/v1/auth/2fa/activer", headers=entete, json={"code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200 and len(r.json()["codes_secours"]) >= 8

    codes_secours = r.json()["codes_secours"]
    code_utilise = pyotp.TOTP(secret).now()

    def etape_mfa():
        r = client.post("/api/v1/auth/login", json={"email": email, "mot_de_passe": MOT_DE_PASSE})
        assert r.json().get("mfa_requis") is True and "access_token" not in r.json(), "le mot de passe seul ne suffit plus"
        return r.json()["mfa_jeton"]

    assert client.post("/api/v1/auth/2fa/connexion", json={"mfa_jeton": etape_mfa(), "code": "123456"}).status_code == 401
    # le code déjà utilisé pour l'activation ne peut pas être rejoué
    assert client.post("/api/v1/auth/2fa/connexion", json={"mfa_jeton": etape_mfa(), "code": code_utilise}).status_code == 401
    # un code de secours fonctionne, mais une seule fois
    r = client.post("/api/v1/auth/2fa/connexion", json={"mfa_jeton": etape_mfa(), "code": codes_secours[0]})
    assert r.status_code == 200 and r.json()["access_token"]
    assert client.post("/api/v1/auth/2fa/connexion", json={"mfa_jeton": etape_mfa(), "code": codes_secours[0]}).status_code == 401


def test_secret_2fa_chiffre_en_base(db):
    from app.models.user import User
    u = db.query(User).filter(User.email == "mfa.test@smartmaint-test.com").first()
    assert u is not None and u.totp_secret
    assert len(u.totp_secret) > 40, "le secret doit être stocké chiffré, jamais en clair (32 caractères)"


def test_entetes_de_securite(client):
    r = client.get("/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]


def test_cle_iot_valide_acceptee(client, db):
    from app.models.sensor import Sensor
    capteur = db.query(Sensor).first()
    r = client.post("/api/v1/capteurs/data", json={"capteur_id": capteur.id, "valeur": 40.0}, headers={"X-API-Key": CLE_IOT})
    assert r.status_code == 200, r.text


def test_cors_refuse_un_site_inconnu(client):
    r = client.options("/api/v1/auth/login", headers={"Origin": "https://site-pirate.example", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") != "https://site-pirate.example"


def test_connexion_reutilise_jeton(client):
    assert connecter(client, "superviseur")["Authorization"].startswith("Bearer ")
