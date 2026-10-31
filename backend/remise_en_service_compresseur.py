"""Remise en service du Compresseur C01 :
  1. statut « maintenance » → « actif » ;
  2. création de ses capteurs de température et de pression (s'ils n'existent pas) ;
  3. ajout du compresseur au simulateur IoT (avec sauvegarde de simulator.py).
Utilisation (depuis le dossier backend) : python remise_en_service_compresseur.py
"""
import shutil
from pathlib import Path

import app.models  # noqa: F401  (charge tous les modèles)
from app.core.database import SessionLocal
from app.models.equipment import Equipment
from app.models.sensor import Sensor

CAPTEURS = [
    {"type": "temperature", "unite": "°C", "seuil_min": 20, "seuil_max": 95,
     "simu": '"nominal": 70,  "ecart_type": 4,\n         "haute": (98, 120), "basse": (5, 15)'},
    {"type": "pression", "unite": "bar", "seuil_min": 6, "seuil_max": 10,
     "simu": '"nominal": 8,   "ecart_type": 0.4,\n         "haute": (10.8, 13), "basse": (2, 5)'},
]

db = SessionLocal()
compresseur = db.query(Equipment).filter(Equipment.nom.like("Compresseur%")).first()
if not compresseur:
    raise SystemExit("❌ Aucun équipement dont le nom commence par « Compresseur » n'a été trouvé.")

statut = getattr(compresseur.statut, "value", compresseur.statut)
if statut != "actif":
    compresseur.statut = "actif"
    print(f"✅ {compresseur.nom} : statut « {statut} » → « actif »")

ids = {}
for c in CAPTEURS:
    capteur = db.query(Sensor).filter(Sensor.equipement_id == compresseur.id, Sensor.type == c["type"]).first()
    if not capteur:
        capteur = Sensor(equipement_id=compresseur.id, type=c["type"], unite=c["unite"],
                         seuil_min=c["seuil_min"], seuil_max=c["seuil_max"], actif=True)
        db.add(capteur)
        db.flush()
        print(f"✅ Capteur {c['type']} créé (n° {capteur.id}, seuils {c['seuil_min']} à {c['seuil_max']} {c['unite']})")
    else:
        print(f"ℹ️  Capteur {c['type']} déjà présent (n° {capteur.id})")
    ids[c["type"]] = capteur.id
db.commit()

# ── Ajout au simulateur ──
racine = Path(__file__).resolve().parent.parent
candidats = [p for p in racine.rglob("simulator.py") if "node_modules" not in p.parts and ".bak" not in p.name]
if not candidats:
    print("⚠️  simulator.py introuvable : ajoutez le compresseur au simulateur à la main.")
    raise SystemExit(0)
simulateur = candidats[0]
texte = simulateur.read_text(encoding="utf-8")
if f'"nom": "{compresseur.nom}"' in texte or '"nom": "Compresseur' in texte:
    print(f"ℹ️  Le compresseur est déjà dans {simulateur}")
    raise SystemExit(0)

lignes = ",\n".join(
    f'        {{"id": {ids[c["type"]]}, "type": "{c["type"]}", "unite": "{c["unite"]}", {c["simu"]}}}' for c in CAPTEURS)
bloc = f'    {{"id": {compresseur.id}, "nom": "{compresseur.nom}", "capteurs": [\n{lignes},\n    ]}},\n]'
fin_liste = "    ]},\n]\n"
if texte.count(fin_liste) != 1:
    print(f"⚠️  Structure inattendue dans {simulateur} : ajoutez le compresseur au simulateur à la main.")
    raise SystemExit(0)
shutil.copy(simulateur, simulateur.with_name("simulator.avant_compresseur.py.bak"))
simulateur.write_text(texte.replace(fin_liste, "    ]},\n" + bloc + "\n", 1), encoding="utf-8")
print(f"✅ Compresseur ajouté au simulateur : {simulateur}")
print("👉 Redémarrez le simulateur pour qu'il envoie aussi les mesures du compresseur.")
