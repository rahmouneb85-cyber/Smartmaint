// Ajoute l'assistance intelligente à la saisie dans Interventions.js :
// autocomplétion des champs texte, dictée, reformulation, et bouton « Proposer » (ordre d'intervention et compte rendu).
// Le fichier est sauvegardé avant modification. Si un passage attendu est introuvable, RIEN n'est modifié.
// Utilisation (depuis le dossier frontend) : node patch_saisie.js
const fs = require('fs');
const path = require('path');

const MODIFS = [
  [
    "import RapportMaintenance from './RapportMaintenance';",
    "import RapportMaintenance from './RapportMaintenance';\nimport { ChampIntelligent, PropositionsIntelligentes } from './SaisieIntelligente';"
  ],
  [
    "          <span style={{ ...labelStyle, marginTop: '12px' }}>{t('interventions.description')}</span>\n          <textarea style={{ ...inputStyle, minHeight: '80px' }}\n            placeholder={t('interventions.descriptionPlaceholder')} value={form.description}\n            onChange={e => setForm({ ...form, description: e.target.value })} />",
    "          <span style={{ ...labelStyle, marginTop: '12px' }}>{t('interventions.description')}</span>\n          <ChampIntelligent token={token} champ=\"description\" equipementId={form.equipement_id} style={inputStyle} minHeight=\"80px\"\n            placeholder={t('interventions.descriptionPlaceholder')} value={form.description}\n            onChange={v => setForm(f => ({ ...f, description: v }))} />\n          <PropositionsIntelligentes token={token} techniciens={techniciens}\n            demande={{ equipement_id: form.equipement_id, description: form.description, alerte_id: form.alerte_id, type_intervention: form.type_intervention,\n              champs: ['description', 'priorite', 'type_intervention', 'technicien_id', 'date_intervention', 'diagnostic', 'actions_realisees', 'pieces_remplacees'] }}\n            onAppliquer={v => setForm(f => {\n              const n = { ...f };\n              ['description', 'priorite', 'type_intervention', 'technicien_id', 'date_intervention'].forEach(k => { if (v[k] !== undefined) n[k] = v[k]; });\n              // le diagnostic probable, les actions et les pièces à prévoir complètent la description de l'ordre\n              const ajouts = [['diagnostic', t('saisie.diagProbable', { defaultValue: 'Diagnostic probable' })], ['actions_realisees', t('saisie.actionsPrevues', { defaultValue: 'Actions à prévoir' })], ['pieces_remplacees', t('saisie.piecesPrevoir', { defaultValue: 'Pièces à prévoir' })]]\n                .filter(([k]) => v[k]).map(([k, l]) => `${l} : ${v[k]}`);\n              if (ajouts.length) n.description = [n.description, ...ajouts].filter(Boolean).join('\\n');\n              return n;\n            })} />"
  ],
  [
    "<span style={labelStyle}>{t('interventions.diagnostic', { defaultValue: 'Diagnostic (cause trouvée)' })}</span>\n            <textarea style={{ ...inputStyle, minHeight: '60px', marginBottom: '10px' }} value={rapport.diagnostic}\n              onChange={e => setRapport({ ...rapport, diagnostic: e.target.value })} />",
    "<PropositionsIntelligentes token={token} libelle={t('saisie.preremplir', { defaultValue: 'Préremplir le compte rendu' })}\n              demande={{ equipement_id: cloture.equipement_id, description: cloture.description, alerte_id: cloture.alerte_id,\n                type_intervention: cloture.type_intervention, intervention_id: cloture.id, champs: ['diagnostic', 'actions_realisees', 'pieces_remplacees'] }}\n              onAppliquer={v => setRapport(r => ({ ...r, ...v }))} />\n\n            <span style={labelStyle}>{t('interventions.diagnostic', { defaultValue: 'Diagnostic (cause trouvée)' })}</span>\n            <ChampIntelligent token={token} champ=\"diagnostic\" equipementId={cloture.equipement_id} style={inputStyle} minHeight=\"60px\"\n              value={rapport.diagnostic} onChange={v => setRapport(r => ({ ...r, diagnostic: v }))} />"
  ],
  [
    "<textarea style={{ ...inputStyle, minHeight: '80px', marginBottom: '10px' }} value={rapport.actions_realisees}\n              onChange={e => setRapport({ ...rapport, actions_realisees: e.target.value })} />",
    "<ChampIntelligent token={token} champ=\"actions_realisees\" equipementId={cloture.equipement_id} style={inputStyle} minHeight=\"80px\"\n              value={rapport.actions_realisees} onChange={v => setRapport(r => ({ ...r, actions_realisees: v }))} />"
  ],
  [
    "<textarea style={{ ...inputStyle, minHeight: '50px', marginBottom: '10px' }} value={rapport.pieces_remplacees}\n              onChange={e => setRapport({ ...rapport, pieces_remplacees: e.target.value })} />",
    "<ChampIntelligent token={token} champ=\"pieces_remplacees\" equipementId={cloture.equipement_id} style={inputStyle} minHeight=\"50px\"\n              value={rapport.pieces_remplacees} onChange={v => setRapport(r => ({ ...r, pieces_remplacees: v }))} />"
  ],
  [
    "<textarea style={{ ...inputStyle, minHeight: '50px' }} value={rapport.observations}\n              onChange={e => setRapport({ ...rapport, observations: e.target.value })} />",
    "<ChampIntelligent token={token} champ=\"observations\" equipementId={cloture.equipement_id} style={inputStyle} minHeight=\"50px\"\n              value={rapport.observations} onChange={v => setRapport(r => ({ ...r, observations: v }))} />"
  ]
];

const fichier = path.join(__dirname, 'src', 'Interventions.js');
if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); process.exit(1); }
let texte = fs.readFileSync(fichier, 'utf8');
if (texte.includes("from './SaisieIntelligente'")) { console.log('ℹ️  Interventions.js est déjà modifié : rien à faire'); process.exit(0); }
const crlf = texte.includes('\r\n');
if (crlf) texte = texte.replace(/\r\n/g, '\n');        // fichiers Windows : fins de ligne normalisées le temps du remplacement
let erreurs = 0;
for (const [avant, apres] of MODIFS) {
  const n = texte.split(avant).length - 1;
  if (n !== 1) { console.log(`❌ Passage trouvé ${n} fois au lieu d'une :\n   ${avant.slice(0, 100)}`); erreurs++; continue; }
  texte = texte.replace(avant, () => apres);
}
if (erreurs) { console.log(`\n⛔ ${erreurs} problème(s) : Interventions.js n'a pas été modifié.`); process.exit(1); }
if (crlf) texte = texte.replace(/\n/g, '\r\n');
fs.copyFileSync(fichier, fichier.replace(/\.js$/, '.avant_saisie.js.bak'));
fs.writeFileSync(fichier, texte, 'utf8');
console.log('✅ Interventions.js modifié (sauvegarde : Interventions.avant_saisie.js.bak)');
