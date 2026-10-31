// Ajoute la page « Workflows automatiques » dans App.js et dans le menu administrateur (Sidebar.js).
// Chaque fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_workflows.js
const fs = require('fs');
const path = require('path');

const MODIFS = {
  'App.js': [
    ["import Documents from './Documents';", "import Documents from './Documents';\nimport Workflows from './Workflows';", 1],
    ["{page === 'documents' && <Documents token={token} moi={moi} />}",
     "{page === 'documents' && <Documents token={token} moi={moi} />}\n        {page === 'workflows' && ['admin', 'superviseur'].includes(moi?.role) && <Workflows token={token} moi={moi} />}", 1],
  ],
  'Sidebar.js': [
    // menu administrateur uniquement (la page est réservée aux administrateurs et superviseurs)
    ["{ id: 'documents', icon: '📄' }, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }",
     "{ id: 'documents', icon: '📄' }, { id: 'workflows', icon: '⚙️' }, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }", 1],
  ],
};

let erreurs = 0;
const resultats = {};
for (const [nom, modifs] of Object.entries(MODIFS)) {
  const fichier = path.join(__dirname, 'src', nom);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); erreurs++; continue; }
  let texte = fs.readFileSync(fichier, 'utf8');
  if (texte.includes("import Workflows from './Workflows'") || texte.includes("id: 'workflows'")) {
    console.log(`ℹ️  ${nom} est déjà modifié : rien à faire`);
    continue;
  }
  for (const [avant, apres, attendu] of modifs) {
    const n = texte.split(avant).length - 1;
    if (n !== attendu) { console.log(`❌ ${nom} : passage trouvé ${n} fois au lieu de ${attendu} :\n   ${avant.slice(0, 90)}`); erreurs++; continue; }
    texte = texte.split(avant).join(apres);
  }
  resultats[nom] = texte;
}

if (erreurs) {
  console.log(`\n⛔ ${erreurs} problème(s) : aucun fichier n'a été modifié.`);
  process.exit(1);
}
for (const [nom, texte] of Object.entries(resultats)) {
  const fichier = path.join(__dirname, 'src', nom);
  fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_workflows.js.bak'));
  fs.writeFileSync(fichier, texte, 'utf8');
  console.log(`✅ ${nom} modifié (sauvegarde : ${nom.replace('.js', '.avant_workflows.js.bak')})`);
}
