"""
Module IA de maintenance prédictive : détection d'anomalies par Isolation Forest.

Un modèle est entraîné pour chaque capteur actif, sur son historique de mesures.
Chaque mesure reçoit un score d'anomalie de 0 à 100 % : c'est la proportion des
mesures d'entraînement qui paraissent PLUS normales qu'elle.
"""
import os
from datetime import datetime

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session

from app.models.sensor import Sensor
from app.models.sensor_data import SensorData

# Dossier où sont enregistrés les modèles entraînés (backend/modeles_ia)
DOSSIER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "modeles_ia")

FENETRE = 5              # nombre de mesures utilisées pour la moyenne et l'écart-type glissants
NB_ENTRAINEMENT = 5000   # nombre de mesures récentes utilisées pour l'entraînement
MIN_MESURES = 200        # minimum de mesures pour entraîner un modèle fiable
SEUIL_SUSPECT = 95       # score à partir duquel une mesure est « suspecte »
SEUIL_ANOMALIE = 99      # score à partir duquel une mesure est une « anomalie »


def caracteristiques(valeurs):
    """Transforme une suite de mesures en 4 caractéristiques par mesure :
    la valeur, sa variation par rapport à la mesure précédente,
    son écart à la moyenne glissante, et l'écart-type glissant."""
    v = np.asarray(valeurs, dtype=float)
    delta = np.diff(v, prepend=v[0])
    moyenne = np.array([v[max(0, i - FENETRE + 1):i + 1].mean() for i in range(len(v))])
    ecart_type = np.array([v[max(0, i - FENETRE + 1):i + 1].std() for i in range(len(v))])
    return np.column_stack([v, delta, v - moyenne, ecart_type])


def charger_valeurs(db: Session, capteur_id: int, limite: int):
    """Renvoie les dernières mesures d'un capteur, de la plus ancienne à la plus récente."""
    lignes = (db.query(SensorData.valeur, SensorData.timestamp)
              .filter(SensorData.capteur_id == capteur_id)
              .order_by(SensorData.timestamp.desc())
              .limit(limite).all())
    lignes = list(reversed(lignes))
    return [ligne[0] for ligne in lignes], [ligne[1] for ligne in lignes]


def chemin_modele(capteur_id: int) -> str:
    return os.path.join(DOSSIER, f"capteur_{capteur_id}.joblib")


def etat(score: float) -> str:
    if score >= SEUIL_ANOMALIE:
        return "anomalie"
    if score >= SEUIL_SUSPECT:
        return "suspect"
    return "normal"


def entrainer(db: Session):
    """Entraîne un modèle Isolation Forest pour chaque capteur actif."""
    os.makedirs(DOSSIER, exist_ok=True)
    resultats = []
    for capteur in db.query(Sensor).filter(Sensor.actif == True).all():
        valeurs, _ = charger_valeurs(db, capteur.id, NB_ENTRAINEMENT)
        if len(valeurs) < MIN_MESURES:
            resultats.append({"capteur_id": capteur.id, "entraine": False, "mesures": len(valeurs)})
            continue

        X = caracteristiques(valeurs)
        modele = IsolationForest(n_estimators=150, contamination=0.02, random_state=42)
        modele.fit(X)

        # Scores d'anomalie des mesures d'entraînement (plus c'est haut, plus c'est anormal)
        scores = np.sort(-modele.score_samples(X))

        joblib.dump({
            "modele": modele,
            "scores": scores,
            "mesures": len(valeurs),
            "date": datetime.now().isoformat(timespec="seconds"),
            "moyenne": float(np.mean(valeurs)),
            "ecart_type": float(np.std(valeurs)),
        }, chemin_modele(capteur.id))

        resultats.append({"capteur_id": capteur.id, "entraine": True, "mesures": len(valeurs)})
    return resultats


def analyser_capteur(db: Session, capteur: Sensor, nb_points: int = 50):
    """Calcule le score d'anomalie des dernières mesures d'un capteur."""
    chemin = chemin_modele(capteur.id)
    base = {"capteur_id": capteur.id, "type": capteur.type, "unite": capteur.unite,
            "equipement_id": capteur.equipement_id}
    if not os.path.exists(chemin):
        return {**base, "entraine": False}

    donnees = joblib.load(chemin)
    # On charge quelques mesures en plus pour calculer correctement la fenêtre glissante
    valeurs, dates = charger_valeurs(db, capteur.id, nb_points + FENETRE)
    if not valeurs:
        return {**base, "entraine": True, "serie": []}

    X = caracteristiques(valeurs)
    bruts = -donnees["modele"].score_samples(X)
    # Score en % : position de la mesure parmi les scores d'entraînement
    pourcents = np.searchsorted(donnees["scores"], bruts) / len(donnees["scores"]) * 100

    serie = [
        {"valeur": round(float(v), 2), "date": d.isoformat() if d else None,
         "score": round(float(s), 1), "etat": etat(s)}
        for v, d, s in zip(valeurs, dates, pourcents, strict=True)
    ][-nb_points:]

    derniere = serie[-1]
    return {
        **base,
        "entraine": True,
        "date_entrainement": donnees["date"],
        "mesures_entrainement": donnees["mesures"],
        "moyenne_normale": round(donnees["moyenne"], 2),
        "derniere_valeur": derniere["valeur"],
        "score": derniere["score"],
        "etat": derniere["etat"],
        "anomalies_recentes": sum(1 for p in serie if p["etat"] == "anomalie"),
        "suspects_recents": sum(1 for p in serie if p["etat"] == "suspect"),
        "serie": serie,
    }


def analyser(db: Session, nb_points: int = 50):
    """Analyse tous les capteurs actifs."""
    return [analyser_capteur(db, c, nb_points)
            for c in db.query(Sensor).filter(Sensor.actif == True).all()]


# ---------------------------------------------------------------------------
# Évaluation en temps réel de chaque nouvelle mesure
# ---------------------------------------------------------------------------

SEUIL_ALERTE_IA = 99.8      # score à partir duquel une alerte « Anomalie IA » est créée
SEUIL_CRITIQUE_IA = 99.95   # score à partir duquel cette alerte est critique

_cache = {}  # modèles gardés en mémoire : {capteur_id: (date du fichier, données du modèle)}


def charger_modele(capteur_id: int):
    """Charge un modèle depuis le disque, ou depuis la mémoire s'il n'a pas changé."""
    chemin = chemin_modele(capteur_id)
    if not os.path.exists(chemin):
        return None
    date_fichier = os.path.getmtime(chemin)
    if capteur_id not in _cache or _cache[capteur_id][0] != date_fichier:
        _cache[capteur_id] = (date_fichier, joblib.load(chemin))
    return _cache[capteur_id][1]


def score_mesure(db: Session, capteur_id: int, mesure_id: int):
    """Renvoie (score en %, valeur) d'une mesure précise, calculé avec les mesures qui la précèdent."""
    donnees = charger_modele(capteur_id)
    if donnees is None:
        return None
    lignes = (db.query(SensorData.valeur)
              .filter(SensorData.capteur_id == capteur_id, SensorData.id <= mesure_id)
              .order_by(SensorData.id.desc())
              .limit(FENETRE + 1).all())
    valeurs = [ligne[0] for ligne in reversed(lignes)]
    if len(valeurs) < 2:
        return None
    X = caracteristiques(valeurs)
    brut = -donnees["modele"].score_samples(X[-1:])
    score = float(np.searchsorted(donnees["scores"], brut)[0] / len(donnees["scores"]) * 100)
    return score, float(valeurs[-1])
