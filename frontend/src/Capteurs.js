import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmer } from './Confirmation';

const API = 'http://localhost:8001/api/v1';

const VIDE = { equipement_id: '', type: 'temperature', unite: '°C', actif: true, seuil_min: '', seuil_max: '' };

const UNITES = { temperature: '°C', pression: 'bar', vibration: 'mm/s', courant: 'A' };

const inputStyle = {
  width: '100%', padding: '10px', background: 'var(--input)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit'
};

// Champ vide → null (pas de seuil), sinon nombre
const versNombre = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function Capteurs({ token, onLogout }) {
  const { t } = useTranslation();
  const [capteurs, setCapteurs] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [form, setForm] = useState(VIDE);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

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
    return res.json();
  };

  const traduireErreur = (e) => {
    const m = e.message.match(/(\d+) mesures/);
    if (m) return t('capteurs.deleteBlocked', { count: m[1] });
    return t('common.error', { code: e.status || '' });
  };

  const charger = async () => {
    try {
      const c = await apiCall(`${API}/capteurs/`);
      const e = await apiCall(`${API}/equipements/`);
      setCapteurs(Array.isArray(c) ? c : []);
      setEquipements(Array.isArray(e) ? e : []);
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  useEffect(() => { charger(); }, []);

  const nomEquipement = (id) => {
    const eq = equipements.find(e => e.id === id);
    return eq ? eq.nom : '⚠️ ' + t('common.none');
  };

  const nomType = (type) => t('types.' + type, { defaultValue: type });

  const afficherSeuils = (c) => {
    if (c.seuil_min == null && c.seuil_max == null) return '—';
    const min = c.seuil_min != null ? c.seuil_min : '—';
    const max = c.seuil_max != null ? c.seuil_max : '—';
    return `${min} → ${max} ${c.unite || ''}`;
  };

  const annuler = () => { setForm(VIDE); setEditId(null); setShowForm(false); };

  const changerType = (type) => {
    setForm({ ...form, type, unite: UNITES[type] || form.unite });
  };

  const enregistrer = async () => {
    if (!form.equipement_id) { setMessage('❌ ' + t('capteurs.equipementRequired')); return; }

    const seuilMin = versNombre(form.seuil_min);
    const seuilMax = versNombre(form.seuil_max);
    if (seuilMin !== null && seuilMax !== null && seuilMin >= seuilMax) {
      setMessage('❌ ' + t('capteurs.seuilsInvalides', { defaultValue: 'Le seuil min doit être inférieur au seuil max' }));
      return;
    }

    const body = { ...form, equipement_id: Number(form.equipement_id), seuil_min: seuilMin, seuil_max: seuilMax };
    try {
      if (editId) {
        await apiCall(`${API}/capteurs/${editId}`, 'PUT', body);
        setMessage('✅ ' + t('capteurs.modified'));
      } else {
        await apiCall(`${API}/capteurs/`, 'POST', body);
        setMessage('✅ ' + t('capteurs.added'));
      }
      annuler();
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const modifier = (c) => {
    setForm({
      equipement_id: c.equipement_id || '', type: c.type, unite: c.unite, actif: c.actif,
      seuil_min: c.seuil_min ?? '', seuil_max: c.seuil_max ?? ''
    });
    setEditId(c.id);
    setShowForm(true);
    setMessage('');
  };

  // On n'envoie que le champ modifié : les seuils et le reste ne sont pas touchés
  const basculerActif = async (c) => {
    try {
      await apiCall(`${API}/capteurs/${c.id}`, 'PUT', { actif: !c.actif });
      setMessage('✅ ' + (c.actif ? t('capteurs.deactivated') : t('capteurs.activated')));
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const supprimer = async (c) => {
    if (!(await confirmer(t('capteurs.confirmDelete', { id: c.id, type: nomType(c.type) })))) return;
    try {
      await apiCall(`${API}/capteurs/${c.id}`, 'DELETE');
      setMessage('✅ ' + t('capteurs.deleted'));
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const th = { padding: '12px', textAlign: 'start' };
  const td = { padding: '12px' };
  const petitBouton = (bg, color) => ({ background: bg, border: 'none', color, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', marginInlineEnd: '6px', fontFamily: 'inherit' });
  const labelStyle = { color: 'var(--muted)', fontSize: '12px', display: 'block', marginBottom: '4px' };

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', padding: '25px' }}>

      {/* EN-TÊTE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>📡 {t('capteurs.title')}</h2>
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
          <h3 style={{ color: 'var(--text)', marginTop: 0 }}>{editId ? '✏️ ' + t('common.edit') : '➕ ' + t('capteurs.new')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <select style={inputStyle} value={form.equipement_id}
              onChange={e => setForm({ ...form, equipement_id: e.target.value })}>
              <option value="">{t('capteurs.choisirEquipement')}</option>
              {equipements.map(eq => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
            </select>
            <select style={inputStyle} value={form.type} onChange={e => changerType(e.target.value)}>
              {Object.keys(UNITES).map(type => <option key={type} value={type}>{nomType(type)}</option>)}
            </select>
            <input style={inputStyle} placeholder={t('capteurs.unite')} value={form.unite}
              onChange={e => setForm({ ...form, unite: e.target.value })} />
            <label style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={form.actif}
                onChange={e => setForm({ ...form, actif: e.target.checked })} />
              {t('capteurs.actifLabel')}
            </label>

            {/* SEUILS D'ALERTE */}
            <div>
              <span style={labelStyle}>⬇️ {t('capteurs.seuilMin', { defaultValue: 'Seuil min' })} ({form.unite})</span>
              <input style={inputStyle} type="number" step="any" dir="ltr" value={form.seuil_min}
                placeholder={t('capteurs.aucunSeuil', { defaultValue: 'Aucun seuil' })}
                onChange={e => setForm({ ...form, seuil_min: e.target.value })} />
            </div>
            <div>
              <span style={labelStyle}>⬆️ {t('capteurs.seuilMax', { defaultValue: 'Seuil max' })} ({form.unite})</span>
              <input style={inputStyle} type="number" step="any" dir="ltr" value={form.seuil_max}
                placeholder={t('capteurs.aucunSeuil', { defaultValue: 'Aucun seuil' })}
                onChange={e => setForm({ ...form, seuil_max: e.target.value })} />
            </div>
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
              <th style={th}>{t('capteurs.equipement')}</th>
              <th style={th}>{t('capteurs.type')}</th>
              <th style={th}>{t('capteurs.unite')}</th>
              <th style={th}>{t('capteurs.seuils', { defaultValue: 'Seuils (min → max)' })}</th>
              <th style={th}>{t('capteurs.etat')}</th>
              <th style={th}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {capteurs.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, color: 'var(--muted)' }}>{c.id}</td>
                <td style={{ ...td, fontWeight: 'bold' }}>{nomEquipement(c.equipement_id)}</td>
                <td style={td}>{nomType(c.type)}</td>
                <td style={td} dir="ltr">{c.unite}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: (c.seuil_min == null && c.seuil_max == null) ? 'var(--muted)' : 'var(--text)' }} dir="ltr">
                  {afficherSeuils(c)}
                </td>
                <td style={td}>
                  <span style={{
                    background: c.actif ? 'color-mix(in srgb, var(--succes) 13%, transparent)' : '#88888822',
                    color: c.actif ? 'var(--succes)' : 'var(--muted)',
                    padding: '4px 10px', borderRadius: '12px', fontSize: '12px', whiteSpace: 'nowrap'
                  }}>
                    {c.actif ? t('statuts.actif') : t('statuts.inactif')}
                  </span>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => modifier(c)} style={petitBouton('#1e3a8a', '#93c5fd')}>
                    ✏️ {t('common.edit')}
                  </button>
                  <button onClick={() => basculerActif(c)} style={petitBouton('#78350f', '#fcd34d')}>
                    {c.actif ? '⏸️ ' + t('capteurs.deactivate') : '▶️ ' + t('capteurs.activate')}
                  </button>
                  <button onClick={() => supprimer(c)} style={petitBouton('#7f1d1d', '#fca5a5')}>
                    🗑️ {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
            {capteurs.length === 0 && (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>{t('capteurs.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Capteurs;