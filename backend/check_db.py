import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData

db = SessionLocal()

print("=== EQUIPEMENTS ===")
for e in db.query(Equipment).all():
    print(f"  id={e.id}, nom={e.nom}")

print("\n=== CAPTEURS ===")
for c in db.query(Sensor).all():
    print(f"  id={c.id}, equipement_id={c.equipement_id}, type={c.type}")

print("\n=== TEST INSERTION donnees_capteurs ===")
try:
    d = SensorData(capteur_id=2, valeur=42.0)
    db.add(d)
    db.commit()
    print("  ✅ Insertion réussie")
except Exception as e:
    db.rollback()
    print(f"  ❌ Erreur: {e}")

db.close()
