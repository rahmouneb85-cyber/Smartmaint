// Modifie App.js et Sidebar.js pour la phase 3 : page « Mon compte » (2FA, mot de passe, sessions)
// et indicateurs de maintenance sur le tableau de bord.
// Chaque fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_phase3.js
const fs = require('fs');
const path = require('path');

const MODIFS = {
  'App.js': [
    [
      "import { deconnecterServeur } from './api';",
      "import { deconnecterServeur } from './api';\nimport MonCompte from './MonCompte';\nimport IndicateursMaintenance from './IndicateursMaintenance';",
    ],
    [
      "{page === 'securite' && moi?.role === 'admin' && <Securite token={token} moi={moi} />}",
      "{page === 'securite' && moi?.role === 'admin' && <Securite token={token} moi={moi} />}\n        {page === 'compte' && <MonCompte token={token} moi={moi} onLogout={logout} />}",
    ],
    [
      "<AnalyseIA token={token} equipements={equipements} onLogout={logout} />",
      "<IndicateursMaintenance token={token} />\n            <AnalyseIA token={token} equipements={equipements} onLogout={logout} />",
    ],
  ],
  'Sidebar.js': [
    [
      "{(admin ? [...MENU, { id: 'securite', icon: '🛡️' }] : MENU).map(item => (",
      "{(admin ? [...MENU, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }] : [...MENU, { id: 'compte', icon: '👤' }]).map(item => (",
    ],
  ],
};

let erreurs = 0;
const resultats = {};
for (const [nom, modifs] of Object.entries(MODIFS)) {
  const fichier = path.join(__dirname, 'src', nom);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); erreurs++; continue; }
  let texte = fs.readFileSync(fichier, 'utf8');
  if (texte.includes("import MonCompte from './MonCompte'") || texte.includes("id: 'compte'")) {
    console.log(`ℹ️  ${nom} est déjà modifié : rien à faire`);
    continue;
  }
  for (const [avant, apres] of modifs) {
    const n = texte.split(avant).length - 1;
    if (n !== 1) { console.log(`❌ ${nom} : passage trouvé ${n} fois au lieu d'une :\n   ${avant.slice(0, 90)}`); erreurs++; continue; }
    texte = texte.replace(avant, apres);
  }
  resultats[nom] = texte;
}

if (erreurs) {
  console.log(`\n⛔ ${erreurs} problème(s) : aucun fichier n'a été modifié.`);
  process.exit(1);
}
for (const [nom, texte] of Object.entries(resultats)) {
  const fichier = path.join(__dirname, 'src', nom);
  fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_phase3.js.bak'));
  fs.writeFileSync(fichier, texte, 'utf8');
  console.log(`✅ ${nom} modifié (sauvegarde : ${nom.replace('.js', '.avant_phase3.js.bak')})`);
}
