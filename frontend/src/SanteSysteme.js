import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';

// Santé du système (administrateurs et superviseurs) : état de chaque composant, actualisé chaque minute
const ETATS = {
  ok: { couleur: 'var(--succes)', icone: '✅', libelle: 'Opérationnel' },
  attention: { couleur: 'var(--attention)', icone: '⚠️', libelle: 'Mode dégradé' },
  panne: { couleur: 'var(--danger)', icone: '⛔', libelle: 'En panne' },
};

function SanteSysteme({ token }) {
  const { t } = useTranslation();
  const tr = (cle, defaut) => t('sante.' + cle, { defaultValue: defaut });
  const [sante, setSante] = useState(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let actif = true;
    const charger = () => fetch(`${API}/sante`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (actif) setSante(d); }).catch(() => {});
    charger();
    const intervalle = setInterval(charger, 60000);
    return () => { actif = false; clearInterval(intervalle); };
  }, [token]);

  if (!sante) return null;
  const global = ETATS[sante.etat] || ETATS.attention;
  const problemes = sante.composants.filter(c => c.etat !== 'ok').length;

  return (
    <section aria-labelledby="sante-titre" style={{ background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', borderInlineStart: `4px solid ${global.couleur}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 id="sante-titre" style={{ margin: 0, fontSize: '1.05em', color: 'var(--text, white)' }}>
          <span aria-hidden="true">🩺 </span>{tr('titre', 'Santé du système')}
        </h2>
        <span style={{ color: global.couleur, fontWeight: 'bold' }}>
          <span aria-hidden="true">{global.icone} </span>{tr(sante.etat, global.libelle)}
        </span>
        {problemes > 0 && <span style={{ color: 'var(--muted, #888)', fontSize: '13px' }}>{tr('aVerifier', '{{n}} point(s) à vérifier').replace('{{n}}', problemes)}</span>}
        <button onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-controls="sante-detail"
          style={{ marginInlineStart: 'auto', background: 'transparent', border: '1px solid var(--border, #2a2d3e)', color: 'var(--text, white)', borderRadius: '8px', padding: '8px 14px', minHeight: '40px', cursor: 'pointer', fontFamily: 'inherit' }}>
          {ouvert ? tr('masquer', 'Masquer le détail') : tr('detail', 'Voir le détail')}
        </button>
      </div>
      {ouvert && (
        <ul id="sante-detail" style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
          {sante.composants.map(c => {
            const e = ETATS[c.etat] || ETATS.attention;
            return (
              <li key={c.composant} style={{ background: 'var(--bg, #0f1117)', borderRadius: '8px', padding: '10px 12px', borderInlineStart: `3px solid ${e.couleur}` }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                  <span aria-hidden="true">{e.icone} </span>{tr('c.' + c.composant, c.composant)}
                  <span className="visuellement-cache"> : {tr(c.etat, e.libelle)}</span>
                </div>
                <div style={{ color: 'var(--muted, #888)', fontSize: '12px', marginTop: '4px' }}>{c.message}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default SanteSysteme;
