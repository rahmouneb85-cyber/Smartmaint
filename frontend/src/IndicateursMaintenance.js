import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';

// Indicateurs de maintenance des 30 derniers jours (MTTR, MTBF, disponibilité) pour le tableau de bord
function IndicateursMaintenance({ token }) {
  const { t } = useTranslation();
  const tr = (cle, defaut) => t('indicateurs.' + cle, { defaultValue: defaut });
  const [data, setData] = useState(null);

  useEffect(() => {
    let actif = true;
    const charger = () => fetch(`${API}/rapports/indicateurs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (actif && d) setData(d); }).catch(() => {});
    charger();
    const intervalle = setInterval(charger, 60000);
    return () => { actif = false; clearInterval(intervalle); };
  }, [token]);

  if (!data) return null;
  const s = data.synthese;
  const couleurDispo = (v) => (v == null ? '#888' : v >= 99 ? 'var(--succes)' : v >= 95 ? 'var(--attention)' : 'var(--danger)');
  const minutes = (m) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '20px', marginBottom: '20px' };
  const th = { textAlign: 'start', padding: '8px', color: 'var(--muted, #888)', fontSize: '12px', borderBottom: '1px solid var(--border, #2a2d3e)' };
  const td = { padding: '8px', fontSize: '13px', borderBottom: '1px solid var(--border, #2a2d3e)' };

  return (
    <div style={carte}>
      <h2 style={{ fontSize: '1.17em', color: 'var(--accent)', marginTop: 0 }}>🛠️ {tr('titre', 'Indicateurs de maintenance (30 jours)')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          [tr('mttr', 'MTTR (temps moyen de réparation)'), minutes(s.mttr_minutes), '#8b5cf6'],
          [tr('dispo', 'Disponibilité moyenne'), s.disponibilite_moyenne != null ? `${s.disponibilite_moyenne} %` : '—', couleurDispo(s.disponibilite_moyenne)],
          [tr('interventions', 'Interventions terminées / ouvertes'), `${s.nb_terminees} / ${s.nb_ouvertes}`, 'var(--info)'],
          [tr('graves', 'Alertes graves sans intervention'), s.graves_non_traitees, s.graves_non_traitees ? 'var(--danger)' : 'var(--succes)'],
        ].map(([label, valeur, couleur]) => (
          <div key={label} style={{ background: 'var(--bg, #0f1117)', borderRadius: '10px', padding: '12px', borderInlineStart: `4px solid ${couleur}` }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: couleur }}>{valeur}</div>
            <div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{tr('equipement', 'Équipement')}</th><th style={th}>{tr('pannes', 'Pannes')}</th>
            <th style={th}>MTTR</th><th style={th}>MTBF</th><th style={th}>{tr('disponibilite', 'Disponibilité')}</th>
          </tr></thead>
          <tbody>
            {data.equipements.map(e => (
              <tr key={e.id}>
                <td style={td}><b>{e.nom}</b></td>
                <td style={td}>{e.nb_pannes}</td>
                <td style={td}>{minutes(e.mttr_minutes)}</td>
                <td style={td}>{e.mtbf_heures != null ? `${e.mtbf_heures} h` : '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '60px', height: '8px', background: 'var(--bg, #0f1117)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, e.disponibilite))}%`, height: '100%', background: couleurDispo(e.disponibilite) }} />
                    </div>
                    <span style={{ color: couleurDispo(e.disponibilite), fontWeight: 'bold', minWidth: '62px' }}>{e.disponibilite} %</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IndicateursMaintenance;
