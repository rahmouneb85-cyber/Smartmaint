// Ajoute les traductions de la messagerie interne et de WhatsApp dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_messagerie.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "fab": {
      "messagerie": "Messagerie",
      "nouveauMessage": "Nouveau message",
      "messagesNonLus": "{{n}} message(s) non lu(s)",
      "retour": "Retour",
      "nouveau": "Nouveau message",
      "aucuneConv": "Aucune conversation pour le moment.",
      "vous": "Vous : ",
      "nonLusConv": "{{n}} non lu(s)",
      "rechercherContact": "Rechercher un collègue",
      "role": {
        "admin": "Administrateur",
        "superviseur": "Superviseur",
        "technicien": "Technicien"
      },
      "premierMessage": "Écrivez le premier message.",
      "votreMessage": "Votre message",
      "waAide": "Seuls les collègues qui ont choisi de partager leur numéro sont joignables.",
      "nonPartage": "Numéro non partagé",
      "ouvrirWa": "Ouvrir WhatsApp avec {{nom}}",
      "ecrireA": "Écrire à {{nom}}",
      "aucunContact": "Aucun collègue trouvé.",
      "monNumero": "Mon numéro WhatsApp",
      "partager": "Partager mon numéro avec mes collègues",
      "enregistre": "Enregistré",
      "enregistrer": "Enregistrer"
    }
  },
  "en": {
    "fab": {
      "messagerie": "Messages",
      "nouveauMessage": "New message",
      "messagesNonLus": "{{n}} unread message(s)",
      "retour": "Back",
      "nouveau": "New message",
      "aucuneConv": "No conversations yet.",
      "vous": "You: ",
      "nonLusConv": "{{n}} unread",
      "rechercherContact": "Search for a colleague",
      "role": {
        "admin": "Administrator",
        "superviseur": "Supervisor",
        "technicien": "Technician"
      },
      "premierMessage": "Write the first message.",
      "votreMessage": "Your message",
      "waAide": "Only colleagues who chose to share their number can be reached.",
      "nonPartage": "Number not shared",
      "ouvrirWa": "Open WhatsApp with {{nom}}",
      "ecrireA": "Write to {{nom}}",
      "aucunContact": "No colleague found.",
      "monNumero": "My WhatsApp number",
      "partager": "Share my number with my colleagues",
      "enregistre": "Saved",
      "enregistrer": "Save"
    }
  },
  "ar": {
    "fab": {
      "messagerie": "الرسائل",
      "nouveauMessage": "رسالة جديدة",
      "messagesNonLus": "{{n}} رسالة غير مقروءة",
      "retour": "رجوع",
      "nouveau": "رسالة جديدة",
      "aucuneConv": "لا توجد محادثات حاليًا.",
      "vous": "أنت: ",
      "nonLusConv": "{{n}} غير مقروءة",
      "rechercherContact": "البحث عن زميل",
      "role": {
        "admin": "مسؤول",
        "superviseur": "مشرف",
        "technicien": "تقني"
      },
      "premierMessage": "اكتب الرسالة الأولى.",
      "votreMessage": "رسالتك",
      "waAide": "يمكن التواصل فقط مع الزملاء الذين اختاروا مشاركة رقمهم.",
      "nonPartage": "الرقم غير مشارك",
      "ouvrirWa": "فتح واتساب مع {{nom}}",
      "ecrireA": "الكتابة إلى {{nom}}",
      "aucunContact": "لم يتم العثور على أي زميل.",
      "monNumero": "رقم واتساب الخاص بي",
      "partager": "مشاركة رقمي مع زملائي",
      "enregistre": "تم الحفظ",
      "enregistrer": "حفظ"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_messagerie.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
