"""Fonctions accessibles SANS connexion, utilisées par les boutons flottants des pages publiques.

Sécurité :
  • aucune donnée de la plateforme n'est lue ni renvoyée (pas d'équipement, d'alerte, d'utilisateur…) ;
  • l'assistant public n'a accès à aucun outil : il répond seulement à partir d'informations générales ;
  • nombre de requêtes limité par adresse IP pour éviter les abus.
"""
import re
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.journaux import journal
from app.core.sessions import ip_client
from app.models.notification import DemandeContact
from app.notifications.service import notifier_session

router = APIRouter(prefix="/public", tags=["Pages publiques"])

_requetes = defaultdict(deque)


def limiter(nom: str, par_minute: int):
    def verifier(request: Request):
        cle = (nom, ip_client(request))
        file, maintenant = _requetes[cle], time.monotonic()
        while file and maintenant - file[0] > 60:
            file.popleft()
        if len(file) >= par_minute:
            raise HTTPException(status_code=429, detail="Trop de requêtes. Réessayez dans une minute.", headers={"Retry-After": "60"})
        file.append(maintenant)
    return verifier


@router.get("/config")
def configuration(db: Session = Depends(get_db)):
    """Boutons publics disponibles : seuls ceux réellement configurés sont affichés, dans l'ordre et avec
    les couleurs choisis par l'administrateur (Paramètres → Personnalisation des boutons)."""
    from app.api.boutons import boutons_publics
    numero = re.sub(r"[^\d]", "", settings.WHATSAPP_ENTREPRISE or "")
    return {"whatsapp": numero or None, "contact": True, "assistant": bool(settings.ASSISTANT_PUBLIC),
            "boutons": boutons_publics(db)}


# ─────────────────────────────────────────────────────────────
# ASSISTANT PUBLIC
# ─────────────────────────────────────────────────────────────
CONSIGNE = """Tu es l'assistant public de SmartMaint, plateforme de supervision industrielle IoT et de maintenance assistée par l'IA,
développée par BENJEDDOU Technologie Services. L'utilisateur N'EST PAS connecté.
Règles strictes :
1. Tu réponds uniquement sur : la présentation de SmartMaint, ses fonctionnalités générales (supervision des capteurs,
   alertes, interventions, copilote IA, documents, workflows), la connexion (comptes créés par l'administrateur,
   double authentification, mot de passe oublié : contacter l'administrateur) et la prise de contact.
2. Tu n'as accès à AUCUNE donnée de l'entreprise : ne donne jamais d'information sur des équipements, des alertes,
   des utilisateurs ou des interventions, et n'invente rien. Pour cela, l'utilisateur doit se connecter.
3. Réponds dans la langue demandée ({langue}), en 5 phrases au maximum, sans mise en forme Markdown."""

FAQ = {
    "fr": [(("mot de passe", "oubli", "connect", "compte", "2fa", "code"), "Les comptes SmartMaint sont créés par l'administrateur. En cas d'oubli du mot de passe ou de problème de code de vérification, contactez l'administrateur avec le bouton Contact."),
           (("quoi", "présent", "fonction", "smartmaint", "sert"), "SmartMaint supervise les équipements industriels grâce aux capteurs IoT, détecte les anomalies, crée et suit les interventions de maintenance, et propose un copilote IA, le traitement des documents et des workflows automatiques. Connectez-vous pour accéder à vos données."),
           ((), "Je réponds aux questions générales sur SmartMaint et la connexion. Pour toute autre demande, utilisez le bouton Contact.")],
    "en": [(("password", "forgot", "login", "account", "code"), "SmartMaint accounts are created by the administrator. If you forgot your password or have a verification code issue, contact the administrator with the Contact button."),
           (("what", "feature", "smartmaint"), "SmartMaint monitors industrial equipment with IoT sensors, detects anomalies, manages maintenance work orders, and offers an AI copilot, document processing and automated workflows. Sign in to access your data."),
           ((), "I answer general questions about SmartMaint and signing in. For anything else, please use the Contact button.")],
    "ar": [(("كلمة", "نسيت", "دخول", "حساب", "رمز"), "يتم إنشاء حسابات SmartMaint من طرف المسؤول. إذا نسيت كلمة المرور أو واجهت مشكلة في رمز التحقق، تواصل مع المسؤول عبر زر الاتصال."),
           (("ما", "منصة", "smartmaint", "وظائف"), "يراقب SmartMaint المعدات الصناعية عبر مستشعرات إنترنت الأشياء، ويكشف الأعطال، ويدير تدخلات الصيانة، ويوفر مساعدًا ذكيًا ومعالجة الوثائق وسير العمل الآلي. سجّل الدخول للوصول إلى بياناتك."),
           ((), "أجيب عن الأسئلة العامة حول SmartMaint وتسجيل الدخول. لأي طلب آخر، استعمل زر الاتصال.")],
}


def reponse_faq(question: str, langue: str) -> str:
    q = question.lower()
    for mots, texte in FAQ.get(langue, FAQ["fr"]):
        if not mots or any(m in q for m in mots):
            return texte
    return FAQ["fr"][-1][1]


class Message(BaseModel):
    role: str
    content: str = Field(max_length=1000)


class QuestionPublique(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    langue: str = "fr"
    historique: List[Message] = []


@router.post("/assistant", dependencies=[Depends(limiter("assistant", 10))])
def assistant_public(q: QuestionPublique):
    if not settings.ASSISTANT_PUBLIC:
        raise HTTPException(status_code=404, detail="Assistant public désactivé")
    langue = q.langue if q.langue in FAQ else "fr"
    messages = [{"role": "system", "content": CONSIGNE.format(langue={"fr": "français", "en": "anglais", "ar": "arabe"}[langue])}]
    messages += [{"role": m.role, "content": m.content} for m in q.historique[-4:] if m.role in ("user", "assistant")]
    messages.append({"role": "user", "content": q.question})
    try:
        from app.copilote import llm
        r = llm.discuter(messages, None)                  # aucun outil : aucune donnée accessible
        texte = re.sub(r"\*\*|__|#+ ", "", (r["contenu"] or "").strip())
        if texte:
            return {"reponse": texte[:1500], "source": "ia"}
    except Exception:
        journal.warning("Assistant public : modèle indisponible, réponse prédéfinie utilisée", exc_info=True)
    return {"reponse": reponse_faq(q.question, langue), "source": "faq"}


# ─────────────────────────────────────────────────────────────
# CONTACT
# ─────────────────────────────────────────────────────────────
class Contact(BaseModel):
    nom: str = Field(min_length=2, max_length=100)
    email: EmailStr
    message: str = Field(min_length=5, max_length=2000)
    langue: str = "fr"


@router.post("/contact", dependencies=[Depends(limiter("contact", 3))])
def contacter(c: Contact, request: Request, db: Session = Depends(get_db)):
    d = DemandeContact(nom=c.nom.strip(), email=str(c.email).lower(), message=c.message.strip(), langue=c.langue[:5],
                       ip=ip_client(request), created_at=datetime.now())
    db.add(d)
    db.flush()
    notifier_session(db, roles=["admin"], type_="contact", titre=f"Nouveau message de contact : {d.nom}", donnees={"modele": "contact", "nom": d.nom},
                     message=d.message[:300], page="securite", objet_id=d.id)
    db.commit()
    return {"message": "Message envoyé"}
