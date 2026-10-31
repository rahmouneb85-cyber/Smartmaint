import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BonIntervention from './BonIntervention';
import RapportMaintenance from './RapportMaintenance';
import { ChampIntelligent, PropositionsIntelligentes } from './SaisieIntelligente';
import { confirmer } from './Confirmation';

const API = 'http://localhost:8001/api/v1';

const VIDE = {
  equipement_id: '', technicien_id: '', alerte_id: '', type_intervention: 'corrective',
  priorite: 'normale', description: '', statut: 'planifiee', date_intervention: ''
};

const RAPPORT_VIDE = { diagnostic: '', actions_realisees: '', pieces_remplacees: '', observations: '' };

const COULEURS = { planifiee: 'var(--info)', en_cours: 'var(--attention)', terminee: 'var(--succes)' };
const COULEURS_PRIORITE = { basse: 'var(--neutre)', normale: 'var(--info)', haute: 'var(--orange)', urgente: 'var(--danger)' };

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };

const inputStyle = {
  width: '100%', padding: '10px', background: 'var(--input)', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit'
};
const labelStyle = { color: 'var(--muted)', fontSize: '12px', display: 'block', marginBottom: '4px' };

function Interventions({ token, onLogout, moi }) {
  const { t, i18n } = useTranslation();
  const [interventions, setInterventions] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [techniciens, setTechniciens] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [form, setForm] = useState(VIDE);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [showRapport, setShowRapport] = useState(false); // rapport de maintenance sur une période
  const [bon, setBon] = useState(null);           // intervention dont on affiche le document
  const [cloture, setCloture] = useState(null);   // intervention dont on remplit le compte rendu
  const [rapport, setRapport] = useState(RAPPORT_VIDE);

  // Requête avec token + gestion des erreurs
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

  // Traduit les messages d'erreur du backend (écrits en français)
  const traduireErreur = (e) => {
    if (e.message.includes('quipement introuvable')) return t('interventions.equipementIntrouvable');
    if (e.message.includes('echnicien introuvable')) return t('interventions.technicienIntrouvable');
    if (e.message.includes('lerte introuvable')) return t('interventions.alerteIntrouvable', { defaultValue: 'Alerte introuvable' });
    if (e.message.includes('Compte rendu obligatoire')) return t('interventions.rapportObligatoire', { defaultValue: 'Compte rendu obligatoire : indiquez les actions réalisées' });
    return t('common.error', { code: e.status || '' });
  };

  const charger = async () => {
    try {
      const i = await apiCall(`${API}/interventions/`);
      const e = await apiCall(`${API}/equipements/`);
      const tech = await apiCall(`${API}/interventions/techniciens`);
      setInterventions(Array.isArray(i) ? i : []);
      setEquipements(Array.isArray(e) ? e : []);
      setTechniciens(Array.isArray(tech) ? tech : []);
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
    // Les alertes servent seulement à relier une intervention à sa cause : une erreur ici ne bloque rien
    try {
      const a = await apiCall(`${API}/alertes/`);
      setAlertes(Array.isArray(a) ? a : []);
    } catch { setAlertes([]); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  useEffect(() => { charger(); }, []);

  const nomEquipement = (id) => equipements.find(e => e.id === id)?.nom || '⚠️ ' + t('common.none');
  const nomTechnicien = (id) => techniciens.find(x => x.id === id)?.nom || t('common.notAssigned');
  const formatDate = (d) => d
    ? new Date(d).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    : '-';
  const nomType = (v) => t('interventions.types.' + v, { defaultValue: v === 'preventive' ? 'Préventive' : 'Corrective' });
  const nomPriorite = (v) => t('interventions.priorites.' + v, { defaultValue: v });

  // Alertes proposées : les 15 plus récentes de l'équipement choisi
  const alertesEquipement = alertes
    .filter(a => String(a.equipement_id) === String(form.equipement_id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 15);

  const annuler = () => { setForm(VIDE); setEditId(null); setShowForm(false); };

  // Données de l'ordre d'intervention envoyées à l'API (le compte rendu n'est jamais écrasé)
  const versApi = (x) => ({
    equipement_id: Number(x.equipement_id),
    technicien_id: x.technicien_id ? Number(x.technicien_id) : null,
    alerte_id: x.alerte_id ? Number(x.alerte_id) : null,
    type_intervention: x.type_intervention,
    priorite: x.priorite,
    description: x.description,
    statut: x.statut,
    date_intervention: x.date_intervention || null,
  });

  const enregistrer = async () => {
    if (!form.equipement_id) { setMessage('❌ ' + t('capteurs.equipementRequired')); return; }
    if (!form.description.trim()) { setMessage('❌ ' + t('interventions.descriptionRequired')); return; }
    // Passer à « terminée » demande un compte rendu : on ouvre le formulaire de clôture
    if (editId && form.statut === 'terminee') {
      const actuelle = interventions.find(x => x.id === editId);
      if (actuelle && actuelle.statut !== 'terminee') {
        try {
          await apiCall(`${API}/interventions/${editId}`, 'PUT', { ...versApi(form), statut: actuelle.statut });
          annuler();
          ouvrirCloture({ ...actuelle, ...versApi(form) });
          charger();
        } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
        return;
      }
    }
    try {
      if (editId) {
        await apiCall(`${API}/interventions/${editId}`, 'PUT', versApi(form));
        setMessage('✅ ' + t('interventions.modified'));
      } else {
        await apiCall(`${API}/interventions/`, 'POST', { ...versApi(form), statut: form.statut === 'terminee' ? 'planifiee' : form.statut });
        setMessage('✅ ' + t('interventions.created'));
      }
      annuler();
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const modifier = (i) => {
    setForm({
      equipement_id: i.equipement_id || '',
      technicien_id: i.technicien_id || '',
      alerte_id: i.alerte_id || '',
      type_intervention: i.type_intervention || 'corrective',
      priorite: i.priorite || 'normale',
      description: i.description || '',
      statut: i.statut,
      date_intervention: i.date_intervention ? i.date_intervention.slice(0, 16) : ''
    });
    setEditId(i.id);
    setShowForm(true);
    setMessage('');
  };

  // Démarrer : planifiée → en cours (la date de début est enregistrée par le backend)
  const demarrer = async (i) => {
    try {
      await apiCall(`${API}/interventions/${i.id}`, 'PUT', { statut: 'en_cours' });
      setMessage('✅ ' + t('interventions.started'));
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  // Terminer (ou compléter) : ouvre le formulaire de compte rendu
  const ouvrirCloture = (i) => {
    setRapport({
      diagnostic: i.diagnostic || '', actions_realisees: i.actions_realisees || '',
      pieces_remplacees: i.pieces_remplacees || '', observations: i.observations || ''
    });
    setCloture(i);
    setMessage('');
  };

  const validerCloture = async () => {
    if (!rapport.actions_realisees.trim()) {
      setMessage('❌ ' + t('interventions.rapportObligatoire', { defaultValue: 'Compte rendu obligatoire : indiquez les actions réalisées' }));
      return;
    }
    try {
      await apiCall(`${API}/interventions/${cloture.id}`, 'PUT', { ...rapport, statut: 'terminee' });
      setMessage('✅ ' + (cloture.statut === 'terminee' ? t('interventions.rapportModifie', { defaultValue: 'Compte rendu modifié' }) : t('interventions.finished')));
      setCloture(null);
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const supprimer = async (i) => {
    if (!(await confirmer(t('interventions.confirmDelete', { id: i.id })))) return;
    try {
      await apiCall(`${API}/interventions/${i.id}`, 'DELETE');
      setMessage('✅ ' + t('interventions.deleted'));
      charger();
    } catch (err) { setMessage('❌ ' + traduireErreur(err)); }
  };

  const th = { padding: '12px', textAlign: 'start' };
  const td = { padding: '12px' };
  const petitBouton = (bg, color) => ({ background: bg, border: 'none', color, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', marginInlineEnd: '6px', fontFamily: 'inherit' });
  const badge = (couleur) => ({ background: `color-mix(in srgb, ${couleur} 13%, transparent)`, color: couleur, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', whiteSpace: 'nowrap' });
  const boutonVert = { background: 'var(--succes-fond)', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' };
  const boutonGris = { background: '#333', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', padding: '25px' }}>

      {/* EN-TÊTE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>🔧 {t('interventions.title')}</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowRapport(true)}
            style={{ background: '#1e3a5f', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>
            📊 {t('maintenance.bouton', { defaultValue: 'Rapport de maintenance' })}
          </button>
          {!showForm && (
            <button onClick={() => { setShowForm(true); setMessage(''); }}
              style={{ background: 'var(--accent-fond)', border: 'none', color: 'white', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' }}>
              ➕ {t('interventions.new')}
            </button>
          )}
        </div>
      </div>

      {message && <p style={{ color: message.startsWith('✅') ? 'var(--succes)' : 'var(--danger)' }}>{message}</p>}

      {/* FORMULAIRE : ORDRE D'INTERVENTION */}
      {showForm && (
        <div style={{ background: 'var(--input)', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid var(--accent)' }}>
          <h3 style={{ color: 'var(--text)', marginTop: 0 }}>{editId ? '✏️ ' + t('common.edit') : '➕ ' + t('interventions.new')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <span style={labelStyle}>{t('interventions.equipement')}</span>
              <select style={inputStyle} value={form.equipement_id}
                onChange={e => setForm({ ...form, equipement_id: e.target.value, alerte_id: '' })}>
                <option value="">{t('capteurs.choisirEquipement')}</option>
                {equipements.map(eq => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>{t('interventions.typeLabel', { defaultValue: "Type d'intervention" })}</span>
              <select style={inputStyle} value={form.type_intervention}
                onChange={e => setForm({ ...form, type_intervention: e.target.value })}>
                <option value="corrective">{nomType('corrective')}</option>
                <option value="preventive">{nomType('preventive')}</option>
              </select>
            </div>
            <div>
              <span style={labelStyle}>{t('interventions.prioriteLabel', { defaultValue: 'Priorité' })}</span>
              <select style={inputStyle} value={form.priorite}
                onChange={e => setForm({ ...form, priorite: e.target.value })}>
                {['basse', 'normale', 'haute', 'urgente'].map(p => <option key={p} value={p}>{nomPriorite(p)}</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>{t('interventions.technicien')}</span>
              <select style={inputStyle} value={form.technicien_id}
                onChange={e => setForm({ ...form, technicien_id: e.target.value })}>
                <option value="">{t('interventions.choisirTechnicien')}</option>
                {techniciens.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>{t('interventions.datePrevue')}</span>
              <input style={inputStyle} type="datetime-local" value={form.date_intervention}
                onChange={e => setForm({ ...form, date_intervention: e.target.value })} />
            </div>
            <div>
              <span style={labelStyle}>{t('interventions.statut')}</span>
              <select style={inputStyle} value={form.statut}
                onChange={e => setForm({ ...form, statut: e.target.value })}>
                <option value="planifiee">{t('statuts.planifiee')}</option>
                <option value="en_cours">{t('statuts.en_cours')}</option>
                {editId && <option value="terminee">{t('statuts.terminee')}</option>}
              </select>
            </div>
          </div>

          {/* ALERTE D'ORIGINE (facultative) */}
          {form.type_intervention === 'corrective' && form.equipement_id && (
            <div style={{ marginTop: '12px' }}>
              <span style={labelStyle}>🚨 {t('interventions.alerteOrigine', { defaultValue: "Alerte d'origine (facultatif)" })}</span>
              <select style={inputStyle} value={form.alerte_id}
                onChange={e => setForm({ ...form, alerte_id: e.target.value })}>
                <option value="">{t('interventions.aucuneAlerte', { defaultValue: 'Aucune alerte liée' })}</option>
                {alertesEquipement.map(a => (
                  <option key={a.id} value={a.id}>
                    #{a.id} · {formatDate(a.created_at)} · {a.severite} · {a.type} · {a.message}
                  </option>
                ))}
              </select>
            </div>
          )}

          <span style={{ ...labelStyle, marginTop: '12px' }}>{t('interventions.description')}</span>
          <ChampIntelligent token={token} champ="description" equipementId={form.equipement_id} style={inputStyle} minHeight="80px"
            placeholder={t('interventions.descriptionPlaceholder')} value={form.description}
            onChange={v => setForm(f => ({ ...f, description: v }))} />
          <PropositionsIntelligentes token={token} techniciens={techniciens}
            demande={{ equipement_id: form.equipement_id, description: form.description, alerte_id: form.alerte_id, type_intervention: form.type_intervention,
              champs: ['description', 'priorite', 'type_intervention', 'technicien_id', 'date_intervention', 'diagnostic', 'actions_realisees', 'pieces_remplacees'] }}
            onAppliquer={v => setForm(f => {
              const n = { ...f };
              ['description', 'priorite', 'type_intervention', 'technicien_id', 'date_intervention'].forEach(k => { if (v[k] !== undefined) n[k] = v[k]; });
              // le diagnostic probable, les actions et les pièces à prévoir complètent la description de l'ordre
              const ajouts = [['diagnostic', t('saisie.diagProbable', { defaultValue: 'Diagnostic probable' })], ['actions_realisees', t('saisie.actionsPrevues', { defaultValue: 'Actions à prévoir' })], ['pieces_remplacees', t('saisie.piecesPrevoir', { defaultValue: 'Pièces à prévoir' })]]
                .filter(([k]) => v[k]).map(([k, l]) => `${l} : ${v[k]}`);
              if (ajouts.length) n.description = [n.description, ...ajouts].filter(Boolean).join('\n');
              return n;
            })} />
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
            <button onClick={enregistrer} style={boutonVert}>💾 {t('common.save')}</button>
            <button onClick={annuler} style={boutonGris}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* TABLEAU */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text)' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--accent)' }}>
              <th style={th}>{t('common.id')}</th>
              <th style={th}>{t('interventions.equipement')}</th>
              <th style={th}>{t('interventions.typeLabel', { defaultValue: "Type d'intervention" })}</th>
              <th style={th}>{t('interventions.description')}</th>
              <th style={th}>{t('interventions.technicien')}</th>
              <th style={th}>{t('interventions.datePrevue')}</th>
              <th style={th}>{t('interventions.statut')}</th>
              <th style={th}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {interventions.map(i => {
              const couleur = COULEURS[i.statut] || '#888';
              const couleurP = COULEURS_PRIORITE[i.priorite] || '#888';
              return (
                <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, color: 'var(--muted)' }}>{i.id}</td>
                  <td style={{ ...td, fontWeight: 'bold' }}>{nomEquipement(i.equipement_id)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '13px' }}>{i.type_intervention === 'preventive' ? '🗓️' : '🛠️'} {nomType(i.type_intervention)}</span>
                      <span style={badge(couleurP)}>{nomPriorite(i.priorite)}</span>
                      {i.alerte_id && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>🚨 #{i.alerte_id}</span>}
                    </div>
                  </td>
                  <td style={{ ...td, maxWidth: '250px' }}>{i.description}</td>
                  <td style={td}>{nomTechnicien(i.technicien_id)}</td>
                  <td style={td}>{formatDate(i.date_intervention)}</td>
                  <td style={td}><span style={badge(couleur)}>{t('statuts.' + i.statut, { defaultValue: i.statut })}</span></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {i.statut === 'planifiee' && (
                      <button onClick={() => demarrer(i)} style={petitBouton('#14532d', '#86efac')}>▶️ {t('interventions.start')}</button>
                    )}
                    {i.statut === 'en_cours' && (
                      <button onClick={() => ouvrirCloture(i)} style={petitBouton('#14532d', '#86efac')}>✅ {t('interventions.finish')}</button>
                    )}
                    {i.statut === 'terminee' && (
                      <button onClick={() => ouvrirCloture(i)} style={petitBouton('#14532d', '#86efac')}>📝 {t('interventions.compteRendu', { defaultValue: 'Compte rendu' })}</button>
                    )}
                    <button onClick={() => setBon(i)} style={petitBouton('#4c1d95', '#c4b5fd')}>📄 {t('document.bouton')}</button>
                    <button onClick={() => modifier(i)} style={petitBouton('#1e3a8a', '#93c5fd')}>✏️ {t('common.edit')}</button>
                    {moi?.role !== 'technicien' && (
                      <button onClick={() => supprimer(i)} title={t('common.delete')} style={petitBouton('#7f1d1d', '#fca5a5')}>🗑️</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {interventions.length === 0 && (
              <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>{t('interventions.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* COMPTE RENDU D'INTERVENTION (clôture) */}
      {cloture && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--accent)' }}>
            <h3 style={{ color: 'var(--accent)', marginTop: 0 }}>
              📝 {t('interventions.compteRendu', { defaultValue: 'Compte rendu' })} · {nomEquipement(cloture.equipement_id)}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: 0 }}>{cloture.description}</p>
            {message && message.startsWith('❌') && <p style={{ color: 'var(--danger)' }}>{message}</p>}

            <PropositionsIntelligentes token={token} libelle={t('saisie.preremplir', { defaultValue: 'Préremplir le compte rendu' })}
              demande={{ equipement_id: cloture.equipement_id, description: cloture.description, alerte_id: cloture.alerte_id,
                type_intervention: cloture.type_intervention, intervention_id: cloture.id, champs: ['diagnostic', 'actions_realisees', 'pieces_remplacees'] }}
              onAppliquer={v => setRapport(r => ({ ...r, ...v }))} />

            <span style={labelStyle}>{t('interventions.diagnostic', { defaultValue: 'Diagnostic (cause trouvée)' })}</span>
            <ChampIntelligent token={token} champ="diagnostic" equipementId={cloture.equipement_id} style={inputStyle} minHeight="60px"
              value={rapport.diagnostic} onChange={v => setRapport(r => ({ ...r, diagnostic: v }))} />

            <span style={labelStyle}>{t('interventions.actions', { defaultValue: 'Actions réalisées' })} *</span>
            <ChampIntelligent token={token} champ="actions_realisees" equipementId={cloture.equipement_id} style={inputStyle} minHeight="80px"
              value={rapport.actions_realisees} onChange={v => setRapport(r => ({ ...r, actions_realisees: v }))} />

            <span style={labelStyle}>{t('interventions.pieces', { defaultValue: 'Pièces remplacées' })}</span>
            <ChampIntelligent token={token} champ="pieces_remplacees" equipementId={cloture.equipement_id} style={inputStyle} minHeight="50px"
              value={rapport.pieces_remplacees} onChange={v => setRapport(r => ({ ...r, pieces_remplacees: v }))} />

            <span style={labelStyle}>{t('interventions.observationsLabel', { defaultValue: 'Observations et recommandations' })}</span>
            <ChampIntelligent token={token} champ="observations" equipementId={cloture.equipement_id} style={inputStyle} minHeight="50px"
              value={rapport.observations} onChange={v => setRapport(r => ({ ...r, observations: v }))} />

            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <button onClick={validerCloture} style={boutonVert}>
                ✅ {cloture.statut === 'terminee' ? t('common.save') : t('interventions.cloturer', { defaultValue: "Clôturer l'intervention" })}
              </button>
              <button onClick={() => { setCloture(null); setMessage(''); }} style={boutonGris}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT : ORDRE OU FICHE D'INTERVENTION (prévisualisation, impression, PDF) */}
      {bon && (
        <BonIntervention interventionId={bon.id} token={token} onClose={() => setBon(null)} />
      )}

      {/* DOCUMENT : RAPPORT DE MAINTENANCE SUR UNE PÉRIODE */}
      {showRapport && (
        <RapportMaintenance token={token} onClose={() => setShowRapport(false)} />
      )}
    </div>
  );
}

export default Interventions;
