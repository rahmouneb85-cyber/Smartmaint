// Ajoute les traductions de la page de connexion dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_login.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "login": {
      "connexion": "Connexion",
      "seConnecter": "Se connecter",
      "email": "Email",
      "password": "Mot de passe",
      "afficher": "Afficher",
      "cacher": "Masquer",
      "champsVides": "Veuillez saisir votre email et votre mot de passe.",
      "bloque": "Trop de tentatives échouées. Réessayez dans {{minutes}} minute(s).",
      "desactive": "Compte désactivé. Contactez l'administrateur.",
      "compteAdmin": "Les comptes sont créés par l'administrateur."
    }
  },
  "en": {
    "login": {
      "connexion": "Sign in",
      "seConnecter": "Sign in",
      "email": "Email",
      "password": "Password",
      "afficher": "Show",
      "cacher": "Hide",
      "champsVides": "Please enter your email and password.",
      "bloque": "Too many failed attempts. Try again in {{minutes}} minute(s).",
      "desactive": "Account disabled. Please contact the administrator.",
      "compteAdmin": "Accounts are created by the administrator."
    }
  },
  "ar": {
    "login": {
      "connexion": "تسجيل الدخول",
      "seConnecter": "دخول",
      "email": "البريد الإلكتروني",
      "password": "كلمة المرور",
      "afficher": "إظهار",
      "cacher": "إخفاء",
      "champsVides": "يرجى إدخال البريد الإلكتروني وكلمة المرور.",
      "bloque": "محاولات فاشلة كثيرة. أعد المحاولة بعد {{minutes}} دقيقة.",
      "desactive": "الحساب معطل. يرجى التواصل مع المسؤول.",
      "compteAdmin": "يتم إنشاء الحسابات من طرف المسؤول."
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_login.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
