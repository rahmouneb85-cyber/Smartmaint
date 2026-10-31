import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine, Base
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from app import models

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Vérifier si déjà peuplé
if db.query(Equipment).count() > 0:
    print("Base déjà peuplée.")
    db.close()
    exit()

# Équipements
pompe = Equipment(id=1, nom="Pompe P01", type="Pompe", localisation="Atelier A")
moteur = Equipment(id=2, nom="Moteur M01", type="Moteur", localisation="Atelier B")
db.add_all([pompe, moteur])
db.commit()

# Capteurs (IDs identiques au simulateur)
capteurs = [
    Sensor(id=2, equipement_id=1, type="temperature", unite="°C"),
    Sensor(id=3, equipement_id=1, type="pression", unite="bar"),
    Sensor(id=4, equipement_id=1, type="vibration", unite="mm/s"),
    Sensor(id=5, equipement_id=2, type="temperature", unite="°C"),
    Sensor(id=6, equipement_id=2, type="courant", unite="A"),
]
db.add_all(capteurs)
db.commit()
db.close()

print("✅ Base peuplée avec succès.")
