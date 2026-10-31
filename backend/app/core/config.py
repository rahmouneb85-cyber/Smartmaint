from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15   # jeton d'accès court : renouvelé automatiquement
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"
    ASSISTANT_PROVIDER: str = "ollama"     # "ollama" (hors ligne) ou "gemini" (en ligne)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    IOT_API_KEY: str = ""   # clé secrète des appareils IoT (simulateur, capteurs)

    # ── Sécurité ──
    ENVIRONNEMENT: str = "developpement"   # "production" masque la documentation Swagger
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"   # sites autorisés à appeler l'API
    MAX_TENTATIVES_COMPTE: int = 5         # échecs autorisés par compte avant blocage
    MAX_TENTATIVES_IP: int = 20            # échecs autorisés par adresse IP avant blocage
    DUREE_BLOCAGE_MINUTES: int = 15
    LIMITE_REQUETES_AUTH: int = 30         # requêtes /auth par minute et par adresse IP

    # ── Sessions et appareils ──
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7     # durée maximale d'une session
    INACTIVITE_MAX_MINUTES: int = 120      # session fermée après 2 h sans activité
    MAX_SESSIONS_PAR_UTILISATEUR: int = 5  # au-delà, les plus anciennes sont fermées
    COOKIE_REFRESH: str = "smartmaint_refresh"

    # ── Double authentification et chiffrement ──
    CLE_CHIFFREMENT: str = ""              # facultatif : clé dédiée au chiffrement (sinon dérivée de SECRET_KEY)
    MFA_EMETTEUR: str = "SmartMaint"       # nom affiché dans l'application d'authentification

    # ── Sauvegardes de la base de données ──
    DOSSIER_SAUVEGARDES: str = "sauvegardes"
    MYSQLDUMP_CHEMIN: str = r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
    MYSQL_CHEMIN: str = r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
    SAUVEGARDE_AUTO_HEURES: int = 24       # 0 désactive la sauvegarde automatique
    SAUVEGARDES_A_GARDER: int = 14

    # ── Copilote IA ──
    COPILOTE_FOURNISSEUR: str = "auto"              # auto (Gemini si clé, sinon local) | ollama | gemini
    COPILOTE_MODELE_LOCAL: str = "qwen2.5:7b"       # modèle open source local capable d'appeler des outils
    COPILOTE_MODELE_EMBEDDINGS: str = "nomic-embed-text"
    COPILOTE_DELAI_LOCAL: int = 300                 # secondes (le modèle local tourne sur le processeur)
    COPILOTE_MAX_ETAPES: int = 6

    # ── Traitement intelligent des documents (IDP) ──
    IDP_MODELE_VISION_LOCAL: str = "gemma3:4b"     # modèle local open source capable de lire les images
    IDP_TAILLE_MAX_MO: int = 15
    IDP_DOSSIER: str = "documents_idp"            # fichiers déposés (exclus de l'archive de livraison)

    # ── Support ──
    SUPPORT_DOSSIER: str = "captures_support"     # captures d'écran des demandes (exclues de l'archive de livraison)
    SUPPORT_TAILLE_MAX_MO: int = 5

    # ── Room Live (audio, vidéo et chat en temps réel) ──
    ROOM_MAX_PARTICIPANTS: int = 6                 # connexions directes entre navigateurs (maillage) : 6 au maximum
    ROOM_ICE_SERVERS: str = ""                     # JSON, ex. [{"urls": "stun:stun.exemple.com:3478"}] ; vide = réseau local seulement
    ROOM_DOSSIER: str = "fichiers_rooms"           # fichiers partagés dans les salles (exclus de l'archive de livraison)
    ROOM_FICHIER_MAX_MO: int = 15

    # ── Boutons flottants des pages publiques ──
    WHATSAPP_ENTREPRISE: str = ""                  # numéro international (ex. +212600000000) ; vide = bouton masqué
    ASSISTANT_PUBLIC: bool = True                  # assistant limité aux informations générales, sans données

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

if len(settings.SECRET_KEY) < 32:
    print("⚠️  SECRET_KEY trop courte : utilisez au moins 32 caractères aléatoires dans le fichier .env")
