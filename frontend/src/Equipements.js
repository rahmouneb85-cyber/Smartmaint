import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FicheEquipement from './FicheEquipement';
import { confirmer } from './Confirmation';

const API = 'http://localhost:8001/api/v1';

const VIDE = { nom: '', type: '', localisation: '', statut: 'actif', date_installation: '' };

const COULEURS = { actif: 'var(--succes)', maintenance: 'var(--attention)', panne: 'var(--danger)' };

const inputStyle = {
  width: '100%', padding: '10px', background: 'var(--input)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit'
};

function Equipements({ token, onLogout }) {
  const { t } = useTranslation();
  const [equipements, setEquipements] = useState([]);
  const [form, setForm] = useState(VIDE);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [ficheId, setFicheId] = useState(null);   // équipement dont on affiche la fiche de suivi

  const apiCall = async (url, method = 'GET', body = null) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : null,
    });
    if (res.status === 401 || res.status === 403) { onLogout(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e = new Error(typeof err.detail === 'string' ? err.detail : '');
      e.status = res.status;
      throw e;
    }
    return res.status === 204 ? true : res.json();
  };

  const traduireErreur = (e) => {
    const m = e.message.match(/(\d+) capteur/);
    if (m) return t('equipements.deleteBlocked', { count: m[1] });
    return t('common.error', { code: e.status || '' });
  };

  const charger = async () => {
    try {
      const d = await apiCall(`${API}/equipements/`);
      setEquipements(Array.isArray(d) ? d : []);
    } catch (e) { setMessage('❌ ' + traduireErreur(e)); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  useEffect(() => { charger(); }, []);

  const annuler = () => { setForm(VIDE); setEditId(null); setShowForm(false); };

  const enregistrer = async () => {
    if (!form.nom.trim()) { setMessage('❌ ' + t('equipements.nomRequired')); return; }
    const body = { ...form, date_installation: form.date_installation || null };
    try {
      if (editId) {
        await apiCall(`${API}/equipements/${editId}`, 'PUT', body);
        setMessage('✅ ' + t('equipements.modified'));
      } else {
        await apiCall(`${API}/equipements/`, 'POST', body);
        setMessage('✅ ' + t('equipements.added'));
      }
      annuler();
      charger();
    } catch (e) { setMessage('❌ ' + traduireErreur(e)); }
  };

  const modifier = (eq) => {
    setForm({
      nom: eq.nom || '',
      type: eq.type || '',
      localisation: eq.localisation || '',
      statut: eq.statut || 'actif',
      date_installation: eq.date_installation ? eq.date_installation.slice(0, 10) : ''
    });
    setEditId(eq.id);
    setShowForm(true);
    setMessage('');
  };

  const supprimer = async (eq) => {
    if (!(await confirmer(t('equipements.confirmDelete', { nom: eq.nom })))) return;
    try {
      await apiCall(`${API}/equipements/${eq.id}`, 'DELETE');
      setMessage('✅ ' + t('equipements.deleted'));
      charger();
    } catch (e) { setMessage('❌ ' + traduireErreur(e)); }
  };

  const th = { padding: '12px', textAlign: 'start' };
  const td = { padding: '12px' };
  const petitBouton = (bg, color) => ({ background: bg, border: 'none', color, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', marginInlineEnd: '6px', fontFamily: 'inherit' });

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', padding: '25px' }}>

      {/* EN-TÊTE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>🏭 {t('equipements.title')}</h2>
        {!showForm && (
          <button onClick={() => { setShowForm(true); setMessage(''); }}
            style={{ background: 'var(--accent-fond)', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>
            ➕ {t('common.add')}
          </button>
        )}
      </div>

      {message && <p style={{ color: message.startsWith('✅') ? 'var(--succes)' : 'var(--danger)' }}>{message}</p>}

      {/* FORMULAIRE */}
      {showForm && (
        <div style={{ background: 'var(--input)', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid var(--accent)' }}>
          <h3 style={{ color: 'var(--text)', marginTop: 0 }}>{editId ? '✏️ ' + t('common.edit') : '➕ ' + t('equipements.new')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <input style={inputStyle} placeholder={t('equipements.nomPlaceholder')} value={form.nom}
              onChange={e => setForm({ ...form, nom: e.target.value })} />
            <input style={inputStyle} placeholder={t('equipements.typePlaceholder')} value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })} />
            <input style={inputStyle} placeholder={t('equipements.localisation')} value={form.localisation}
              onChange={e => setForm({ ...form, localisation: e.target.value })} />
            <select style={inputStyle} value={form.statut}
              onChange={e => setForm({ ...form, statut: e.target.value })}>
              <option value="actif">{t('statuts.actif')}</option>
              <option value="maintenance">{t('statuts.maintenance')}</option>
              <option value="panne">{t('statuts.panne')}</option>
            </select>
            <input style={inputStyle} type="date" value={form.date_installation}
              onChange={e => setForm({ ...form, date_installation: e.target.value })} />
          </div>
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button onClick={enregistrer}
              style={{ background: 'var(--succes-fond)', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>
              💾 {t('common.save')}
            </button>
            <button onClick={annuler}
              style={{ background: '#333', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* TABLEAU */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text)' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--accent)' }}>
              <th style={th}>{t('common.id')}</th>
              <th style={th}>{t('equipements.nom')}</th>
              <th style={th}>{t('equipements.type')}</th>
              <th style={th}>{t('equipements.localisation')}</th>
              <th style={th}>{t('equipements.statut')}</th>
              <th style={th}>{t('equipements.installation')}</th>
              <th style={th}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {equipements.map(eq => {
              const couleur = COULEURS[eq.statut] || '#888';
              return (
                <tr key={eq.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, color: 'var(--muted)' }}>{eq.id}</td>
                  <td style={{ ...td, fontWeight: 'bold' }}>{eq.nom}</td>
                  <td style={td}>{eq.type || '-'}</td>
                  <td style={td}>{eq.localisation || '-'}</td>
                  <td style={td}>
                    <span style={{ background: `color-mix(in srgb, ${couleur} 13%, transparent)`, color: couleur, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {t('statuts.' + eq.statut, { defaultValue: eq.statut })}
                    </span>
                  </td>
                  <td style={td}>{eq.date_installation ? eq.date_installation.slice(0, 10) : '-'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setFicheId(eq.id)} style={petitBouton('#4c1d95', '#c4b5fd')}>
                      📄 {t('fiche.bouton', { defaultValue: 'Fiche' })}
                    </button>
                    <button onClick={() => modifier(eq)} style={petitBouton('#1e3a8a', '#93c5fd')}>
                      ✏️ {t('common.edit')}
                    </button>
                    <button onClick={() => supprimer(eq)} style={petitBouton('#7f1d1d', '#fca5a5')}>
                      🗑️ {t('common.delete')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {equipements.length === 0 && (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>{t('equipements.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* FICHE DE SUIVI D'ÉQUIPEMENT (prévisualisation, impression, PDF) */}
      {ficheId && <FicheEquipement equipementId={ficheId} token={token} onClose={() => setFicheId(null)} />}
    </div>
  );
}

export default Equipements;
