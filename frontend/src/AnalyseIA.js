import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

const API = 'http://localhost:8001/api/v1';
const COULEURS = { normal: 'var(--succes)', suspect: 'var(--attention)', anomalie: 'var(--danger)' };
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };

function AnalyseIA({ token, equipements, onLogout }) {
  const { t, i18n } = useTranslation();
  const [analyse, setAnalyse] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState('');

  const entetes = { Authorization: `Bearer ${token}` };

  // Récupère le score d'anomalie de chaque capteur (toutes les 10 secondes)
  const charger = async () => {
    try {
      const res = await fetch(`${API}/ia/analyse?nb_points=50`, { headers: entetes });
      if (res.status === 401 || res.status === 403) { onLogout(); return; }
      const d = await res.json();
      setAnalyse(Array.isArray(d) ? d : []);
    } catch (e) { /* le bandeau d'erreur du dashboard signale déjà un serveur injoignable */ }
  };

  useEffect(() => {
    charger();
    const intervalle = setInterval(charger, 10000);
    return () => clearInterval(intervalle);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  }, [token]);

  // Réentraîne les modèles sur les mesures les plus récentes
  const reentrainer = async () => {
    setEnCours(true); setMessage('');
    try {
      const res = await fetch(`${API}/ia/entrainer`, { method: 'POST', headers: entetes });
      if (res.status === 401 || res.status === 403) { onLogout(); return; }
      if (!res.ok) throw new Error();
      setMessage('✅ ' + t('ia.succes'));
      charger();
    } catch (e) {
      setMessage('❌ ' + t('common.error', { code: '' }));
    }
    setEnCours(false);
  };

  const nomEquipement = (id) => equipements.find(e => e.id === id)?.nom || '-';
  const formatDate = (d) => d
    ? new Date(d).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : '-';

  return (
    <div style={{ background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>

      {/* EN-TÊTE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
        <div>
          <h2 style={{ fontSize: '1.17em', color: 'var(--accent)', margin: 0 }}>🧠 {t('ia.titre')}</h2>
          <div style={{ color: 'var(--muted, #888)', fontSize: '12px', marginTop: '4px' }}>{t('ia.sousTitre')}</div>
        </div>
        <button onClick={reentrainer} disabled={enCours}
          style={{ background: '#7c3aed', border: 'none', color: 'white', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', opacity: enCours ? 0.6 : 1 }}>
          {enCours ? '⏳ ' + t('ia.enCours') : '🔄 ' + t('ia.reentrainer')}
        </button>
      </div>

      {message && <p style={{ color: message.startsWith('✅') ? 'var(--succes)' : 'var(--danger)', marginTop: 0 }}>{message}</p>}

      {analyse.length === 0 && <p style={{ color: 'var(--muted, #888)' }}>{t('ia.aucun')}</p>}

      {/* UNE CARTE PAR CAPTEUR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '15px' }}>
        {analyse.map(c => {
          const couleur = COULEURS[c.etat] || '#888';
          return (
            <div key={c.capteur_id} style={{ background: 'var(--bg, #0f1117)', borderRadius: '10px', padding: '14px', borderInlineStart: `4px solid ${c.entraine ? couleur : '#888'}` }}>

              {/* Capteur et état */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{nomEquipement(c.equipement_id)}</div>
                  <div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>
                    {t('types.' + c.type, { defaultValue: c.type })} · id {c.capteur_id}
                  </div>
                </div>
                {c.entraine && c.etat && (
                  <span style={{ background: `color-mix(in srgb, ${couleur} 13%, transparent)`, color: couleur, padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {t('ia.etats.' + c.etat)}
                  </span>
                )}
              </div>

              {!c.entraine ? (
                <p style={{ color: 'var(--muted, #888)', fontSize: '13px' }}>{t('ia.nonEntraine')}</p>
              ) : (
                <>
                  {/* Score d'anomalie avec jauge */}
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted, #888)' }}>{t('ia.score')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold', color: couleur }} dir="ltr">{c.score ?? '-'} %</div>
                    <div style={{ flex: 1, height: '8px', background: 'var(--border, #2a2d3e)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${c.score || 0}%`, height: '100%', background: couleur }} />
                    </div>
                  </div>

                  {/* Évolution du score sur les 50 dernières mesures (toujours de gauche à droite) */}
                  <div dir="ltr" style={{ height: '60px', marginTop: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={c.serie || []}>
                        <YAxis domain={[0, 100]} hide />
                        <ReferenceLine y={95} stroke="#f59e0b" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="score" stroke={couleur} strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Valeurs */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px' }}>
                    <span>{t('ia.derniereValeur')} : <strong dir="ltr">{c.derniere_valeur} {c.unite}</strong></span>
                    <span style={{ color: 'var(--muted, #888)' }}>{t('ia.moyenne')} : <span dir="ltr">{c.moyenne_normale} {c.unite}</span></span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #888)', marginTop: '6px' }}>
                    {t('ia.recentes', { a: c.anomalies_recentes, s: c.suspects_recents })}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--muted, #888)', marginTop: '4px' }}>
                    {t('ia.entraineLe', { date: formatDate(c.date_entrainement), n: c.mesures_entrainement })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnalyseIA;