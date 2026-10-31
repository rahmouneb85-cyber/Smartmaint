// Modifie App.js et Sidebar.js pour la phase 2 de la sécurité (sessions, renouvellement des jetons, console Sécurité).
// Chaque fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_phase2.js
const fs = require('fs');
const path = require('path');

const MODIFS = {
  'App.js': [
    [
      "import './App.css';",
      "import './App.css';\nimport Securite from './Securite';\nimport { deconnecterServeur } from './api';",
    ],
    [
      "  const logout = () => { localStorage.removeItem('token'); setToken(null); };",
      `  const [moi, setMoi] = useState(null);   // utilisateur connecté (nom, rôle)
  const logoutLocal = () => { localStorage.removeItem('token'); setToken(null); setMoi(null); setPage('dashboard'); };
  // déconnexion réelle : la session est fermée sur le serveur, puis dans le navigateur
  const logout = () => { deconnecterServeur(localStorage.getItem('token')).finally(logoutLocal); };

  // jeton renouvelé automatiquement, ou session fermée à distance (voir api.js)
  useEffect(() => {
    const surJeton = (e) => setToken(e.detail);
    window.addEventListener('smartmaint-token', surJeton);
    window.addEventListener('smartmaint-logout', logoutLocal);
    return () => {
      window.removeEventListener('smartmaint-token', surJeton);
      window.removeEventListener('smartmaint-logout', logoutLocal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(\`\${API}/auth/me\`, { headers: { Authorization: \`Bearer \${token}\` } })
      .then(r => (r.ok ? r.json() : null)).then(setMoi).catch(() => {});
  }, [token]);`,
    ],
    [
      "onAssistant={() => setAssistantOpen(!assistantOpen)} assistantOpen={assistantOpen} />",
      "onAssistant={() => setAssistantOpen(!assistantOpen)} assistantOpen={assistantOpen}\n        admin={moi?.role === 'admin'} />",
    ],
    [
      "{page === 'interventions' && <Interventions token={token} onLogout={logout} />}",
      "{page === 'interventions' && <Interventions token={token} onLogout={logout} />}\n        {page === 'securite' && moi?.role === 'admin' && <Securite token={token} moi={moi} />}",
    ],
  ],
  'Sidebar.js': [
    [
      'function Sidebar({ page, setPage, onLogout, theme, toggleTheme, onAssistant, assistantOpen }) {',
      'function Sidebar({ page, setPage, onLogout, theme, toggleTheme, onAssistant, assistantOpen, admin }) {',
    ],
    [
      '{MENU.map(item => (',
      "{(admin ? [...MENU, { id: 'securite', icon: '🛡️' }] : MENU).map(item => (",
    ],
  ],
};

let erreurs = 0;
const resultats = {};
for (const [nom, modifs] of Object.entries(MODIFS)) {
  const fichier = path.join(__dirname, 'src', nom);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); erreurs++; continue; }
  let texte = fs.readFileSync(fichier, 'utf8');
  if (texte.includes("import Securite from './Securite'") || texte.includes("id: 'securite'")) {
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
  fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_phase2.js.bak'));
  fs.writeFileSync(fichier, texte, 'utf8');
  console.log(`✅ ${nom} modifié (sauvegarde : ${nom.replace('.js', '.avant_phase2.js.bak')})`);
}
