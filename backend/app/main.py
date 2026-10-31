import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.journaux import configurer as configurer_journaux, journal
from app.core.database import engine, Base
from app import models  # noqa: F401  (enregistre toutes les tables avant create_all)
from app.api import router
from app.core.sauvegarde import demarrer_sauvegarde_automatique

configurer_journaux(fichier=settings.ENVIRONNEMENT != "test")
Base.metadata.create_all(bind=engine)   # crée les tables manquantes (journal, sessions, appareils)


def migrer_colonnes():
    """Ajoute les nouvelles colonnes aux tables existantes (create_all ne modifie pas une table déjà créée)."""
    nouvelles = {
        "utilisateurs": {
            "totp_secret": "VARCHAR(255) NULL",
            "totp_actif": "BOOLEAN NOT NULL DEFAULT 0",
            "totp_dernier_pas": "BIGINT NULL",
            "codes_secours": "TEXT NULL",
            "telephone": "VARCHAR(20) NULL",
            "telephone_visible": "BOOLEAN NOT NULL DEFAULT 0",
        },
    }
    inspecteur = inspect(engine)
    with engine.begin() as cx:
        for table, colonnes in nouvelles.items():
            existantes = {c["name"] for c in inspecteur.get_columns(table)}
            for nom, definition in colonnes.items():
                if nom not in existantes:
                    cx.execute(text(f"ALTER TABLE {table} ADD COLUMN {nom} {definition}"))
                    print(f"🛠️  Colonne ajoutée : {table}.{nom}")


migrer_colonnes()
demarrer_sauvegarde_automatique()

production = settings.ENVIRONNEMENT == "production"

app = FastAPI(
    title="SmartMaint API",
    description="Plateforme intelligente de supervision et maintenance des équipements industriels",
    version="1.4.0",
    # en production, la documentation Swagger n'est plus publique
    docs_url=None if production else "/docs",
    redoc_url=None if production else "/redoc",
    openapi_url=None if production else "/openapi.json",
)

# ── CORS : seuls les sites listés dans CORS_ORIGINS peuvent appeler l'API ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,    # nécessaire pour le cookie HttpOnly du jeton de renouvellement
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Device-Id"],
)

# ── Limitation des requêtes sur /auth (en mémoire, par adresse IP) ──
_requetes_auth = defaultdict(deque)


@app.middleware("http")
async def limiter_requetes_auth(request: Request, call_next):
    if request.url.path.startswith("/api/v1/auth/") and request.method != "OPTIONS":
        ip = request.client.host if request.client else "inconnue"
        maintenant = time.monotonic()
        file = _requetes_auth[ip]
        while file and maintenant - file[0] > 60:
            file.popleft()
        if len(file) >= settings.LIMITE_REQUETES_AUTH:
            return JSONResponse(status_code=429, headers={"Retry-After": "60"},
                                content={"detail": "Trop de requêtes. Réessayez dans une minute."})
        file.append(maintenant)
    return await call_next(request)


# ── En-têtes de sécurité HTTP ajoutés à chaque réponse ──
@app.middleware("http")
async def entetes_securite(request: Request, call_next):
    reponse = await call_next(request)
    reponse.headers["X-Content-Type-Options"] = "nosniff"          # pas d'interprétation du type de fichier
    reponse.headers["X-Frame-Options"] = "DENY"                    # anti clickjacking
    reponse.headers["Referrer-Policy"] = "no-referrer"
    reponse.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    reponse.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        # l'API ne renvoie que du JSON : aucun script, style ou cadre n'est autorisé
        reponse.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if production:
        reponse.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return reponse


# ── Erreur imprévue : tracée dans logs/smartmaint.log, sans détail technique renvoyé au navigateur ──
@app.exception_handler(Exception)
async def erreur_inattendue(request: Request, exc: Exception):
    journal.error("Erreur inattendue sur %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du serveur. Elle a été enregistrée dans le journal."})


app.include_router(router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Bienvenue sur SmartMaint API", "version": "1.4.0", "status": "running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
