// Ajoute les traductions des boutons flottants (raccourcis, notifications, assistant public, contact) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_boutons.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "fab": {
      "assistant": "Assistant IA",
      "copilote": "Copilote IA",
      "notifications": "Notifications",
      "actions": "Actions rapides",
      "sombre": "Mode sombre",
      "clair": "Mode clair",
      "compte": "Mon compte",
      "contact": "Nous contacter",
      "menu": "Raccourcis",
      "nonLues": "{{n}} notification(s) non lue(s)",
      "ouvrir": "Ouvrir les raccourcis",
      "fermer": "Fermer les raccourcis",
      "nouvelle": "Nouvelle notification",
      "toutLire": "Tout marquer comme lu",
      "chargement": "Chargement…",
      "aucune": "Aucune notification",
      "assistantPublic": "Informations générales. Connectez-vous pour accéder à vos données.",
      "question": "Votre question",
      "envoyer": "Envoyer",
      "erreur": "Service indisponible",
      "nom": "Nom",
      "message": "Message",
      "envoye": "Message envoyé à l’administrateur.",
      "limite": "Trop de messages : réessayez dans une minute.",
      "invalide": "Vérifiez votre nom, votre email et votre message (5 caractères minimum).",
      "a": {
        "intervention": "Créer une intervention",
        "document": "Déposer un document",
        "question": "Poser une question au copilote",
        "equipement": "Gérer les équipements",
        "workflows": "Workflows automatiques"
      },
      "n": {
        "alerte": "Alerte {{severite}} : {{type}} sur {{equipement}}",
        "alertes": "{{n}} alertes {{severite}} : {{type}} sur {{equipement}}",
        "intervention_nouvelle": "Nouvelle intervention assignée : {{equipement}}",
        "intervention": "Intervention assignée : {{equipement}}",
        "workflow": "Workflow désactivé : {{nom}}",
        "contact": "Nouveau message de contact : {{nom}}"
      }
    }
  },
  "en": {
    "fab": {
      "assistant": "AI assistant",
      "copilote": "AI copilot",
      "notifications": "Notifications",
      "actions": "Quick actions",
      "sombre": "Dark mode",
      "clair": "Light mode",
      "compte": "My account",
      "contact": "Contact us",
      "menu": "Shortcuts",
      "nonLues": "{{n}} unread notification(s)",
      "ouvrir": "Open shortcuts",
      "fermer": "Close shortcuts",
      "nouvelle": "New notification",
      "toutLire": "Mark all as read",
      "chargement": "Loading…",
      "aucune": "No notifications",
      "assistantPublic": "General information. Sign in to access your data.",
      "question": "Your question",
      "envoyer": "Send",
      "erreur": "Service unavailable",
      "nom": "Name",
      "message": "Message",
      "envoye": "Message sent to the administrator.",
      "limite": "Too many messages: try again in a minute.",
      "invalide": "Check your name, email and message (at least 5 characters).",
      "a": {
        "intervention": "Create a work order",
        "document": "Upload a document",
        "question": "Ask the copilot",
        "equipement": "Manage equipment",
        "workflows": "Automated workflows"
      },
      "n": {
        "alerte": "{{severite}} alert: {{type}} on {{equipement}}",
        "alertes": "{{n}} {{severite}} alerts: {{type}} on {{equipement}}",
        "intervention_nouvelle": "New work order assigned: {{equipement}}",
        "intervention": "Work order assigned: {{equipement}}",
        "workflow": "Workflow disabled: {{nom}}",
        "contact": "New contact message: {{nom}}"
      }
    }
  },
  "ar": {
    "fab": {
      "assistant": "المساعد الذكي",
      "copilote": "المساعد الذكي للصيانة",
      "notifications": "الإشعارات",
      "actions": "إجراءات سريعة",
      "sombre": "المظهر الداكن",
      "clair": "المظهر الفاتح",
      "compte": "حسابي",
      "contact": "اتصل بنا",
      "menu": "اختصارات",
      "nonLues": "{{n}} إشعار غير مقروء",
      "ouvrir": "فتح الاختصارات",
      "fermer": "إغلاق الاختصارات",
      "nouvelle": "إشعار جديد",
      "toutLire": "تعليم الكل كمقروء",
      "chargement": "جارٍ التحميل…",
      "aucune": "لا توجد إشعارات",
      "assistantPublic": "معلومات عامة. سجّل الدخول للوصول إلى بياناتك.",
      "question": "سؤالك",
      "envoyer": "إرسال",
      "erreur": "الخدمة غير متاحة",
      "nom": "الاسم",
      "message": "الرسالة",
      "envoye": "تم إرسال الرسالة إلى المسؤول.",
      "limite": "رسائل كثيرة: أعد المحاولة بعد دقيقة.",
      "invalide": "تحقق من الاسم والبريد الإلكتروني والرسالة (5 أحرف على الأقل).",
      "a": {
        "intervention": "إنشاء تدخل",
        "document": "إيداع وثيقة",
        "question": "طرح سؤال على المساعد",
        "equipement": "إدارة المعدات",
        "workflows": "سير العمل الآلي"
      },
      "n": {
        "alerte": "تنبيه {{severite}}: {{type}} على {{equipement}}",
        "alertes": "{{n}} تنبيهات {{severite}}: {{type}} على {{equipement}}",
        "intervention_nouvelle": "تدخل جديد مسند إليك: {{equipement}}",
        "intervention": "تدخل مسند إليك: {{equipement}}",
        "workflow": "تم تعطيل سير العمل: {{nom}}",
        "contact": "رسالة اتصال جديدة: {{nom}}"
      }
    }
  }
};

// Ajoute seulement ce qui manque, sans jamais écraser une traduction existante
function fusionner(cible, ajout, chemin, compteur) {
  for (const [cle, valeur] of Object.entries(ajout)) {
    if (valeur && typeof valeur === 'object') {
      if (typeof cible[cle] !== 'object' || cible[cle] === null) {
        if (cible[cle] === undefined) cible[cle] = {};
        else continue; // une valeur texte existe déjà sous ce nom : on n'y touche pas
      }
      fusionner(cible[cle], valeur, chemin + cle + '.', compteur);
    } else if (cible[cle] === undefined) {
      cible[cle] = valeur;
      compteur.n++;
    }
  }
}

for (const langue of ['fr', 'en', 'ar']) {
  const fichier = path.join(__dirname, 'src', 'i18n', `${langue}.json`);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); continue; }
  const texte = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '');
  let donnees;
  try { donnees = JSON.parse(texte); }
  catch (e) { console.log(`❌ ${langue}.json n'est pas un JSON valide : ${e.message}`); continue; }
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_boutons.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
