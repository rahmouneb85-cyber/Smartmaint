// Ajoute la page « Documents » dans App.js et dans le menu (Sidebar.js).
// Chaque fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_documents.js
const fs = require('fs');
const path = require('path');

const MODIFS = {
  'App.js': [
    ["import Copilote from './Copilote';", "import Copilote from './Copilote';\nimport Documents from './Documents';", 1],
    ["{page === 'copilote' && <Copilote token={token} moi={moi} />}",
     "{page === 'copilote' && <Copilote token={token} moi={moi} />}\n        {page === 'documents' && <Documents token={token} moi={moi} />}", 1],
  ],
  'Sidebar.js': [
    // l'entrée Copilote apparaît deux fois (menu administrateur et menu des autres rôles)
    ["{ id: 'copilote', icon: '✨' }", "{ id: 'copilote', icon: '✨' }, { id: 'documents', icon: '📄' }", 2],
  ],
};

let erreurs = 0;
const resultats = {};
for (const [nom, modifs] of Object.entries(MODIFS)) {
  const fichier = path.join(__dirname, 'src', nom);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); erreurs++; continue; }
  let texte = fs.readFileSync(fichier, 'utf8');
  if (texte.includes("import Documents from './Documents'") || texte.includes("id: 'documents'")) {
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
  fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_documents.js.bak'));
  fs.writeFileSync(fichier, texte, 'utf8');
  console.log(`✅ ${nom} modifié (sauvegarde : ${nom.replace('.js', '.avant_documents.js.bak')})`);
}
