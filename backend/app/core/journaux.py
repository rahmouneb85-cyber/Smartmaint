"""Journaux techniques de SmartMaint.

Les erreurs et événements techniques sont écrits dans backend/logs/smartmaint.log (fichiers tournants :
5 fichiers de 2 Mo au maximum) et affichés dans le terminal. À ne pas confondre avec le journal de sécurité
(table journal_securite), qui trace les connexions et les actions des utilisateurs.

Utilisation dans un module :
    from app.core.journaux import journal
    journal.warning("Message")            # ou journal.exception("…") dans un bloc except
"""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

DOSSIER = Path(__file__).resolve().parents[2] / "logs"
FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

journal = logging.getLogger("smartmaint")


def configurer(niveau: str = "INFO", fichier: bool = True) -> None:
    """Configure les journaux une seule fois (appelé au démarrage de l'application)."""
    if journal.handlers:
        return
    journal.setLevel(niveau)
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    journal.addHandler(console)
    if fichier:
        try:
            DOSSIER.mkdir(exist_ok=True)
            f = RotatingFileHandler(DOSSIER / "smartmaint.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
            f.setFormatter(logging.Formatter(FORMAT))
            journal.addHandler(f)
        except OSError as e:                     # dossier en lecture seule : on garde au moins la console
            journal.warning("Journal fichier indisponible : %s", e)
    journal.propagate = False
