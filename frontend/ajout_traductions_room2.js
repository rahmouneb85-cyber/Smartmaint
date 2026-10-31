// Ajoute les traductions de Room Live, séance 2 (partage d'écran et de fichiers, modération en direct, bouton flottant).
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_room2.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "room": {
      "vousPresentez": "Vous présentez votre écran",
      "presente": "{{nom}} présente son écran",
      "microCoupePar": "{{par}} a coupé votre micro.",
      "cameraCoupeePar": "{{par}} a coupé votre caméra.",
      "sansPeripherique": "Ce périphérique est indisponible. Vérifiez les autorisations du navigateur.",
      "arreterPartage": "Arrêter la présentation",
      "partagerEcran": "Présenter votre écran",
      "fichiers": "Fichiers",
      "joindreFichier": "Partager un fichier",
      "telechargementImpossible": "Téléchargement impossible.",
      "telechargerNom": "Télécharger {{nom}}",
      "telecharger": "Télécharger",
      "aideFichiers": "Documents partagés pendant la réunion, visibles par les seuls membres de la salle.",
      "aucunFichier": "Aucun fichier partagé.",
      "demandeMicro": "Micro de {{nom}} coupé.",
      "demandeCamera": "Caméra de {{nom}} coupée.",
      "microsCoupes": "{{n}} micro(s) coupé(s).",
      "couperTous": "Couper tous les micros",
      "couperMicroDe": "Couper le micro de {{nom}}",
      "couperCameraDe": "Couper la caméra de {{nom}}"
    },
    "fab": {
      "room": "Room Live",
      "roomInvitations": "{{n}} invitation(s) à une réunion Room Live"
    }
  },
  "en": {
    "room": {
      "vousPresentez": "You are presenting your screen",
      "presente": "{{nom}} is presenting",
      "microCoupePar": "{{par}} muted your microphone.",
      "cameraCoupeePar": "{{par}} turned off your camera.",
      "sansPeripherique": "This device is unavailable. Check the browser permissions.",
      "arreterPartage": "Stop presenting",
      "partagerEcran": "Present your screen",
      "fichiers": "Files",
      "joindreFichier": "Share a file",
      "telechargementImpossible": "Download failed.",
      "telechargerNom": "Download {{nom}}",
      "telecharger": "Download",
      "aideFichiers": "Documents shared during the meeting, visible to room members only.",
      "aucunFichier": "No files shared.",
      "demandeMicro": "{{nom}}'s microphone muted.",
      "demandeCamera": "{{nom}}'s camera turned off.",
      "microsCoupes": "{{n}} microphone(s) muted.",
      "couperTous": "Mute everyone",
      "couperMicroDe": "Mute {{nom}}",
      "couperCameraDe": "Turn off {{nom}}'s camera"
    },
    "fab": {
      "room": "Room Live",
      "roomInvitations": "{{n}} Room Live meeting invitation(s)"
    }
  },
  "ar": {
    "room": {
      "vousPresentez": "أنت تعرض شاشتك",
      "presente": "{{nom}} يعرض شاشته",
      "microCoupePar": "قام {{par}} بكتم الميكروفون الخاص بك.",
      "cameraCoupeePar": "قام {{par}} بإيقاف الكاميرا الخاصة بك.",
      "sansPeripherique": "هذا الجهاز غير متاح. تحقق من أذونات المتصفح.",
      "arreterPartage": "إيقاف العرض",
      "partagerEcran": "عرض شاشتك",
      "fichiers": "الملفات",
      "joindreFichier": "مشاركة ملف",
      "telechargementImpossible": "تعذّر التنزيل.",
      "telechargerNom": "تنزيل {{nom}}",
      "telecharger": "تنزيل",
      "aideFichiers": "الوثائق المشاركة أثناء الاجتماع، يراها أعضاء الغرفة فقط.",
      "aucunFichier": "لا توجد ملفات مشاركة.",
      "demandeMicro": "تم كتم ميكروفون {{nom}}.",
      "demandeCamera": "تم إيقاف كاميرا {{nom}}.",
      "microsCoupes": "تم كتم {{n}} ميكروفون.",
      "couperTous": "كتم الجميع",
      "couperMicroDe": "كتم ميكروفون {{nom}}",
      "couperCameraDe": "إيقاف كاميرا {{nom}}"
    },
    "fab": {
      "room": "Room Live",
      "roomInvitations": "{{n}} دعوة إلى اجتماع Room Live"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_room2.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
