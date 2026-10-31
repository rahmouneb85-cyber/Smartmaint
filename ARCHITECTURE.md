# SmartMaint : architecture et guide technique

Plateforme de supervision industrielle IoT et de maintenance assistée par l'IA.

## 1. Vue d'ensemble

```
 Capteurs / simulateur IoT ──(X-API-Key)──►┐
                                           │
 Navigateur (React, port 3000) ──(JWT)────►├──► API FastAPI (port 8001) ──► MySQL
                                           │        │
                                           │        ├──► Modèles IA locaux (Isolation Forest, modeles_ia/)
                                           │        ├──► Modèle de langage : Gemini (en ligne) ou Ollama (local)
                                           │        ├──► Telegram (alertes)
                                           │        └──► Moteur des workflows (tâche de fond, toutes les 30 s)
```

## 2. Organisation du backend (`backend/app`)

| Dossier | Rôle |
|---|---|
| `api/` | Routes HTTP, une par domaine : `auth`, `admin`, `equipment`, `sensor`, `alert`, `intervention`, `rapport`, `ia`, `assistant`, `copilote`, `documents`, `saisie`, `workflows`, `sante` |
| `core/` | Socle technique : configuration (`config`), base de données, sécurité (JWT, rôles, clé IoT), sessions, 2FA (`mfa`), chiffrement, sauvegardes, notifications, journaux techniques (`journaux`) |
| `models/` | Tables SQLAlchemy, toutes enregistrées dans `models/__init__.py` |
| `schemas/` | Validation des données reçues et envoyées (Pydantic) |
| `ml/` | Détection d'anomalies (Isolation Forest par capteur) |
| `copilote/` | Agent IA : appel du modèle de langage, outils, recherche hybride (BM25 + vecteurs) |
| `idp/` | Traitement intelligent des documents : lecture multiformat, extraction, contrôles de cohérence |
| `saisie/` | Assistance à la saisie : autocomplétion, propositions, reformulation |
| `workflows/` | Règles « QUAND… ALORS… » : catalogue, détection des événements, actions, moteur |

Règle de dépendance visée : `api` utilise les modules métier (`copilote`, `idp`, `saisie`, `workflows`, `ml`), qui utilisent `models` et `core`, sans jamais importer `api`. Exception restant à corriger : trois outils du copilote (`copilote/outils.py`) appellent directement les fonctions des routes `rapport` et `alert` ; le calcul de ces rapports doit être déplacé dans un module métier.

## 3. Sécurité

* Toutes les routes exigent une connexion, sauf celles qui servent à se connecter ; un test automatisé le vérifie pour chaque route.
* Rôles : `admin`, `superviseur`, `technicien` (dépendance `exiger_roles`).
* Appareils IoT : clé `X-API-Key`.
* Mots de passe hachés (bcrypt), double authentification TOTP avec codes de secours, secrets 2FA et sauvegardes chiffrés.
* Blocage après 5 échecs de connexion, limitation des requêtes, en-têtes de sécurité HTTP, CORS restreint.
* Les secrets sont uniquement dans `backend/.env` (modèle : `.env.example`), jamais dans le code ni dans les archives.

## 4. Démarrage

Double-clic sur `demarrer.bat` à la racine du projet. Le script vérifie le `.env` et MySQL, libère les ports 8001 et 3000 si un ancien processus les bloque, lance le backend puis le frontend, et attend que l'API réponde.
Arrêt : `arreter.bat`.

Démarrage manuel :
```
cd backend
python -m uvicorn app.main:app --reload --port 8001
cd frontend
npm start
```

## 5. Qualité

| Commande (dossier `backend`) | Rôle |
|---|---|
| `python -m pip install -r requirements-dev.txt` | Installe les outils de tests et d'analyse (une seule fois) |
| `python -m pytest` | Lance les tests automatisés sur une base SQLite temporaire (la vraie base n'est jamais touchée) |
| `python -m pytest --cov=app` | Idem, avec la couverture du code |
| `python audit_qualite.py` | Audit complet : analyse du code Python et React, complexité, failles des bibliothèques, secrets, tests ; rapport HTML dans `evaluations/` |

Santé en production : `GET /api/v1/sante` (administrateur ou superviseur) contrôle la base, le moteur des workflows, les sauvegardes, le modèle de langage, Telegram, les modèles IA et l'espace disque.
Les erreurs imprévues sont enregistrées dans `backend/logs/smartmaint.log` ; l'utilisateur reçoit un message générique sans détail technique.

## 6. Conventions

* Code et messages en français, identifiants explicites.
* Une erreur relancée garde sa cause (`raise … from e`).
* Une erreur ignorée volontairement est tracée dans le journal technique, jamais passée sous silence.
* Toute nouvelle route : dépendance de sécurité obligatoire, et test dans `backend/tests/`.
* Avant chaque livraison : `python -m pytest`, puis `python audit_qualite.py`, puis `python preparer_livraison.py`.
