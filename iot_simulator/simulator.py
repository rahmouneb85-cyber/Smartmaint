import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime

BROKER = "localhost"
PORT = 1883
TOPIC = "smartmaint/capteurs"
INTERVALLE = 5            # secondes entre deux séries de mesures

# Probabilité qu'une panne démarre sur un capteur à chaque mesure (0.005 = 0,5 %)
PROBA_PANNE = 0.005
DUREE_PANNE = 3           # nombre de mesures consécutives pendant une panne

# nominal / ecart_type : fonctionnement normal
# haute / basse        : valeurs pendant une panne (pic ou chute)
equipements = [
    {"id": 1, "nom": "Pompe P01", "capteurs": [
        {"id": 2, "type": "temperature", "unite": "°C",   "nominal": 55,  "ecart_type": 4,
         "haute": (88, 110), "basse": (5, 18)},
        {"id": 3, "type": "pression",    "unite": "bar",  "nominal": 4.5, "ecart_type": 0.5,
         "haute": (7.3, 9),  "basse": (0, 1.2)},
        {"id": 4, "type": "vibration",   "unite": "mm/s", "nominal": 1.9, "ecart_type": 0.3,
         "haute": (4.8, 9),  "basse": (0, 0.3)},
    ]},
    {"id": 2, "nom": "Moteur M01", "capteurs": [
        {"id": 5, "type": "temperature", "unite": "°C",   "nominal": 65,  "ecart_type": 5,
         "haute": (103, 130), "basse": (5, 20)},
        {"id": 6, "type": "courant",     "unite": "A",    "nominal": 25,  "ecart_type": 3,
         "haute": (47, 65),  "basse": (0, 6)},
    ]},
    {"id": 3, "nom": "Compresseur C01", "capteurs": [
        {"id": 11, "type": "temperature", "unite": "°C", "nominal": 70,  "ecart_type": 4,
         "haute": (98, 120), "basse": (5, 15)},
        {"id": 12, "type": "pression", "unite": "bar", "nominal": 8,   "ecart_type": 0.4,
         "haute": (10.8, 13), "basse": (2, 5)},
    ]},
]

# Pannes en cours : {capteur_id: (sens, mesures restantes)}
pannes = {}


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("Simulateur connecté au broker MQTT ✅")
    else:
        print(f"Erreur connexion: {rc}")


def simuler_valeur(capteur):
    """Valeur normale autour du nominal, ou pic / chute pendant une panne."""
    cid = capteur["id"]

    if cid not in pannes and random.random() < PROBA_PANNE:
        sens = random.choice(["haute", "basse"])
        pannes[cid] = (sens, DUREE_PANNE)
        print(f"   🔥 Panne simulée ({sens}) sur le capteur {cid} - {capteur['type']}")

    if cid in pannes:
        sens, restantes = pannes[cid]
        mini, maxi = capteur[sens]
        valeur = random.uniform(mini, maxi)
        if restantes <= 1:
            del pannes[cid]
        else:
            pannes[cid] = (sens, restantes - 1)
    else:
        valeur = random.gauss(capteur["nominal"], capteur["ecart_type"])

    return round(max(valeur, 0), 2)  # une mesure physique n'est jamais négative


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.connect(BROKER, PORT, 60)
client.loop_start()

print("Simulateur SmartMaint démarré...")
try:
    while True:
        for eq in equipements:
            for capteur in eq["capteurs"]:
                valeur = simuler_valeur(capteur)
                # Le message ne contient QUE la mesure, comme un vrai capteur
                message = {
                    "equipement_id": eq["id"],
                    "equipement_nom": eq["nom"],
                    "capteur_id": capteur["id"],
                    "type": capteur["type"],
                    "valeur": valeur,
                    "unite": capteur["unite"],
                    "timestamp": datetime.now().isoformat()
                }
                client.publish(TOPIC, json.dumps(message))
                print(f"Publié: {eq['nom']} - {capteur['type']}: {valeur} {capteur['unite']}")
        time.sleep(INTERVALLE)
except KeyboardInterrupt:
    print("Simulateur arrêté.")
    client.loop_stop()