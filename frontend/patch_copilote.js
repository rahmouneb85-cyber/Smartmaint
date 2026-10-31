// Ajoute la page « Copilote IA » dans App.js et dans le menu (Sidebar.js).
// Chaque fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_copilote.js
const fs = require('fs');
const path = require('path');

const MODIFS = {
  'App.js': [
    [
      "import IndicateursMaintenance from './IndicateursMaintenance';",
      "import IndicateursMaintenance from './IndicateursMaintenance';\nimport Copilote from './Copilote';",
    ],
    [
      "{page === 'compte' && <MonCompte token={token} moi={moi} onLogout={logout} />}",
      "{page === 'compte' && <MonCompte token={token} moi={moi} onLogout={logout} />}\n        {page === 'copilote' && <Copilote token={token} moi={moi} />}",
    ],
  ],
  'Sidebar.js': [
    [
      "{(admin ? [...MENU, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }] : [...MENU, { id: 'compte', icon: '👤' }]).map(item => (",
      "{(admin ? [...MENU, { id: 'copilote', icon: '✨' }, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }] : [...MENU, { id: 'copilote', icon: '✨' }, { id: 'compte', icon: '👤' }]).map(item => (",
    ],
  ],
};

let erreurs = 0;
const resultats = {};
for (const [nom, modifs] of Object.entries(MODIFS)) {
  const fichier = path.join(__dirname, 'src', nom);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); erreurs++; continue; }
  let texte = fs.readFileSync(fichier, 'utf8');
  if (texte.includes("import Copilote from './Copilote'") || texte.includes("id: 'copilote'")) {
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
  fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_copilote.js.bak'));
  fs.writeFileSync(fichier, texte, 'utf8');
  console.log(`✅ ${nom} modifié (sauvegarde : ${nom.replace('.js', '.avant_copilote.js.bak')})`);
}
