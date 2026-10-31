import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { confirmer } from './Confirmation';
import { fondPour } from './couleurs';

const ORANGE = 'var(--accent)';
const STATUTS = { succes: ['var(--succes)', '✅', 'Réussi'], partiel: ['var(--attention)', '⚠️', 'Partiel'], echec: ['var(--danger)', '⛔', 'Échec'], en_cours: ['var(--info)', '⏳', 'En cours'], limite: ['var(--neutre)', '🚦', 'Limite atteinte'] };
const ETAPES = { ok: ['var(--succes)', '✓'], simulee: ['var(--info)', '◌'], ignoree: ['#94a3b8', '↷'], erreur: ['var(--danger)', '✕'], non_executee: ['var(--neutre)', '–'] };

const CHAMP = { width: '100%', boxSizing: 'border-box', background: 'var(--input, #0f1117)', color: 'var(--text, white)', border: '1px solid var(--border, #333)', borderRadius: '8px', padding: '8px 10px', fontFamily: 'inherit', fontSize: '14px' };
const BOUTON = (fond, plein = true) => ({ background: plein ? fondPour(fond) : 'transparent', color: plein ? 'white' : fond, border: `1px solid ${plein ? fondPour(fond) : fond}`, borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' });

// Éditeur de paramètres générique, construit à partir du catalogue.
// Défini hors du composant principal : sinon les champs seraient recréés à chaque frappe et perdraient le curseur.
function Parametre({ def, valeur, onChange, cat, tr }) {
  const champ = CHAMP, bouton = BOUTON;
  const v = valeur ?? def.defaut;
  if (def.type === 'multi') return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{def.options.map(o => (
      <label key={o} style={{ ...bouton((v || []).includes(o) ? ORANGE : 'var(--neutre)', (v || []).includes(o)), padding: '4px 10px' }}>
        <input type="checkbox" hidden checked={(v || []).includes(o)} onChange={e => onChange(e.target.checked ? [...(v || []), o] : (v || []).filter(x => x !== o))} />{tr('sev.' + o, o)}</label>))}</div>);
  if (def.type === 'equipements') return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{cat.equipements.map(e => {
      const on = (v || []).map(String).includes(String(e.id));
      return <label key={e.id} style={{ ...bouton(on ? ORANGE : 'var(--neutre)', on), padding: '4px 10px' }}>
        <input type="checkbox" hidden checked={on} onChange={ev => onChange(ev.target.checked ? [...(v || []), e.id] : (v || []).filter(x => String(x) !== String(e.id)))} />{e.nom}</label>;
    })}</div>);
  if (def.type === 'choix') return <select style={champ} value={v ?? ''} onChange={e => onChange(e.target.value)}>{def.options.map(o => <option key={o} value={o}>{o === '' ? tr('tous', '— Tous —') : tr('opt.' + o, o)}</option>)}</select>;
  if (def.type === 'technicien') return <select style={champ} value={v} onChange={e => onChange(e.target.value)}>
    <option value="auto">{tr('auto', 'Automatique (le plus adapté)')}</option><option value="aucun">{tr('aucun', 'Aucun')}</option>
    {cat.techniciens.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select>;
  if (def.type === 'nombre') return <input type="number" min="0" style={champ} value={v ?? ''} onChange={e => onChange(Number(e.target.value))} />;
  if (def.type === 'heure') return <input type="time" style={champ} value={v || '08:00'} onChange={e => onChange(e.target.value)} />;
  if (def.type === 'booleen') return <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><input type="checkbox" checked={!!v} onChange={e => onChange(e.target.checked)} /> {tr('oui', 'Oui')}</label>;
  return <textarea rows={def.nom === 'message' || def.nom === 'question' ? 3 : 2} style={{ ...champ, resize: 'vertical' }} value={v ?? ''} onChange={e => onChange(e.target.value)} />;
}

function Parametres({ defs, valeurs, onChange, type, cat, tr }) {
  return (
    <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
      {defs.filter(d => type !== 'planifie' || d.nom !== 'jour_semaine' || valeurs.frequence === 'hebdomadaire')
        .filter(d => type !== 'planifie' || d.nom !== 'jour_mois' || valeurs.frequence === 'mensuel')
        .filter(d => type !== 'planifie' || d.nom !== 'intervalle_heures' || valeurs.frequence === 'intervalle')
        .map(d => <div key={d.nom}><div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginBottom: '4px' }}>{tr('p.' + d.nom, d.libelle)}</div>
          <Parametre def={d} valeur={valeurs[d.nom]} onChange={x => onChange({ ...valeurs, [d.nom]: x })} cat={cat} tr={tr} /></div>)}
    </div>
  );
}

function Workflows({ token, moi }) {
  const { t } = useTranslation();
  const tr = (cle, defaut, o = {}) => t('workflows.' + cle, { defaultValue: defaut, ...o });
  const [cat, setCat] = useState(null);
  const [liste, setListe] = useState([]);
  const [execs, setExecs] = useState([]);
  const [moteur, setMoteur] = useState(null);
  const [onglet, setOnglet] = useState('regles');
  const [edition, setEdition] = useState(null);         // workflow en cours d'édition (nouveau ou existant)
  const [simulation, setSimulation] = useState(null);   // { wf, res }
  const [ouverte, setOuverte] = useState(null);         // exécution dépliée
  const [filtre, setFiltre] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const appel = async (url, methode = 'GET', corps) => {
    const r = await fetch(`${API}${url}`, { method: methode, headers: H, body: corps ? JSON.stringify(corps) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : (d.detail?.[0]?.msg || tr('erreur', 'Erreur')));
    return d;
  };

  const charger = useCallback(async () => {
    try {
      const [c, l, e, m] = await Promise.all([appel('/workflows/catalogue'), appel('/workflows'), appel('/workflows/executions?limite=150'), appel('/workflows/moteur')]);
      setCat(c); setListe(l); setExecs(e); setMoteur(m);
    } catch (e) { setMessage('❌ ' + e.message); }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { charger(); const id = setInterval(charger, 15000); return () => clearInterval(id); }, [charger]);

  const flash = (m) => { setMessage(m); setTimeout(() => setMessage(''), 5000); };
  const libelle = (liste_, type) => cat?.[liste_]?.find(d => d.type === type) || { libelle: type, icone: '•', params: [] };
  const nomEquip = (id) => cat?.equipements.find(e => String(e.id) === String(id))?.nom || `#${id}`;

  // ── actions sur un workflow ──
  const basculer = async (wf) => { try { await appel(`/workflows/${wf.id}/activer?actif=${!wf.actif}`, 'POST'); charger(); } catch (e) { flash('❌ ' + e.message); } };
  const supprimer = async (wf) => { if (!(await confirmer(tr('confirmerSuppression', 'Supprimer ce workflow et son historique ?')))) return; await appel(`/workflows/${wf.id}`, 'DELETE'); charger(); };
  const simuler = async (wf) => { setOccupe(true); try { setSimulation({ wf, res: await appel(`/workflows/${wf.id}/simuler?jours=7`, 'POST') }); } catch (e) { flash('❌ ' + e.message); } setOccupe(false); };
  const executer = async (wf) => {
    if (!(await confirmer(tr('confirmerExecution', 'Exécuter réellement ce workflow maintenant (sur le dernier événement correspondant) ?'), { danger: false }))) return;
    try { await appel(`/workflows/${wf.id}/executer`, 'POST'); flash('⏳ ' + tr('executionLancee', 'Exécution lancée : résultat dans l’historique dans quelques secondes')); setOnglet('historique'); setTimeout(charger, 3000); } catch (e) { flash('❌ ' + e.message); }
  };
  const relancer = async (ex) => { try { await appel(`/workflows/executions/${ex.id}/relancer`, 'POST'); flash('⏳ ' + tr('relanceLancee', 'Relance lancée')); setTimeout(charger, 3000); } catch (e) { flash('❌ ' + e.message); } };

  const nouveau = (modele) => {
    const base = modele || { nom: '', description: '', declencheur: { type: 'alerte', params: {} }, actions: [] };
    setEdition({ id: null, nom: base.nom, description: base.description || '', actif: true, max_par_heure: 20,
      declencheur: JSON.parse(JSON.stringify(base.declencheur)), actions: JSON.parse(JSON.stringify(base.actions)) });
  };
  const enregistrer = async () => {
    setOccupe(true);
    try {
      const corps = { nom: edition.nom, description: edition.description, actif: edition.actif, max_par_heure: Number(edition.max_par_heure) || 20,
        declencheur: edition.declencheur, actions: edition.actions.map(a => ({ ...a, tentatives: Number(a.tentatives) || 3 })) };
      await appel(edition.id ? `/workflows/${edition.id}` : '/workflows', edition.id ? 'PUT' : 'POST', corps);
      setEdition(null); flash('✅ ' + tr('enregistre', 'Workflow enregistré')); charger();
    } catch (e) { flash('❌ ' + e.message); }
    setOccupe(false);
  };

  // ── styles ──
  const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border, #2a2d3e)' };
  const champ = CHAMP, bouton = BOUTON;
  const puce = (s) => { const [c, i, l] = STATUTS[s] || ['var(--neutre)', '•', s]; return <span style={{ background: `color-mix(in srgb, ${c} 13%, transparent)`, color: c, borderRadius: '20px', padding: '2px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>{i} {tr('st.' + s, l)}</span>; };

  // ── résumé lisible d'un workflow ──
  const resume = (wf) => {
    const d = libelle('declencheurs', wf.declencheur.type), p = wf.declencheur.params || {};
    const filtres = [p.severites?.length ? p.severites.join(', ') : null, p.equipements?.length ? p.equipements.map(nomEquip).join(', ') : null,
      p.type_capteur || null, p.nb ? `${p.nb} alertes / ${p.heures} h` : null, p.minutes ? `${p.minutes} min` : null,
      wf.declencheur.type === 'planifie' ? `${tr('opt.' + p.frequence, p.frequence)} ${p.heure || ''}` : null].filter(Boolean);
    return <>
      <div><b style={{ color: ORANGE }}>{tr('quand', 'QUAND')}</b> {d.icone} {tr('d.' + d.type, d.libelle)}{filtres.length ? <span style={{ color: 'var(--muted, #999)' }}> · {filtres.join(' · ')}</span> : null}</div>
      <div style={{ marginTop: '4px' }}><b style={{ color: '#8b5cf6' }}>{tr('alors', 'ALORS')}</b> {wf.actions.map((a, k) => { const x = libelle('actions', a.type); return <span key={k}>{k > 0 && ' → '}{x.icone} {tr('a.' + a.type, x.libelle)}</span>; })}</div>
    </>;
  };

  if (!cat) return <div style={{ padding: '20px' }}>⏳ {message || tr('chargement', 'Chargement…')}</div>;

  return (
    <div>
      <h2 style={{ color: ORANGE, margin: '0 0 6px' }}>⚙️ {tr('titre', 'Workflows automatiques')}</h2>
      <div style={{ color: 'var(--muted, #999)', marginBottom: '14px' }}>{tr('intro', 'Des règles « QUAND… ALORS… » que SmartMaint applique tout seul, avec un historique de chaque exécution.')}</div>

      {moteur && <div style={{ ...carte, padding: '10px 14px', marginBottom: '14px', display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' }}>
        <span><span style={{ color: moteur.actif ? 'var(--succes)' : 'var(--danger)' }}>●</span> {moteur.actif ? tr('moteurActif', 'Moteur actif') : tr('moteurArrete', 'Moteur arrêté')} · {tr('verif', 'vérification toutes les {{n}} s', { n: moteur.intervalle_secondes })}</span>
        <span>{tr('regleActives', 'Règles actives')} : <b>{moteur.workflows_actifs}</b></span>
        <span>{tr('execJour', "Exécutions aujourd'hui")} : <b>{moteur.executions_aujourdhui}</b></span>
        {moteur.dernier_tour && <span style={{ color: 'var(--muted, #999)' }}>{tr('dernierTour', 'Dernier passage')} : {new Date(moteur.dernier_tour).toLocaleTimeString()}</span>}
        {!cat.telegram_configure && <span style={{ color: 'var(--attention)' }}>⚠️ {tr('telegramAbsent', 'Telegram non configuré : les messages échoueront')}</span>}
        {moteur.derniere_erreur && <span style={{ color: 'var(--danger)' }}>⚠️ {moteur.derniere_erreur}</span>}
      </div>}

      {message && <div style={{ ...carte, padding: '10px 14px', marginBottom: '14px', borderColor: message.startsWith('❌') ? 'var(--danger)' : 'var(--succes)' }}>{message}</div>}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[['regles', '📋 ' + tr('regles', 'Règles')], ['modeles', '✨ ' + tr('modeles', 'Modèles prêts à l’emploi')], ['historique', '🕘 ' + tr('historique', 'Historique des exécutions')]].map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)} style={bouton(ORANGE, onglet === k)}>{l}</button>))}
        <button onClick={() => nouveau()} style={{ ...bouton('var(--succes)'), marginInlineStart: 'auto' }}>➕ {tr('nouveau', 'Nouvelle règle')}</button>
      </div>

      {/* RÈGLES */}
      {onglet === 'regles' && (liste.length === 0
        ? <div style={{ ...carte, textAlign: 'center', color: 'var(--muted, #999)' }}>{tr('vide', 'Aucune règle. Commencez par un modèle prêt à l’emploi.')}</div>
        : <div style={{ display: 'grid', gap: '12px' }}>{liste.map(wf => (
          <div key={wf.id} style={{ ...carte, opacity: wf.actif ? 1 : 0.65, borderColor: wf.actif ? 'var(--border, #2a2d3e)' : 'var(--neutre)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label title={tr('activer', 'Activer / désactiver')} style={{ cursor: 'pointer', width: 42, height: 24, borderRadius: 12, background: wf.actif ? '#22c55e' : '#475569', position: 'relative', flex: 'none' }}>
                <input type="checkbox" hidden checked={wf.actif} onChange={() => basculer(wf)} />
                <span style={{ position: 'absolute', top: 3, insetInlineStart: wf.actif ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: 'white', transition: 'all .2s' }} />
              </label>
              <b style={{ fontSize: '16px' }}>{wf.nom}</b>
              <span style={{ marginInlineStart: 'auto', fontSize: '12px', color: 'var(--muted, #999)' }}>
                {wf.statistiques.executions} {tr('executions', 'exécution(s)')}{wf.statistiques.taux_reussite !== null && ` · ${wf.statistiques.taux_reussite} % ${tr('reussite', 'de réussite')}`}
                {wf.derniere_execution && ` · ${tr('derniere', 'dernière')} ${new Date(wf.derniere_execution).toLocaleString()}`}
                {wf.prochaine_execution && wf.actif && ` · ${tr('prochaine', 'prochaine')} ${new Date(wf.prochaine_execution).toLocaleString()}`}
              </span>
            </div>
            <div style={{ fontSize: '14px', margin: '10px 0' }}>{resume(wf)}</div>
            {wf.desactive_raison && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>⛔ {wf.desactive_raison}</div>}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={() => simuler(wf)} disabled={occupe} style={bouton('var(--info)', false)}>🧪 {tr('simuler', 'Simuler sur 7 jours')}</button>
              <button onClick={() => executer(wf)} style={bouton('#8b5cf6', false)}>▶ {tr('executer', 'Exécuter maintenant')}</button>
              <button onClick={() => setEdition({ ...wf })} style={bouton('#94a3b8', false)}>✏️ {tr('modifier', 'Modifier')}</button>
              <button onClick={() => { setFiltre(String(wf.id)); setOnglet('historique'); }} style={bouton('#94a3b8', false)}>🕘 {tr('voirHistorique', 'Historique')}</button>
              <button onClick={() => supprimer(wf)} style={bouton('var(--danger)', false)}>🗑️</button>
            </div>
          </div>))}</div>)}

      {/* MODÈLES */}
      {onglet === 'modeles' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
        {cat.modeles.map(m => (
          <div key={m.cle} style={{ ...carte, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <b>{tr('m.' + m.cle, m.nom)}</b>
            <div style={{ fontSize: '13px', color: 'var(--muted, #bbb)', flex: 1 }}>{tr('md.' + m.cle, m.description)}</div>
            <div style={{ fontSize: '13px' }}>{resume({ ...m, statistiques: {} })}</div>
            <button onClick={() => nouveau(m)} style={{ ...bouton(ORANGE), alignSelf: 'flex-start' }}>✨ {tr('utiliser', 'Utiliser ce modèle')}</button>
          </div>))}
      </div>}

      {/* HISTORIQUE */}
      {onglet === 'historique' && <div style={carte}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ ...champ, width: 'auto' }} value={filtre} onChange={e => setFiltre(e.target.value)}>
            <option value="">{tr('toutes', 'Toutes les règles')}</option>{liste.map(w => <option key={w.id} value={w.id}>{w.nom}</option>)}
          </select>
          <button onClick={charger} style={bouton('#94a3b8', false)}>🔄 {tr('actualiser', 'Actualiser')}</button>
        </div>
        {execs.filter(x => !filtre || String(x.workflow_id) === filtre).length === 0 && <div style={{ color: 'var(--muted, #999)' }}>{tr('aucuneExec', 'Aucune exécution pour le moment.')}</div>}
        {execs.filter(x => !filtre || String(x.workflow_id) === filtre).map(ex => (
          <div key={ex.id} style={{ borderTop: '1px solid var(--border, #2a2d3e)', padding: '8px 0' }}>
            <div onClick={() => setOuverte(ouverte === ex.id ? null : ex.id)} style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', fontSize: '13px' }}>
              {puce(ex.statut)}
              <span style={{ whiteSpace: 'nowrap', color: 'var(--muted, #999)' }}>{new Date(ex.debut).toLocaleString()}</span>
              <b>{ex.workflow}</b>
              <span style={{ color: 'var(--muted, #bbb)' }}>{[ex.evenement.equipement, ex.evenement.alerte_id && `${tr('alerte', 'alerte')} #${ex.evenement.alerte_id}`, ex.evenement.intervention].filter(Boolean).join(' · ')}</span>
              {ex.origine !== 'automatique' && <span style={{ fontSize: '11px', color: '#8b5cf6' }}>({tr('o.' + ex.origine, ex.origine === 'relance' ? 'relance' : 'manuelle')})</span>}
              <span style={{ marginInlineStart: 'auto', color: 'var(--muted, #999)' }}>{ex.duree_ms !== null && `${(ex.duree_ms / 1000).toFixed(1)} s`} {ouverte === ex.id ? '▾' : '▸'}</span>
            </div>
            {ouverte === ex.id && <div style={{ margin: '8px 0 4px', paddingInlineStart: '12px', borderInlineStart: `2px solid ${ORANGE}` }}>
              {ex.etapes.map((e, k) => { const [c, i] = ETAPES[e.statut] || ['var(--neutre)', '•']; const x = libelle('actions', e.action); return (
                <div key={k} style={{ fontSize: '13px', margin: '4px 0', display: 'flex', gap: '8px' }}>
                  <span style={{ color: c, fontWeight: 'bold', width: 14 }}>{i}</span>
                  <span style={{ minWidth: 210 }}>{x.icone} {tr('a.' + e.action, x.libelle)}</span>
                  <span style={{ color: e.statut === 'erreur' ? 'var(--danger)' : 'var(--muted, #bbb)' }}>{e.message}{e.tentatives > 1 && ` · ${e.tentatives} ${tr('tentatives', 'tentatives')}`}</span>
                </div>); })}
              {ex.erreur && ex.statut === 'limite' && <div style={{ fontSize: '13px', color: '#94a3b8' }}>{ex.erreur}</div>}
              {['echec', 'partiel'].includes(ex.statut) && <button onClick={() => relancer(ex)} style={{ ...bouton('var(--attention)'), marginTop: '6px' }}>↻ {tr('relancer', 'Relancer')}</button>}
            </div>}
          </div>))}
      </div>}

      {/* SIMULATION */}
      {simulation && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ ...carte, width: '100%', maxWidth: '760px', maxHeight: '88vh', overflowY: 'auto', borderColor: 'var(--info)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--info)' }}>🧪 {tr('simulation', 'Simulation')} · {simulation.wf.nom}</h3>
          <div style={{ marginBottom: '10px' }}>{tr('simResume', 'Sur les {{j}} derniers jours, cette règle se serait déclenchée {{n}} fois. Rien n’a été modifié ni envoyé.', { j: simulation.res.periode_jours, n: simulation.res.declenchements })}</div>
          {simulation.res.exemples.map((x, k) => (
            <div key={k} style={{ borderTop: '1px solid var(--border, #2a2d3e)', padding: '8px 0', fontSize: '13px' }}>
              <b>{[x.evenement.date, x.evenement.equipement, x.evenement.alerte_id && `#${x.evenement.alerte_id}`, x.evenement.severite, x.evenement.nb_alertes && `${x.evenement.nb_alertes} alertes`].filter(Boolean).join(' · ')}</b>
              {x.etapes.map((e, i) => { const [c, ic] = ETAPES[e.statut] || ['var(--neutre)', '•']; return <div key={i} style={{ color: e.statut === 'erreur' ? 'var(--danger)' : 'var(--muted, #bbb)', marginInlineStart: '10px' }}><span style={{ color: c }}>{ic}</span> {e.message}</div>; })}
            </div>))}
          <button onClick={() => setSimulation(null)} style={{ ...bouton('var(--neutre)'), marginTop: '10px' }}>{tr('fermer', 'Fermer')}</button>
        </div>
      </div>}

      {/* ÉDITEUR */}
      {edition && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ ...carte, width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', borderColor: ORANGE }}>
          <h3 style={{ marginTop: 0, color: ORANGE }}>{edition.id ? '✏️ ' + tr('modifierRegle', 'Modifier la règle') : '➕ ' + tr('nouveau', 'Nouvelle règle')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '10px' }}>
            <input style={champ} placeholder={tr('nom', 'Nom de la règle')} value={edition.nom} onChange={e => setEdition({ ...edition, nom: e.target.value })} />
            <label style={{ fontSize: '12px', color: 'var(--muted, #999)' }}>{tr('maxHeure', 'Maximum par heure')}<input type="number" min="1" style={champ} value={edition.max_par_heure} onChange={e => setEdition({ ...edition, max_par_heure: e.target.value })} /></label>
          </div>

          <div style={{ ...carte, marginTop: '12px', borderColor: ORANGE + '88' }}>
            <b style={{ color: ORANGE }}>{tr('quand', 'QUAND')}</b>
            <select style={{ ...champ, marginTop: '8px' }} value={edition.declencheur.type} onChange={e => setEdition({ ...edition, declencheur: { type: e.target.value, params: {} } })}>
              {cat.declencheurs.map(d => <option key={d.type} value={d.type}>{d.icone} {tr('d.' + d.type, d.libelle)}</option>)}
            </select>
            <div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginTop: '6px' }}>{tr('dd.' + edition.declencheur.type, libelle('declencheurs', edition.declencheur.type).description)}</div>
            <Parametres cat={cat} tr={tr} type={edition.declencheur.type} defs={libelle('declencheurs', edition.declencheur.type).params} valeurs={edition.declencheur.params}
              onChange={p => setEdition({ ...edition, declencheur: { ...edition.declencheur, params: p } })} />
          </div>

          <div style={{ marginTop: '12px' }}>
            <b style={{ color: '#8b5cf6' }}>{tr('alors', 'ALORS')}</b>
            {edition.actions.map((a, k) => { const def = libelle('actions', a.type); const maj = (x) => setEdition({ ...edition, actions: edition.actions.map((y, i) => (i === k ? { ...y, ...x } : y)) }); return (
              <div key={k} style={{ ...carte, marginTop: '8px', borderColor: '#8b5cf688' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{k + 1}.</b>
                  <select style={{ ...champ, width: 'auto', flex: 1 }} value={a.type} onChange={e => maj({ type: e.target.value, params: {} })}>
                    {cat.actions.map(d => <option key={d.type} value={d.type}>{d.icone} {tr('a.' + d.type, d.libelle)}</option>)}
                  </select>
                  <button disabled={k === 0} onClick={() => { const l = [...edition.actions]; [l[k - 1], l[k]] = [l[k], l[k - 1]]; setEdition({ ...edition, actions: l }); }} style={bouton('#94a3b8', false)}>↑</button>
                  <button onClick={() => setEdition({ ...edition, actions: edition.actions.filter((_, i) => i !== k) })} style={bouton('var(--danger)', false)}>✕</button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginTop: '6px' }}>{tr('ad.' + a.type, def.description)}</div>
                <Parametres cat={cat} tr={tr} defs={def.params} valeurs={a.params || {}} onChange={p => maj({ params: p })} />
                <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap', fontSize: '13px', alignItems: 'center' }}>
                  <span>{tr('enCasErreur', 'En cas d’erreur')} :</span>
                  <select style={{ ...champ, width: 'auto' }} value={a.en_cas_erreur || 'continuer'} onChange={e => maj({ en_cas_erreur: e.target.value })}>
                    <option value="continuer">{tr('continuer', 'continuer avec les actions suivantes')}</option><option value="arreter">{tr('arreter', 'arrêter le workflow')}</option>
                  </select>
                  <span>{tr('essais', 'Essais')} :</span>
                  <input type="number" min="1" max="5" style={{ ...champ, width: '70px' }} value={a.tentatives ?? 3} onChange={e => maj({ tentatives: e.target.value })} />
                </div>
              </div>); })}
            <button onClick={() => setEdition({ ...edition, actions: [...edition.actions, { type: 'notifier_telegram', params: {}, en_cas_erreur: 'continuer', tentatives: 3 }] })} style={{ ...bouton('#8b5cf6', false), marginTop: '8px' }}>➕ {tr('ajouterAction', 'Ajouter une action')}</button>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted, #999)', marginTop: '10px' }}>{tr('variables', 'Variables utilisables dans les textes')} : {cat.variables.map(v => `{${v}}`).join(' ')}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={enregistrer} disabled={occupe || !edition.nom || !edition.actions.length} style={bouton('var(--succes)')}>💾 {tr('enregistrer', 'Enregistrer')}</button>
            <button onClick={() => setEdition(null)} style={bouton('var(--neutre)')}>{tr('annuler', 'Annuler')}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

export default Workflows;
