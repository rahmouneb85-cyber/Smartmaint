"""Prépare les fichiers à envoyer à l'entreprise, dans le dossier smartMaint/livraison :
  • SmartMaint_code_AAAAMMJJ.zip : tout le code, SANS les secrets ni les fichiers inutiles ;
  • smartmaint_AAAAMMJJ.sql      : export complet de la base MySQL.
Utilisation (depuis le dossier backend) : python preparer_livraison.py
"""
import os
import subprocess
import zipfile
from datetime import date
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import settings

RACINE = Path(__file__).resolve().parent.parent          # dossier smartMaint
SORTIE = RACINE / "livraison"
JOUR = date.today().strftime("%Y%m%d")

# Dossiers et fichiers exclus du zip
DOSSIERS_EXCLUS = {"node_modules", "__pycache__", ".git", "sauvegardes", "livraison", "build", ".venv", "venv",
                   "app_avant_securite", "app_avant_phase2", "app_avant_phase3", "app_avant_qualite", ".idea", ".vscode", "documents_idp", "captures_support", "fichiers_rooms", "evaluations", "logs", ".pytest_cache", "htmlcov"}
FICHIERS_EXCLUS = {".env"}
EXTENSIONS_EXCLUES = {".bak", ".pyc", ".log", ".zip", ".sql", ".enc", ".coverage"}


def a_exclure(chemin: Path) -> bool:
    if any(p in DOSSIERS_EXCLUS or p.startswith("app_avant") for p in chemin.relative_to(RACINE).parts[:-1]):
        return True
    nom = chemin.name
    return (nom in FICHIERS_EXCLUS or nom.startswith(".env.") and nom != ".env.example"
            or chemin.suffix in EXTENSIONS_EXCLUES or nom.endswith(".bak"))


SORTIE.mkdir(exist_ok=True)

# 1. Zip du code
archive = SORTIE / f"SmartMaint_code_{JOUR}.zip"
nb, exclus = 0, 0
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for dossier, sous_dossiers, fichiers in os.walk(RACINE):
        sous_dossiers[:] = [d for d in sous_dossiers if d not in DOSSIERS_EXCLUS and not d.startswith("app_avant")]
        for f in fichiers:
            chemin = Path(dossier) / f
            if a_exclure(chemin):
                exclus += 1
                continue
            z.write(chemin, Path("SmartMaint") / chemin.relative_to(RACINE))
            nb += 1
with zipfile.ZipFile(archive) as z:
    assert not any(Path(n).name == ".env" for n in z.namelist()), "Le .env ne doit pas être dans le zip !"
print(f"✅ Code : {archive.name} ({nb} fichiers, {round(archive.stat().st_size / 1048576, 1)} Mo) — {exclus} fichier(s) exclu(s), dont le .env")

# 2. Export SQL de la base
url = make_url(settings.DATABASE_URL)
mysqldump = settings.MYSQLDUMP_CHEMIN if Path(settings.MYSQLDUMP_CHEMIN).exists() else "mysqldump"
env = dict(os.environ, MYSQL_PWD=url.password or "")
fichier_sql = SORTIE / f"smartmaint_{JOUR}.sql"
try:
    with open(fichier_sql, "wb") as sortie:
        r = subprocess.run([mysqldump, "-h", url.host or "localhost", "-P", str(url.port or 3306), "-u", url.username or "root",
                            "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4",
                            "--databases", url.database], stdout=sortie, stderr=subprocess.PIPE, env=env)
except FileNotFoundError:
    raise SystemExit("❌ mysqldump introuvable : vérifiez MYSQLDUMP_CHEMIN dans le fichier .env")
if r.returncode != 0:
    print("❌ Export SQL impossible : " + r.stderr.decode("utf-8", "replace")[:300])
else:
    print(f"✅ Base : {fichier_sql.name} ({round(fichier_sql.stat().st_size / 1048576, 1)} Mo)")
print(f"📁 Dossier : {SORTIE}")
