from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user, verifier_cle_iot, exiger_roles
from app.core.notifications import notifier_alerte
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.schemas.sensor import SensorCreate, SensorUpdate, SensorResponse, SensorDataCreate, SensorDataResponse
from app.ml import anomalies

router = APIRouter(prefix="/capteurs", tags=["Capteurs"])


@router.get("/", response_model=List[SensorResponse], dependencies=[Depends(get_current_user)])
def get_capteurs(db: Session = Depends(get_db)):
    return db.query(Sensor).all()


@router.get("/{id}", response_model=SensorResponse, dependencies=[Depends(get_current_user)])
def get_capteur(id: int, db: Session = Depends(get_db)):
    sensor = db.query(Sensor).filter(Sensor.id == id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Capteur non trouvé")
    return sensor


@router.get("/{id}/data", response_model=List[SensorDataResponse], dependencies=[Depends(get_current_user)])
def get_sensor_data(id: int, db: Session = Depends(get_db)):
    return db.query(SensorData).filter(SensorData.capteur_id == id).order_by(SensorData.timestamp.desc()).limit(20).all()


@router.post("/", response_model=SensorResponse, dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def create_capteur(sensor: SensorCreate, db: Session = Depends(get_db)):
    new_sensor = Sensor(**sensor.model_dump())
    db.add(new_sensor)
    db.commit()
    db.refresh(new_sensor)
    return new_sensor


@router.put("/{id}", response_model=SensorResponse, dependencies=[Depends(exiger_roles("admin", "superviseur"))])
def update_capteur(id: int, sensor: SensorUpdate, db: Session = Depends(get_db)):
    existing = db.query(Sensor).filter(Sensor.id == id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Capteur non trouvé")
    # Seuls les champs réellement envoyés sont modifiés (les seuils ne sont pas effacés par erreur)
    for key, value in sensor.model_dump(exclude_unset=True).items():
        setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/{id}", dependencies=[Depends(exiger_roles("admin"))])
def delete_capteur(id: int, db: Session = Depends(get_db)):
    sensor = db.query(Sensor).filter(Sensor.id == id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Capteur non trouvé")

    nb_mesures = db.query(SensorData).filter(SensorData.capteur_id == id).count()
    if nb_mesures > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer : ce capteur a {nb_mesures} mesures enregistrées. Désactivez-le plutôt."
        )

    db.delete(sensor)
    db.commit()
    return {"message": "Capteur supprimé avec succès"}


def detecter_anomalie_ia(db: Session, capteur_id: int, mesure_id: int, background_tasks: BackgroundTasks):
    """Calcule le score IA de la mesure reçue et crée une alerte si elle est exceptionnelle."""
    resultat = anomalies.score_mesure(db, capteur_id, mesure_id)
    if resultat is None:
        return
    score, valeur = resultat
    if score < anomalies.SEUIL_ALERTE_IA:
        return

    capteur = db.query(Sensor).filter(Sensor.id == capteur_id).first()
    if not capteur or not capteur.actif or not capteur.equipement_id:
        return

    # Anti-doublon : une seule alerte IA par équipement et par type toutes les 5 minutes
    type_alerte = f"Anomalie IA {capteur.type}"
    cinq_min = datetime.now() - timedelta(minutes=5)          # calcul en Python : fonctionne avec toute base de données
    if db.query(Alert).filter(
        Alert.equipement_id == capteur.equipement_id,
        Alert.type == type_alerte,
        Alert.created_at >= cinq_min
    ).first():
        return

    severite = "critique" if score >= anomalies.SEUIL_CRITIQUE_IA else "haute"
    message = f"Score IA : {score:.1f} % ({valeur:.2f} {capteur.unite})"
    db.add(Alert(equipement_id=capteur.equipement_id, type=type_alerte, severite=severite, message=message,
                 created_at=datetime.now()))
    db.commit()
    print(f"🧠 {type_alerte} détectée : {message}")

    # Seules les alertes IA critiques sont envoyées sur Telegram (pour éviter le spam)
    if severite == "critique":
        equipement = db.query(Equipment).filter(Equipment.id == capteur.equipement_id).first()
        nom = equipement.nom if equipement else f"Équipement {capteur.equipement_id}"
        background_tasks.add_task(notifier_alerte, nom, severite, type_alerte, message)


def calculer_severite_seuil(ecart: float, plage: float) -> str:
    """Sévérité selon l'écart au seuil, en % de la plage normale du capteur.
    Un dépassement de seuil n'est jamais « faible » : moyenne, haute ou critique."""
    ratio = ecart / plage * 100 if plage > 0 else 100
    if ratio < 10:
        return "moyenne"
    if ratio < 25:
        return "haute"
    return "critique"


def verifier_seuils(db: Session, capteur_id: int, valeur: float, background_tasks: BackgroundTasks):
    """Compare la mesure reçue aux seuils du capteur et crée une alerte si une limite est dépassée."""
    capteur = db.query(Sensor).filter(Sensor.id == capteur_id).first()
    if not capteur or not capteur.actif or not capteur.equipement_id:
        return

    # Dépassement au-dessus du max, ou chute sous le min
    if capteur.seuil_max is not None and valeur > capteur.seuil_max:
        seuil, ecart, sens = capteur.seuil_max, valeur - capteur.seuil_max, "au-dessus du seuil max"
    elif capteur.seuil_min is not None and valeur < capteur.seuil_min:
        seuil, ecart, sens = capteur.seuil_min, capteur.seuil_min - valeur, "sous le seuil min"
    else:
        return  # valeur normale (ou aucun seuil configuré)

    # Plage normale du capteur (sert à mesurer la gravité du dépassement)
    if capteur.seuil_min is not None and capteur.seuil_max is not None:
        plage = abs(capteur.seuil_max - capteur.seuil_min)
    else:
        plage = abs(seuil)  # un seul seuil configuré : l'écart est comparé au seuil lui-même

    # Anti-doublon : une seule alerte de seuil par équipement et par type toutes les 5 minutes
    type_alerte = f"Dépassement seuil {capteur.type}"
    cinq_min = datetime.now() - timedelta(minutes=5)          # calcul en Python : fonctionne avec toute base de données
    if db.query(Alert).filter(
        Alert.equipement_id == capteur.equipement_id,
        Alert.type == type_alerte,
        Alert.created_at >= cinq_min
    ).first():
        return

    severite = calculer_severite_seuil(ecart, plage)
    message = f"{valeur:.2f} {capteur.unite} {sens} ({seuil:g} {capteur.unite})"
    db.add(Alert(equipement_id=capteur.equipement_id, type=type_alerte, severite=severite, message=message,
                 created_at=datetime.now()))
    db.commit()
    print(f"📏 Alerte {severite} - {type_alerte} : {message}")

    # Un dépassement de seuil est une limite de sécurité : Telegram pour « haute » et « critique »
    if severite in ("haute", "critique"):
        equipement = db.query(Equipment).filter(Equipment.id == capteur.equipement_id).first()
        nom = equipement.nom if equipement else f"Équipement {capteur.equipement_id}"
        background_tasks.add_task(notifier_alerte, nom, severite, type_alerte, message)


# Route réservée aux appareils IoT : la clé secrète X-API-Key est obligatoire
@router.post("/data", response_model=SensorDataResponse, dependencies=[Depends(verifier_cle_iot)])
def add_sensor_data(data: SensorDataCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    new_data = SensorData(**data.model_dump())
    db.add(new_data)
    db.commit()
    db.refresh(new_data)

    # Vérification des seuils configurés en base (une erreur ne bloque jamais l'enregistrement)
    try:
        verifier_seuils(db, new_data.capteur_id, new_data.valeur, background_tasks)
    except Exception as e:
        print("Erreur seuils :", e)

    # Détection IA en temps réel sur CETTE mesure (une erreur de l'IA ne bloque jamais l'enregistrement)
    try:
        detecter_anomalie_ia(db, new_data.capteur_id, new_data.id, background_tasks)
    except Exception as e:
        print("Erreur IA :", e)

    return new_data
