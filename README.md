# SmartMaint

**Plateforme de supervision industrielle IoT et de maintenance assistée par l'intelligence artificielle.**

SmartMaint surveille des équipements industriels grâce à des capteurs connectés, détecte les anomalies avec des modèles d'IA, alerte les équipes et accompagne toute la maintenance : interventions, rapports, documents, assistant intelligent et réunions en direct.

Projet réalisé par **Bouchra Rahmoune** dans le cadre de son stage chez **BENJEDDOU Technologie Services**.

---

## Fonctionnalités

| Domaine | Ce que propose SmartMaint |
|---|---|
| **Supervision IoT** | Réception des mesures des capteurs (température, vibration, pression…), tableau de bord en temps réel, simulateur IoT fourni |
| **Détection d'anomalies** | Modèle Isolation Forest entraîné pour chaque capteur, alertes classées par niveau |
| **Alertes** | Notifications dans l'application et sur Telegram |
| **Maintenance** | Équipements, fiches détaillées, interventions, bons d'intervention, indicateurs (MTBF, MTTR, disponibilité) |
| **Rapports** | Rapports d'incident et de maintenance, exports CSV, Word et PDF |
| **Copilote IA** | Assistant conversationnel qui interroge les données de l'usine (Gemini en ligne ou Ollama en local) |
| **Documents intelligents** | Lecture de PDF, Word, Excel, PowerPoint et images, extraction des informations et contrôle de cohérence |
| **Saisie intelligente** | Autocomplétion, propositions et reformulation pendant la saisie |
| **Workflows** | Règles automatiques « QUAND… ALORS… » (créer une intervention, prévenir une équipe…) |
| **Room Live** | Réunions audio et vidéo en direct (WebRTC), chat instantané, partage d'écran et de fichiers, rôles et modération |
| **Messagerie et support** | Messagerie interne selon les rôles, demandes de support avec capture d'écran |
| **Personnalisation** | Boutons flottants réglables par l'administration et par chaque utilisateur, recherche intelligente (Ctrl+K) |
| **Multilingue** | Français, anglais et arabe (affichage de droite à gauche) |

## Sécurité

- Connexion par jeton JWT à durée courte, sessions révocables, double authentification (TOTP) avec codes de secours
- Trois rôles : administrateur, superviseur, technicien ; chaque route vérifie les droits
- Mots de passe hachés (bcrypt), secrets et sauvegardes chiffrés
- Blocage après plusieurs échecs de connexion, limitation des requêtes, en-têtes de sécurité HTTP
- Clé dédiée pour les appareils IoT
- Fichiers envoyés contrôlés sur leur contenu réel, jamais exécutés par le serveur
- **Aucun secret dans ce dépôt** : toutes les clés sont dans le fichier `backend/.env`, exclu du dépôt

## Technologies

| Partie | Technologies |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, Pydantic, WebSocket |
| Base de données | MySQL |
| Frontend | React, react-i18next, Recharts, Material Icons |
| Temps réel | WebSocket (chat, présence, signalisation), WebRTC (audio, vidéo, écran) |
| IA | scikit-learn (Isolation Forest), Gemini ou Ollama, recherche hybride BM25 et vecteurs |
| IoT | Simulateur Python, MQTT |
| Qualité | pytest (plus de 300 tests automatisés), Ruff, audit d'accessibilité axe |

## Organisation du dépôt

```
smartMaint/
├── backend/          API FastAPI, modèles IA, tests automatisés
│   ├── app/          code de l'application (api, core, models, copilote, idp, workflows…)
│   └── tests/        tests automatisés (pytest)
├── frontend/         interface React
│   └── src/          pages et composants, traductions dans src/i18n
├── iot_simulator/    simulateur de capteurs
├── demarrer.bat      démarrage de SmartMaint sous Windows
└── ARCHITECTURE.md   architecture et guide technique détaillé
```

## Installation

### Prérequis

- Python 3.12 ou plus récent
- Node.js 20 ou plus récent
- MySQL 8

### 1. Backend

```bash
cd backend
python -m pip install -r requirements.txt
```

Copier `backend/.env.example` en `backend/.env`, puis renseigner au minimum :

- `DATABASE_URL` : adresse de la base MySQL
- `SECRET_KEY` : au moins 32 caractères aléatoires

Les autres réglages (Telegram, Gemini, clé IoT…) sont facultatifs et décrits dans `.env.example`.

### 2. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
```

### 3. Démarrage

Sous Windows, lancer `demarrer.bat`. Sinon :

```bash
cd backend
python -m uvicorn app.main:app --port 8001
```

```bash
cd frontend
npm start
```

L'application est disponible sur http://localhost:3000, et la documentation de l'API sur http://localhost:8001/docs.

### 4. Tests

```bash
cd backend
python -m pytest
```

## Documentation

Le fichier [ARCHITECTURE.md](ARCHITECTURE.md) décrit l'architecture, l'organisation du code, la sécurité et le fonctionnement de chaque module.

---

© 2026 Bouchra Rahmoune, BENJEDDOU Technologie Services.
