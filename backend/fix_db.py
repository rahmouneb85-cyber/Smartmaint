import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.equipment import Equipment
from app.models.sensor import Sensor

db = SessionLocal()

# Ajouter Moteur M01 si absent
if not db.query(Equipment).filter(Equipment.id == 2).first():
    db.add(Equipment(id=2, nom="Moteur M01", type="Moteur", localisation="Atelier B"))
    db.commit()
    print("✅ Moteur M01 ajouté")

# Capteurs manquants
manquants = [
    (5, 2, "temperature", "°C"),
    (6, 2, "courant", "A"),
]
for cid, eid, ctype, unite in manquants:
    if not db.query(Sensor).filter(Sensor.id == cid).first():
        db.add(Sensor(id=cid, equipement_id=eid, type=ctype, unite=unite))
        print(f"✅ Capteur id={cid} ajouté")

db.commit()
db.close()
print("Done.")
