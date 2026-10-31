// Ajoute les traductions de l'expérience utilisateur (menu mobile, confirmations, santé du système) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_ux.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "ouvrir": "Ouvrir le menu",
      "fermer": "Fermer le menu"
    },
    "app": {
      "allerContenu": "Aller au contenu",
      "chargement": "Chargement…"
    },
    "commun": {
      "information": "Information",
      "confirmation": "Confirmation",
      "continuer": "Continuer"
    },
    "login": {
      "code": "Code de vérification"
    },
    "sante": {
      "titre": "Santé du système",
      "ok": "Opérationnel",
      "attention": "Mode dégradé",
      "panne": "En panne",
      "aVerifier": "{{n}} point(s) à vérifier",
      "detail": "Voir le détail",
      "masquer": "Masquer le détail",
      "c": {
        "Base de données": "Base de données",
        "Moteur des workflows": "Moteur des workflows",
        "Sauvegardes": "Sauvegardes",
        "Modèle de langage": "Modèle de langage",
        "Notifications Telegram": "Notifications Telegram",
        "Modèles de détection d'anomalies": "Modèles de détection d'anomalies",
        "Espace disque": "Espace disque"
      }
    }
  },
  "en": {
    "menu": {
      "ouvrir": "Open menu",
      "fermer": "Close menu"
    },
    "app": {
      "allerContenu": "Skip to content",
      "chargement": "Loading…"
    },
    "commun": {
      "information": "Information",
      "confirmation": "Confirmation",
      "continuer": "Continue"
    },
    "login": {
      "code": "Verification code"
    },
    "sante": {
      "titre": "System health",
      "ok": "Operational",
      "attention": "Degraded",
      "panne": "Down",
      "aVerifier": "{{n}} item(s) to check",
      "detail": "Show details",
      "masquer": "Hide details",
      "c": {
        "Base de données": "Database",
        "Moteur des workflows": "Workflow engine",
        "Sauvegardes": "Backups",
        "Modèle de langage": "Language model",
        "Notifications Telegram": "Telegram notifications",
        "Modèles de détection d'anomalies": "Anomaly detection models",
        "Espace disque": "Disk space"
      }
    }
  },
  "ar": {
    "menu": {
      "ouvrir": "فتح القائمة",
      "fermer": "إغلاق القائمة"
    },
    "app": {
      "allerContenu": "الانتقال إلى المحتوى",
      "chargement": "جارٍ التحميل…"
    },
    "commun": {
      "information": "معلومة",
      "confirmation": "تأكيد",
      "continuer": "متابعة"
    },
    "login": {
      "code": "رمز التحقق"
    },
    "sante": {
      "titre": "حالة النظام",
      "ok": "يعمل",
      "attention": "وضع محدود",
      "panne": "متوقف",
      "aVerifier": "{{n}} عنصر للتحقق",
      "detail": "عرض التفاصيل",
      "masquer": "إخفاء التفاصيل",
      "c": {
        "Base de données": "قاعدة البيانات",
        "Moteur des workflows": "محرك سير العمل",
        "Sauvegardes": "النسخ الاحتياطية",
        "Modèle de langage": "النموذج اللغوي",
        "Notifications Telegram": "إشعارات تيليغرام",
        "Modèles de détection d'anomalies": "نماذج كشف الأعطال",
        "Espace disque": "مساحة القرص"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_ux.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
