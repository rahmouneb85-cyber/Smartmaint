// Ajoute les traductions de l'assistance à la saisie dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_saisie.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "saisie": {
      "mot": "mot",
      "voixIndispo": "Saisie vocale indisponible dans ce navigateur (utilisez Chrome ou Edge).",
      "dicter": "Dicter",
      "reformuler": "Corriger et reformuler en français",
      "memeEquipement": "cet équipement",
      "historique": "historique",
      "vocabulaire": "vocabulaire",
      "aideClavier": "↑ ↓ pour choisir · Tab ou Entrée pour accepter · Échap pour fermer",
      "proposition": "Proposition",
      "remplacer": "Remplacer",
      "garder": "Garder mon texte",
      "c": {
        "description": "Description",
        "priorite": "Priorité",
        "type": "Type",
        "technicien": "Technicien",
        "date": "Date prévue",
        "diagnostic": "Diagnostic probable",
        "actions": "Actions",
        "pieces": "Pièces"
      },
      "choisirEquipement": "Choisissez d'abord l'équipement",
      "analyse": "Analyse de l'historique…",
      "proposer": "Proposer à partir de l'historique",
      "rien": "Aucune proposition : pas assez d'historique pour cette panne.",
      "similaires": "Interventions similaires",
      "manuel": "À consulter dans le manuel",
      "appliquer": "Appliquer la sélection",
      "fermer": "Fermer",
      "diagProbable": "Diagnostic probable",
      "actionsPrevues": "Actions à prévoir",
      "piecesPrevoir": "Pièces à prévoir",
      "preremplir": "Préremplir le compte rendu"
    }
  },
  "en": {
    "saisie": {
      "mot": "word",
      "voixIndispo": "Voice input is not available in this browser (use Chrome or Edge).",
      "dicter": "Dictate",
      "reformuler": "Correct and rewrite in French",
      "memeEquipement": "this equipment",
      "historique": "history",
      "vocabulaire": "vocabulary",
      "aideClavier": "↑ ↓ to choose · Tab or Enter to accept · Esc to close",
      "proposition": "Suggestion",
      "remplacer": "Replace",
      "garder": "Keep my text",
      "c": {
        "description": "Description",
        "priorite": "Priority",
        "type": "Type",
        "technicien": "Technician",
        "date": "Planned date",
        "diagnostic": "Probable diagnosis",
        "actions": "Actions",
        "pieces": "Parts"
      },
      "choisirEquipement": "Choose the equipment first",
      "analyse": "Analysing history…",
      "proposer": "Suggest from history",
      "rien": "No suggestion: not enough history for this fault.",
      "similaires": "Similar interventions",
      "manuel": "See the manual",
      "appliquer": "Apply selection",
      "fermer": "Close",
      "diagProbable": "Probable diagnosis",
      "actionsPrevues": "Planned actions",
      "piecesPrevoir": "Parts to plan",
      "preremplir": "Prefill the report"
    }
  },
  "ar": {
    "saisie": {
      "mot": "كلمة",
      "voixIndispo": "الإدخال الصوتي غير متوفر في هذا المتصفح (استخدم Chrome أو Edge).",
      "dicter": "إملاء",
      "reformuler": "تصحيح وإعادة الصياغة بالفرنسية",
      "memeEquipement": "هذه المعدات",
      "historique": "السجل",
      "vocabulaire": "المصطلحات",
      "aideClavier": "↑ ↓ للاختيار · Tab أو Entrée للقبول · Échap للإغلاق",
      "proposition": "اقتراح",
      "remplacer": "استبدال",
      "garder": "الاحتفاظ بنصي",
      "c": {
        "description": "الوصف",
        "priorite": "الأولوية",
        "type": "النوع",
        "technicien": "التقني",
        "date": "التاريخ المبرمج",
        "diagnostic": "التشخيص المحتمل",
        "actions": "الأعمال",
        "pieces": "القطع"
      },
      "choisirEquipement": "اختر المعدات أولًا",
      "analyse": "تحليل السجل…",
      "proposer": "اقتراح انطلاقًا من السجل",
      "rien": "لا يوجد اقتراح: السجل غير كافٍ لهذا العطل.",
      "similaires": "تدخلات مماثلة",
      "manuel": "للاطلاع في الدليل",
      "appliquer": "تطبيق الاختيار",
      "fermer": "إغلاق",
      "diagProbable": "التشخيص المحتمل",
      "actionsPrevues": "الأعمال المبرمجة",
      "piecesPrevoir": "القطع الواجب توفيرها",
      "preremplir": "ملء التقرير مسبقًا"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_saisie.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
