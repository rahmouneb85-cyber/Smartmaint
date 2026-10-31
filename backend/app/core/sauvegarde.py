"""Sauvegardes de la base MySQL : création (compressée, chiffrée, avec empreinte), rotation et test de restauration."""
import gzip
import hashlib
import json
import os
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.journaux import journal
from app.core.config import settings
from app.core.chiffrement import chiffrer, dechiffrer

DOSSIER = Path(settings.DOSSIER_SAUVEGARDES)
BASE_TEST = "smartmaint_test_restauration"
_verrou = threading.Lock()


def _connexion():
    url = make_url(settings.DATABASE_URL)
    return url, {
        "hote": url.host or "localhost", "port": str(url.port or 3306),
        "utilisateur": url.username or "root", "base": url.database,
    }


def _env_mysql(url) -> dict:
    # le mot de passe passe par une variable d'environnement, jamais par la ligne de commande
    env = dict(os.environ)
    env["MYSQL_PWD"] = url.password or ""
    return env


def _executable(chemin: str, nom: str) -> str:
    if Path(chemin).exists():
        return chemin
    return nom   # sinon on compte sur le PATH de Windows


def _manifeste(fichier: Path) -> Path:
    return fichier.with_suffix(fichier.suffix + ".json")


def lister() -> list:
    DOSSIER.mkdir(exist_ok=True)
    resultat = []
    for f in sorted(DOSSIER.glob("smartmaint_*.sql.gz.enc"), reverse=True):
        info = {"nom": f.name, "taille_ko": round(f.stat().st_size / 1024, 1)}
        m = _manifeste(f)
        if m.exists():
            info.update(json.loads(m.read_text(encoding="utf-8")))
        resultat.append(info)
    return resultat


def creer(origine: str = "manuelle") -> dict:
    """mysqldump → compression gzip → chiffrement Fernet → empreinte SHA-256 → rotation des anciennes."""
    with _verrou:
        url, c = _connexion()
        DOSSIER.mkdir(exist_ok=True)
        horodatage = datetime.now().strftime("%Y%m%d_%H%M%S")
        fichier = DOSSIER / f"smartmaint_{horodatage}.sql.gz.enc"
        debut = time.time()
        commande = [_executable(settings.MYSQLDUMP_CHEMIN, "mysqldump"), "-h", c["hote"], "-P", c["port"],
                    "-u", c["utilisateur"], "--single-transaction", "--routines", "--triggers",
                    "--default-character-set=utf8mb4", c["base"]]
        try:
            res = subprocess.run(commande, capture_output=True, env=_env_mysql(url), timeout=1800)  # noqa: S603  (liste d'arguments, sans shell)
        except FileNotFoundError:
            raise RuntimeError("mysqldump introuvable : vérifiez MYSQLDUMP_CHEMIN dans le fichier .env") from None
        if res.returncode != 0:
            raise RuntimeError("Échec de mysqldump : " + res.stderr.decode("utf-8", "replace")[:300])
        contenu = chiffrer(gzip.compress(res.stdout))
        fichier.write_bytes(contenu)
        info = {
            "date": datetime.now().isoformat(timespec="seconds"), "origine": origine,
            "taille_sql_ko": round(len(res.stdout) / 1024, 1),
            "sha256": hashlib.sha256(contenu).hexdigest(), "duree_s": round(time.time() - debut, 1),
        }
        _manifeste(fichier).write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
        _rotation()
        return {"nom": fichier.name, **info}


def _rotation():
    fichiers = sorted(DOSSIER.glob("smartmaint_*.sql.gz.enc"), reverse=True)
    for f in fichiers[settings.SAUVEGARDES_A_GARDER:]:
        f.unlink(missing_ok=True)
        _manifeste(f).unlink(missing_ok=True)


def _lire(nom: str) -> bytes:
    """Vérifie l'intégrité (empreinte) puis déchiffre et décompresse une sauvegarde."""
    fichier = DOSSIER / Path(nom).name           # Path(...).name : empêche de sortir du dossier
    if not fichier.exists():
        raise FileNotFoundError("Sauvegarde introuvable")
    contenu = fichier.read_bytes()
    m = _manifeste(fichier)
    if m.exists():
        attendu = json.loads(m.read_text(encoding="utf-8")).get("sha256")
        if attendu and hashlib.sha256(contenu).hexdigest() != attendu:
            raise RuntimeError("Empreinte incorrecte : le fichier de sauvegarde a été modifié ou est corrompu")
    return gzip.decompress(dechiffrer(contenu))


def _compter(engine) -> dict:
    with engine.connect() as cx:
        tables = [r[0] for r in cx.execute(text("SHOW TABLES"))]
        # noms de tables lus dans la base elle-même (SHOW TABLES), jamais saisis par un utilisateur
        return {t: cx.execute(text(f"SELECT COUNT(*) FROM `{t}`")).scalar() for t in tables}  # noqa: S608


def tester(nom: str) -> dict:
    """Restaure la sauvegarde dans une base temporaire, compare les tables avec la base réelle, puis supprime la base temporaire."""
    with _verrou:
        url, c = _connexion()
        sql = _lire(nom)
        mysql = _executable(settings.MYSQL_CHEMIN, "mysql")
        base_args = [mysql, "-h", c["hote"], "-P", c["port"], "-u", c["utilisateur"], "--default-character-set=utf8mb4"]
        env = _env_mysql(url)
        debut = time.time()
        def executer(args, entree=None):
            r = subprocess.run(base_args + args, input=entree, capture_output=True, env=env, timeout=1800)  # noqa: S603  (liste d'arguments, sans shell)
            if r.returncode != 0:
                raise RuntimeError(r.stderr.decode("utf-8", "replace")[:300])
        try:
            executer(["-e", f"DROP DATABASE IF EXISTS `{BASE_TEST}`; CREATE DATABASE `{BASE_TEST}` CHARACTER SET utf8mb4;"])
            executer([BASE_TEST], sql)
            reelle = _compter(create_engine(url))
            test = _compter(create_engine(url.set(database=BASE_TEST)))
        except FileNotFoundError:
            raise RuntimeError("mysql introuvable : vérifiez MYSQL_CHEMIN dans le fichier .env") from None
        finally:
            try:
                executer(["-e", f"DROP DATABASE IF EXISTS `{BASE_TEST}`;"])
            except Exception:
                journal.warning("Base temporaire %s non supprimée après le test de restauration", BASE_TEST, exc_info=True)
        manquantes = sorted(set(reelle) - set(test))
        tables = [{"table": t, "sauvegarde": test.get(t), "actuelle": reelle.get(t)} for t in sorted(reelle)]
        ok = not manquantes   # la restauration a réussi et toutes les tables de la base réelle sont présentes
        resultat = {"nom": nom, "reussi": ok, "tables_manquantes": manquantes, "tables": tables,
                    "duree_s": round(time.time() - debut, 1), "date_test": datetime.now().isoformat(timespec="seconds")}
        # le résultat du dernier test est conservé dans le manifeste
        m = _manifeste(DOSSIER / Path(nom).name)
        if m.exists():
            info = json.loads(m.read_text(encoding="utf-8"))
            info["dernier_test"] = {"date": resultat["date_test"], "reussi": ok}
            m.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
        return resultat


def demarrer_sauvegarde_automatique():
    """Tâche de fond : crée une sauvegarde si la dernière date de plus de SAUVEGARDE_AUTO_HEURES."""
    if settings.SAUVEGARDE_AUTO_HEURES <= 0:
        return

    def boucle():
        time.sleep(60)   # laisse le serveur démarrer
        while True:
            try:
                existantes = lister()
                derniere = datetime.fromisoformat(existantes[0]["date"]) if existantes and existantes[0].get("date") else None
                if not derniere or (datetime.now() - derniere).total_seconds() > settings.SAUVEGARDE_AUTO_HEURES * 3600:
                    info = creer("automatique")
                    print(f"💾 Sauvegarde automatique créée : {info['nom']}")
            except Exception as e:
                print(f"⚠️  Sauvegarde automatique impossible : {e}")
            time.sleep(3600)

    threading.Thread(target=boucle, daemon=True, name="sauvegarde-auto").start()
