import os
import json
import requests
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

# La clé API IoT est lue dans le même fichier .env que le backend (jamais écrite dans le code)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", ".env"))
HEADERS = {"X-API-Key": os.getenv("IOT_API_KEY", "")}

BROKER = "localhost"
PORT = 1883
TOPIC = "smartmaint/capteurs"
API_URL = "http://127.0.0.1:8001/api/v1"

# Rôle du listener : transmettre les mesures au backend, rien de plus.
# Les seuils (table capteurs) et l'IA sont vérifiés par le backend, qui crée lui-même les alertes.


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("Listener connecté au broker MQTT ✅")
        client.subscribe(TOPIC)
        print(f"Abonné au topic: {TOPIC}")
        if not HEADERS["X-API-Key"]:
            print("⚠️ Aucune clé IOT_API_KEY trouvée dans backend/.env : les envois seront refusés")
    else:
        print(f"Erreur connexion: {rc}")


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        print(f"Reçu: {data['equipement_nom']} - {data['type']}: {data['valeur']} {data['unite']}")

        payload = {
            "capteur_id": data["capteur_id"],
            "valeur": data["valeur"]
        }
        response = requests.post(f"{API_URL}/capteurs/data", json=payload, headers=HEADERS, timeout=5)

        if response.status_code == 200:
            print("  ✅ Sauvegardé en base de données")
        elif response.status_code == 401:
            print("  🔒 Refusé : clé API IoT invalide ou manquante")
        else:
            print(f"  ❌ Erreur API: {response.status_code}")

    except requests.exceptions.ConnectionError:
        print("  ❌ Backend injoignable (est-il lancé sur le port 8001 ?)")
    except requests.exceptions.Timeout:
        print("  ❌ Le backend n'a pas répondu à temps")
    except Exception as e:
        print(f"Erreur: {e}")


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.on_message = on_message
client.connect(BROKER, PORT, 60)

print("MQTT Listener SmartMaint démarré...")
client.loop_forever()