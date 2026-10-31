import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { fondPour } from './couleurs';

const ORANGE = 'var(--accent)';
const COULEURS = { erreur: 'var(--danger)', avertissement: 'var(--attention)', ok: 'var(--succes)' };
const ICONES = { erreur: '⛔', avertissement: '⚠️', ok: '✅' };
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.docx,.xlsx,.xlsm,.csv,.pptx,.xml,.json,.txt,.md';
const CHAMPS_TEXTE = ['description', 'diagnostic', 'actions_realisees', 'pieces_remplacees', 'observations'];

const versLocal = (s) => (s ? String(s).replace(' ', 'T').slice(0, 16) : '');
const depuisLocal = (s) => (s ? s.replace('T', ' ') : '');

// Prépare le formulaire à partir des champs lus et des identifiants reconnus par les contrôles
function formulaireInitial(doc) {
  const c = doc.donnees?.corrections || doc.donnees?.champs || {};
  const r = doc.verification?.resolus || {};
  return {
    equipement: r.equipement_id ? String(r.equipement_id) : '',
    technicien: r.technicien_id ? String(r.technicien_id) : (c.technicien ? '' : 'aucun'),
    type_intervention: r.type_intervention || 'corrective',
    priorite: r.priorite || 'normale',
    date_debut: versLocal(r.date_debut || ''),
    date_fin: versLocal(r.date_fin || ''),
    duree_minutes: c.duree_minutes ?? '',
    alerte_id: c.alerte_id ?? '',
    ...Object.fromEntries(CHAMPS_TEXTE.map(k => [k, c[k] || ''])),
  };
}

// Libellés des champs du formulaire
const LIB = { equipement: 'Équipement', technicien: 'Technicien', type_intervention: "Type d'intervention", priorite: 'Priorité',
  date_debut: 'Début', date_fin: 'Fin', duree_minutes: 'Durée (minutes)', alerte_id: "Alerte d'origine (n°)", description: 'Description de la demande',
  diagnostic: 'Diagnostic', actions_realisees: 'Actions réalisées', pieces_remplacees: 'Pièces remplacées', observations: 'Observations' };

// Défini hors du composant principal : sinon les champs seraient recréés à chaque frappe et perdraient le focus
function Etiquette({ tr, nom, children, lu }) {
  const libelle = tr('champ.' + nom, LIB[nom]);
  const motLu = tr('lu', 'lu');
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <span>{libelle}</span>
        {lu !== undefined && lu !== null && lu !== '' && <span style={{ fontStyle: 'italic', textAlign: 'end' }}>{motLu} : « {String(lu)} »</span>}
      </div>
      {children}
    </label>
  );
}

function Documents({ token, moi }) {
  const { t } = useTranslation();
  const tr = (cle, defaut, opts = {}) => t('documents.' + cle, { defaultValue: defaut, ...opts });
  const peutManuel = moi && ['admin', 'superviseur'].includes(moi.role);
  const [type, setType] = useState('bon_intervention');
  const [doc, setDoc] = useState(null);
  const [form, setForm] = useState(null);
  const [apercu, setApercu] = useState(null);         // { url, nature: 'image' | 'pdf' | 'texte' }
  const [enCours, setEnCours] = useState('');
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [voirTexte, setVoirTexte] = useState(false);
  const entree = useRef(null);
  const camera = useRef(null);
  const entetes = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const chargerHistorique = useCallback(() => {
    fetch(`${API}/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : [])).then(setHistorique).catch(() => {});
  }, [token]);
  useEffect(() => { chargerHistorique(); }, [chargerHistorique]);
  useEffect(() => () => { if (apercu?.url) URL.revokeObjectURL(apercu.url); }, [apercu]);

  const messageErreur = (d) => (typeof d?.detail === 'string' ? d.detail : d?.detail?.message || tr('erreur', 'Une erreur est survenue'));

  const natureApercu = (nom) => (/\.(png|jpe?g|webp|bmp)$/i.test(nom) ? 'image' : /\.pdf$/i.test(nom) ? 'pdf' : 'texte');

  const ouvrir = (d) => {
    setDoc(d);
    setForm(d.type_document === 'bon_intervention' ? formulaireInitial(d) : null);
    setVoirTexte(false);
  };

  const deposer = async (fichier) => {
    if (!fichier) return;
    setErreur(''); setDoc(null); setForm(null);
    if (fichier.size > 15 * 1024 * 1024) { setErreur(tr('tropGros', 'Fichier trop volumineux (15 Mo maximum)')); return; }
    if (apercu?.url) URL.revokeObjectURL(apercu.url);
    setApercu({ url: URL.createObjectURL(fichier), nature: natureApercu(fichier.name) });
    const contenu = await new Promise((ok, ko) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = ko; l.readAsDataURL(fichier); });
    const etapes = [tr('etape1', 'Lecture du document…'), tr('etape2', 'Extraction des informations…'), tr('etape3', 'Contrôle des incohérences…')];
    let k = 0; setEnCours(etapes[0]);
    const minuteur = setInterval(() => { k = Math.min(k + 1, etapes.length - 1); setEnCours(etapes[k]); }, 2500);
    try {
      const r = await fetch(`${API}/documents/analyser`, { method: 'POST', headers: entetes, body: JSON.stringify({ nom: fichier.name, contenu, type_document: type }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(messageErreur(d));
      ouvrir(d);
      chargerHistorique();
    } catch (e) {
      setErreur(e.message || tr('erreurReseau', 'Serveur injoignable'));
    } finally {
      clearInterval(minuteur); setEnCours('');
    }
  };

  // Champs envoyés au serveur : identifiants choisis, ou texte lu s'il n'a pas encore été choisi dans la liste
  const champsEnvoyes = () => {
    const lus = doc.donnees?.champs || {};
    const c = { ...Object.fromEntries(CHAMPS_TEXTE.map(k => [k, form[k]])), type_intervention: form.type_intervention, priorite: form.priorite,
      date_debut: depuisLocal(form.date_debut), date_fin: depuisLocal(form.date_fin),
      duree_minutes: form.duree_minutes === '' ? null : form.duree_minutes, alerte_id: form.alerte_id === '' ? null : form.alerte_id };
    if (form.equipement) c.equipement_id = Number(form.equipement); else c.equipement = lus.equipement || null;
    if (form.technicien && form.technicien !== 'aucun') c.technicien_id = Number(form.technicien);
    else if (form.technicien === '') c.technicien = lus.technicien || null;
    return c;
  };

  const action = async (verbe) => {
    setErreur(''); setEnCours(verbe === 'valider' ? tr('creation', "Création de l'intervention…") : tr('verification', 'Vérification…'));
    try {
      const r = await fetch(`${API}/documents/${doc.id}/${verbe}`, { method: 'POST', headers: entetes, body: JSON.stringify(verbe === 'rejeter' ? {} : { champs: champsEnvoyes() }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 422 && d.detail?.controles) {
        setDoc(x => ({ ...x, verification: { ...x.verification, bloquant: true, controles: d.detail.controles } }));
        throw new Error(d.detail.message);
      }
      if (!r.ok) throw new Error(messageErreur(d));
      if (verbe === 'rejeter') { setDoc(x => ({ ...x, ...d })); } else { setDoc(d); }
      chargerHistorique();
    } catch (e) { setErreur(e.message); } finally { setEnCours(''); }
  };

  const rouvrir = async (id) => {
    setErreur('');
    const r = await fetch(`${API}/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const d = await r.json();
    ouvrir(d);
    const f = await fetch(`${API}/documents/${id}/fichier`, { headers: { Authorization: `Bearer ${token}` } });
    if (f.ok) {
      if (apercu?.url) URL.revokeObjectURL(apercu.url);
      setApercu({ url: URL.createObjectURL(await f.blob()), nature: natureApercu(d.nom_fichier) });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── styles ──
  const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '14px', padding: '18px' };
  const champStyle = (nom) => {
    const c = doc?.verification?.controles?.find(x => x.champ === nom && x.niveau !== 'ok');
    return { width: '100%', boxSizing: 'border-box', background: 'var(--bg, #0f1117)', color: 'var(--text, white)', borderRadius: '8px',
      padding: '8px 10px', fontFamily: 'inherit', fontSize: '14px', border: `1px solid ${c ? COULEURS[c.niveau] : 'var(--border, #333)'}` };
  };
  const bouton = (fond) => ({ background: fondPour(fond), border: 'none', color: 'white', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' });
  const maj = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const statutPuce = (s) => {
    const c = { a_valider: ['var(--attention)', tr('st.a_valider', 'À valider')], valide: ['var(--succes)', tr('st.valide', 'Validé')], indexe: ['var(--info)', tr('st.indexe', 'Indexé')],
      rejete: ['var(--neutre)', tr('st.rejete', 'Rejeté')], erreur: ['var(--danger)', tr('st.erreur', 'Erreur')] }[s] || ['var(--neutre)', s];
    return <span style={{ background: `color-mix(in srgb, ${c[0]} 13%, transparent)`, color: c[0], borderRadius: '20px', padding: '2px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>{c[1]}</span>;
  };

  const lus = doc?.donnees?.champs || {};
  const v = doc?.verification || {};
  const fini = doc && ['valide', 'rejete'].includes(doc.statut);

  return (
    <div>
      <style>{`@keyframes doc-pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
      <h2 style={{ color: ORANGE, margin: '0 0 6px' }}>📄 {tr('titre', 'Documents intelligents')}</h2>
      <div style={{ color: 'var(--muted, #999)', marginBottom: '18px' }}>
        {tr('intro', "Déposez un bon d'intervention (photo, scan, PDF, Word…) : SmartMaint le lit, contrôle les incohérences et prépare l'intervention.")}
      </div>

      {/* TYPE DE DOCUMENT */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[['bon_intervention', '🧾 ' + tr('typeBon', "Bon d'intervention")], ...(peutManuel ? [['manuel', '📘 ' + tr('typeManuel', 'Manuel ou fiche technique')]] : [])].map(([k, l]) => (
          <button key={k} onClick={() => setType(k)} style={{ ...bouton(type === k ? ORANGE : 'transparent'), border: `1px solid ${type === k ? ORANGE : 'var(--border, #333)'}`, color: type === k ? 'white' : 'var(--text, white)' }}>{l}</button>
        ))}
      </div>

      {/* ZONE DE DÉPÔT */}
      <div onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={e => { e.preventDefault(); setSurvol(false); deposer(e.dataTransfer.files[0]); }}
        onClick={() => !enCours && entree.current?.click()}
        style={{ ...carte, border: `2px dashed ${survol ? ORANGE : 'var(--border, #3a3d4e)'}`, textAlign: 'center', padding: '28px', cursor: enCours ? 'wait' : 'pointer', marginBottom: '18px' }}>
        {enCours ? (
          <div style={{ fontSize: '16px', animation: 'doc-pulse 1.2s infinite' }}>⏳ {enCours}</div>
        ) : (
          <>
            <div style={{ fontSize: '34px' }}>📥</div>
            <div style={{ fontWeight: 'bold', margin: '6px 0' }}>{tr('deposer', 'Glissez un fichier ici ou cliquez pour le choisir')}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted, #999)' }}>PDF · {tr('images', 'photos et scans')} · Word · Excel · CSV · PowerPoint · XML · JSON — 15 Mo max</div>
            {type === 'bon_intervention' && (
              <button onClick={e => { e.stopPropagation(); camera.current?.click(); }} style={{ ...bouton(ORANGE), marginTop: '12px' }}>📷 {tr('photo', 'Prendre une photo')}</button>
            )}
          </>
        )}
        <input ref={entree} type="file" accept={ACCEPT} hidden onChange={e => { deposer(e.target.files[0]); e.target.value = ''; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { deposer(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {erreur && <div style={{ ...carte, border: '1px solid var(--danger)', color: 'var(--danger)', marginBottom: '18px', padding: '12px 16px' }}>⚠️ {erreur}</div>}

      {/* RÉSULTAT */}
      {doc && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '18px', marginBottom: '22px', alignItems: 'start' }}>
          {/* aperçu du document */}
          <div style={{ ...carte, position: 'sticky', top: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <b style={{ wordBreak: 'break-all' }}>{doc.nom_fichier}</b>{statutPuce(doc.statut)}
            </div>
            {apercu?.nature === 'image' && <img src={apercu.url} alt="" style={{ width: '100%', borderRadius: '8px' }} />}
            {apercu?.nature === 'pdf' && <iframe src={apercu.url} title="pdf" style={{ width: '100%', height: '560px', border: 'none', borderRadius: '8px', background: 'white' }} />}
            {(apercu?.nature === 'texte' || !apercu) && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', maxHeight: '560px', overflow: 'auto', margin: 0, color: 'var(--muted, #bbb)' }}>{doc.texte}</pre>}
            <div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginTop: '10px' }}>
              {tr('luPar', 'Lu par')} : {doc.methode} · {(doc.duree_ms / 1000).toFixed(1)} s{doc.pages ? ` · ${doc.pages} page(s)` : ''}
            </div>
            {doc.donnees?.remarques?.map((r, i) => <div key={i} style={{ fontSize: '12px', color: 'var(--attention)', marginTop: '6px' }}>ℹ️ {r}</div>)}
          </div>

          {/* bon d'intervention : contrôles et formulaire */}
          {doc.type_document === 'bon_intervention' && form && (
            <div style={carte}>
              {doc.message && <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '14px', background: `color-mix(in srgb, ${(doc.statut === 'valide' ? '#22c55e' : 'var(--neutre)')} 13%, transparent)`, color: doc.statut === 'valide' ? 'var(--succes)' : 'var(--text, white)', fontWeight: 'bold' }}>{doc.statut === 'valide' ? '✅ ' : ''}{doc.message}</div>}
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔎 {tr('controles', 'Contrôles')}</div>
              <div style={{ marginBottom: '16px' }}>
                {(v.controles || []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', padding: '6px 10px', marginBottom: '4px', borderRadius: '8px', background: COULEURS[c.niveau] + '14', color: c.niveau === 'ok' ? 'var(--text, white)' : COULEURS[c.niveau] }}>
                    <span>{ICONES[c.niveau]}</span><span>{c.message}</span>
                  </div>
                ))}
              </div>

              <fieldset disabled={fini} style={{ border: 'none', padding: 0, margin: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 12px' }}>
                  <Etiquette tr={tr} nom="equipement" lu={lus.equipement}>
                    <select value={form.equipement} onChange={maj('equipement')} style={champStyle('equipement')}>
                      <option value="">{tr('choisir', '— Choisir —')}</option>
                      {doc.choix?.equipements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                    </select>
                  </Etiquette>
                  <Etiquette tr={tr} nom="technicien" lu={lus.technicien}>
                    <select value={form.technicien} onChange={maj('technicien')} style={champStyle('technicien')}>
                      <option value="">{tr('choisir', '— Choisir —')}</option>
                      <option value="aucun">{tr('aucun', 'Aucun technicien')}</option>
                      {doc.choix?.techniciens.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}
                    </select>
                  </Etiquette>
                  <Etiquette tr={tr} nom="type_intervention" lu={lus.type_intervention}>
                    <select value={form.type_intervention} onChange={maj('type_intervention')} style={champStyle('type_intervention')}>
                      <option value="corrective">{tr('corrective', 'Corrective')}</option><option value="preventive">{tr('preventive', 'Préventive')}</option>
                    </select>
                  </Etiquette>
                  <Etiquette tr={tr} nom="priorite" lu={lus.priorite}>
                    <select value={form.priorite} onChange={maj('priorite')} style={champStyle('priorite')}>
                      {['basse', 'normale', 'haute', 'urgente'].map(p => <option key={p} value={p}>{tr('prio.' + p, p)}</option>)}
                    </select>
                  </Etiquette>
                  <Etiquette tr={tr} nom="date_debut" lu={lus.date_debut}><input type="datetime-local" value={form.date_debut} onChange={maj('date_debut')} style={champStyle('date_debut')} /></Etiquette>
                  <Etiquette tr={tr} nom="date_fin" lu={lus.date_fin}><input type="datetime-local" value={form.date_fin} onChange={maj('date_fin')} style={champStyle('date_fin')} /></Etiquette>
                  <Etiquette tr={tr} nom="duree_minutes"><input type="number" min="0" value={form.duree_minutes} onChange={maj('duree_minutes')} style={champStyle('duree_minutes')} /></Etiquette>
                  <Etiquette tr={tr} nom="alerte_id"><input type="number" min="1" value={form.alerte_id} onChange={maj('alerte_id')} style={champStyle('alerte_id')} /></Etiquette>
                </div>
                {CHAMPS_TEXTE.map(k => (
                  <Etiquette tr={tr} key={k} nom={k}><textarea rows={k === 'description' || k === 'actions_realisees' ? 3 : 2} value={form[k]} onChange={maj(k)} style={{ ...champStyle(k), resize: 'vertical' }} /></Etiquette>
                ))}
              </fieldset>

              {!fini && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button onClick={() => action('verifier')} disabled={!!enCours} style={bouton('var(--info)')}>🔄 {tr('reverifier', 'Revérifier')}</button>
                  <button onClick={() => action('valider')} disabled={!!enCours || v.bloquant} title={v.bloquant ? tr('corrigerDabord', "Corrigez d'abord les erreurs") : ''}
                    style={{ ...bouton('var(--succes)'), opacity: v.bloquant ? 0.45 : 1, cursor: v.bloquant ? 'not-allowed' : 'pointer' }}>✅ {tr('valider', "Valider et créer l'intervention")}</button>
                  <button onClick={() => action('rejeter')} disabled={!!enCours} style={bouton('var(--neutre)')}>{tr('rejeter', 'Rejeter')}</button>
                </div>
              )}
              {v.bloquant && !fini && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px' }}>{tr('corrigerPuis', 'Corrigez les champs en rouge puis cliquez sur « Revérifier ».')}</div>}

              <div style={{ marginTop: '16px' }}>
                <button onClick={() => setVoirTexte(x => !x)} style={{ background: 'none', border: 'none', color: 'var(--muted, #999)', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  {voirTexte ? '▾' : '▸'} {tr('texteLu', 'Texte lu dans le document')}
                </button>
                {voirTexte && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--muted, #bbb)', maxHeight: '260px', overflow: 'auto' }}>{doc.texte}</pre>}
              </div>
            </div>
          )}

          {/* manuel : résultat de l'indexation */}
          {doc.type_document === 'manuel' && (
            <div style={carte}>
              <div style={{ fontSize: '17px', fontWeight: 'bold', color: doc.statut === 'indexe' ? 'var(--succes)' : 'var(--danger)', marginBottom: '10px' }}>
                {doc.statut === 'indexe' ? '✅' : '⚠️'} {doc.message}
              </div>
              {doc.statut === 'indexe' && (
                <div style={{ color: 'var(--muted, #bbb)', lineHeight: 1.6 }}>
                  {tr('manuelOk', 'Le copilote peut maintenant répondre à partir de ce document. Essayez par exemple :')}
                  <div style={{ fontStyle: 'italic', marginTop: '6px', color: 'var(--text, white)' }}>« {tr('exempleQuestion', 'Tous les combien faut-il graisser les roulements de la pompe P01 ?')} »</div>
                </div>
              )}
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', color: 'var(--muted, #bbb)', maxHeight: '420px', overflow: 'auto', marginTop: '14px' }}>{(doc.texte || '').slice(0, 4000)}</pre>
            </div>
          )}
        </div>
      )}

      {/* HISTORIQUE */}
      <div style={carte}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>🗂️ {tr('historique', 'Documents récents')}</div>
        {historique.length === 0 ? <div style={{ color: 'var(--muted, #999)' }}>{tr('aucunDoc', 'Aucun document pour le moment')}</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ color: ORANGE, textAlign: 'start' }}>
                {[tr('colFichier', 'Fichier'), tr('colType', 'Type'), tr('colDate', 'Date'), tr('colStatut', 'Statut'), tr('colResultat', 'Résultat')].map(h => <th key={h} style={{ padding: '8px', textAlign: 'start' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {historique.map(h => (
                  <tr key={h.id} onClick={() => rouvrir(h.id)} style={{ borderTop: '1px solid var(--border, #2a2d3e)', cursor: 'pointer' }}>
                    <td style={{ padding: '8px', wordBreak: 'break-all' }}>{h.nom_fichier}</td>
                    <td style={{ padding: '8px' }}>{h.type_document === 'manuel' ? '📘' : '🧾'} {h.type_document === 'manuel' ? tr('typeManuel', 'Manuel ou fiche technique') : tr('typeBon', "Bon d'intervention")}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString()}</td>
                    <td style={{ padding: '8px' }}>{statutPuce(h.statut)}</td>
                    <td style={{ padding: '8px', color: 'var(--muted, #bbb)' }}>{h.intervention_numero || h.message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Documents;
