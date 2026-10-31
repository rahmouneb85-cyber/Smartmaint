import requests
from app.core.config import settings

EMOJIS = {"faible": "🟢", "moyenne": "🟡", "haute": "🟠", "critique": "🔴"}


def envoyer_telegram(texte: str) -> bool:
    """Envoie un message Telegram. Ne fait jamais planter l'application."""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        print("⚠️ Telegram non configuré")
        return False

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        r = requests.post(url, json={
            "chat_id": settings.TELEGRAM_CHAT_ID,
            "text": texte,
            "parse_mode": "HTML"
        }, timeout=5)
        if r.status_code != 200:
            print(f"❌ Erreur Telegram : {r.status_code} - {r.text}")
            return False
        return True
    except Exception as e:
        print(f"❌ Erreur Telegram : {e}")
        return False


def notifier_alerte(equipement_nom: str, severite: str, type_alerte: str, message: str) -> bool:
    emoji = EMOJIS.get(severite, "⚠️")
    texte = (
        f"{emoji} <b>ALERTE {severite.upper()}</b>\n\n"
        f"🏭 <b>Équipement :</b> {equipement_nom}\n"
        f"📊 <b>Type :</b> {type_alerte}\n"
        f"📝 {message}\n\n"
        f"<i>SmartMaint — Supervision IoT &amp; IA</i>"
    )
    return envoyer_telegram(texte)
