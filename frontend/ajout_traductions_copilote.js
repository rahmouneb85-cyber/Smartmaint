// Ajoute les traductions du Copilote IA dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_copilote.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "copilote": "Copilote IA"
    },
    "copilote": {
      "titre": "Copilote de maintenance",
      "documents": "documents indexés",
      "indexer": "Mettre à jour les connaissances",
      "indexerAide": "Mettre à jour la base de connaissances",
      "nouvelle": "Nouvelle conversation",
      "bonjour": "Bonjour {{nom}}, que puis-je faire pour vous ?",
      "intro": "J'analyse les équipements, les alertes et l'historique des interventions, et je peux préparer des actions pour vous.",
      "reflexion": "Le copilote analyse les données…",
      "erreurReseau": "Le copilote est injoignable. Vérifiez que le backend tourne.",
      "actionProposee": "Action proposée",
      "confirmer": "Confirmer",
      "annuler": "Annuler",
      "sources": "Sources",
      "utile": "Réponse utile",
      "pasUtile": "Réponse pas utile",
      "voix": "Dicter",
      "voixIndispo": "La saisie vocale n'est pas disponible dans ce navigateur (utilisez Chrome ou Edge).",
      "placeholder": "Posez une question ou demandez une action…",
      "avertissement": "Le copilote s'appuie sur les données de SmartMaint et ne modifie rien sans votre confirmation.",
      "st": {
        "annulee": "Action annulée",
        "echec": "Échec de l'action",
        "confirmee": "Action confirmée"
      },
      "outil": {
        "lister_equipements": "Consultation des équipements",
        "etat_equipement": "Analyse de l'état de l'équipement",
        "rechercher_alertes": "Recherche des alertes",
        "analyser_alerte": "Analyse de l'incident",
        "rechercher_interventions": "Recherche des interventions",
        "indicateurs_maintenance": "Calcul des indicateurs",
        "recherche_documentaire": "Recherche dans la base de connaissances",
        "lister_techniciens": "Consultation des techniciens",
        "proposer_intervention": "Préparation de l'ordre d'intervention"
      }
    }
  },
  "en": {
    "menu": {
      "copilote": "AI Copilot"
    },
    "copilote": {
      "titre": "Maintenance copilot",
      "documents": "indexed documents",
      "indexer": "Update knowledge",
      "indexerAide": "Update the knowledge base",
      "nouvelle": "New conversation",
      "bonjour": "Hello {{nom}}, how can I help you?",
      "intro": "I analyse equipment, alerts and intervention history, and I can prepare actions for you.",
      "reflexion": "The copilot is analysing the data…",
      "erreurReseau": "The copilot cannot be reached. Check that the backend is running.",
      "actionProposee": "Proposed action",
      "confirmer": "Confirm",
      "annuler": "Cancel",
      "sources": "Sources",
      "utile": "Helpful answer",
      "pasUtile": "Not helpful",
      "voix": "Dictate",
      "voixIndispo": "Voice input is not available in this browser (use Chrome or Edge).",
      "placeholder": "Ask a question or request an action…",
      "avertissement": "The copilot relies on SmartMaint data and changes nothing without your confirmation.",
      "st": {
        "annulee": "Action cancelled",
        "echec": "Action failed",
        "confirmee": "Action confirmed"
      },
      "outil": {
        "lister_equipements": "Checking equipment",
        "etat_equipement": "Analysing equipment condition",
        "rechercher_alertes": "Searching alerts",
        "analyser_alerte": "Analysing the incident",
        "rechercher_interventions": "Searching interventions",
        "indicateurs_maintenance": "Computing indicators",
        "recherche_documentaire": "Searching the knowledge base",
        "lister_techniciens": "Checking technicians",
        "proposer_intervention": "Preparing the work order"
      }
    }
  },
  "ar": {
    "menu": {
      "copilote": "المساعد الذكي"
    },
    "copilote": {
      "titre": "مساعد الصيانة",
      "documents": "وثيقة مفهرسة",
      "indexer": "تحديث المعارف",
      "indexerAide": "تحديث قاعدة المعارف",
      "nouvelle": "محادثة جديدة",
      "bonjour": "مرحبًا {{nom}}، كيف يمكنني مساعدتك؟",
      "intro": "أحلل المعدات والتنبيهات وسجل التدخلات، ويمكنني تحضير إجراءات من أجلك.",
      "reflexion": "المساعد يحلل البيانات…",
      "erreurReseau": "تعذر الوصول إلى المساعد. تحقق من تشغيل الخادم.",
      "actionProposee": "إجراء مقترح",
      "confirmer": "تأكيد",
      "annuler": "إلغاء",
      "sources": "المصادر",
      "utile": "إجابة مفيدة",
      "pasUtile": "إجابة غير مفيدة",
      "voix": "إملاء",
      "voixIndispo": "الإدخال الصوتي غير متوفر في هذا المتصفح (استخدم Chrome أو Edge).",
      "placeholder": "اطرح سؤالًا أو اطلب إجراءً…",
      "avertissement": "يعتمد المساعد على بيانات SmartMaint ولا يغير شيئًا دون تأكيدك.",
      "st": {
        "annulee": "تم إلغاء الإجراء",
        "echec": "فشل الإجراء",
        "confirmee": "تم تأكيد الإجراء"
      },
      "outil": {
        "lister_equipements": "الاطلاع على المعدات",
        "etat_equipement": "تحليل حالة المعدات",
        "rechercher_alertes": "البحث في التنبيهات",
        "analyser_alerte": "تحليل الحادث",
        "rechercher_interventions": "البحث في التدخلات",
        "indicateurs_maintenance": "حساب المؤشرات",
        "recherche_documentaire": "البحث في قاعدة المعارف",
        "lister_techniciens": "الاطلاع على التقنيين",
        "proposer_intervention": "تحضير أمر التدخل"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_copilote.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
