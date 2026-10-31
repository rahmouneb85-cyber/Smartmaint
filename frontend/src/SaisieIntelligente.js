import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { informer } from './Confirmation';

const ORANGE = 'var(--accent)';
const VOIX = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };

const langueDe = (i18n) => (['fr', 'en', 'ar'].includes(i18n.language) ? i18n.language : 'fr');

function signaler(token, donnees) {
  fetch(`${API}/saisie/usage`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) }).catch(() => {});
}

/**
 * Zone de texte avec autocomplétion multilingue, dictée vocale et reformulation.
 * Clavier : ↑ ↓ pour choisir, Tab ou Entrée pour accepter, Échap pour fermer.
 */
export function ChampIntelligent({ token, champ, value, onChange, equipementId, style, minHeight = '60px', placeholder }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut) => t('saisie.' + cle, { defaultValue: defaut });
  const langue = langueDe(i18n);
  const [liste, setListe] = useState([]);
  const [actif, setActif] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  const [reformulation, setReformulation] = useState(null);   // { avant, apres, methode }
  const [occupe, setOccupe] = useState(false);
  const minuteur = useRef(null);
  const demande = useRef(0);
  const reco = useRef(null);
  const zone = useRef(null);

  const chercher = (texte) => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      const n = ++demande.current;
      try {
        const r = await fetch(`${API}/saisie/suggestions`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ champ, texte, equipement_id: equipementId ? Number(equipementId) : null, langue }),
        });
        const d = r.ok ? await r.json() : { suggestions: [] };
        if (n !== demande.current) return;              // une frappe plus récente a déjà relancé la recherche
        setListe(d.suggestions || []); setActif(0);
        // la liste ne s'ouvre que si le champ a toujours le curseur (pas lors d'un remplissage automatique)
        setOuvert((d.suggestions || []).length > 0 && document.activeElement === zone.current);
      } catch (e) { setListe([]); }
    }, 220);
  };
  useEffect(() => () => clearTimeout(minuteur.current), []);

  const accepter = (s) => {
    const avant = value || '';
    onChange(s.remplacement);
    setOuvert(false); setListe([]);
    signaler(token, { type_aide: 'suggestion', champ, source: s.source, accepte: true, caracteres_economises: Math.max(0, s.remplacement.length - avant.length) });
    setTimeout(() => zone.current?.focus(), 0);
  };

  const clavier = (e) => {
    if (!ouvert || !liste.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif(a => (a + 1) % liste.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif(a => (a - 1 + liste.length) % liste.length); }
    else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); accepter(liste[actif]); }
    else if (e.key === 'Escape') { setOuvert(false); }
  };

  const dicter = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { informer(tr('voixIndispo', 'Saisie vocale indisponible dans ce navigateur (utilisez Chrome ou Edge).')); return; }
    if (ecoute) { reco.current?.stop(); return; }
    const debut = value ? value.replace(/\s*$/, ' ') : '';
    const r = new SR(); r.lang = VOIX[langue]; r.interimResults = true;
    r.onresult = (ev) => onChange(debut + Array.from(ev.results).map(x => x[0].transcript).join(''));
    r.onend = () => setEcoute(false);
    reco.current = r; setEcoute(true); r.start();
  };

  const reformuler = async () => {
    if (!(value || '').trim()) return;
    setOccupe(true);
    try {
      const r = await fetch(`${API}/saisie/reformuler`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: value, champ }) });
      const d = await r.json();
      if (r.ok && d.texte && d.texte !== value) setReformulation({ avant: value, apres: d.texte, methode: d.methode });
    } catch (e) { /* le texte d'origine est conservé */ }
    setOccupe(false);
  };

  const petitBouton = { background: 'transparent', border: '1px solid var(--border, #333)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text, white)', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'relative', marginBottom: '10px' }}>
      <textarea ref={zone} value={value} placeholder={placeholder}
        style={{ ...style, minHeight, marginBottom: 0, paddingInlineEnd: '76px' }}
        onChange={e => { onChange(e.target.value); chercher(e.target.value); }}
        onFocus={() => chercher(value || '')}
        onBlur={() => setTimeout(() => setOuvert(false), 180)}
        onKeyDown={clavier} />
      <div style={{ position: 'absolute', top: '6px', insetInlineEnd: '6px', display: 'flex', gap: '4px' }}>
        <button type="button" onClick={dicter} title={tr('dicter', 'Dicter')} style={{ ...petitBouton, background: ecoute ? '#ef4444' : 'transparent' }}>🎤</button>
        <button type="button" onClick={reformuler} disabled={occupe} title={tr('reformuler', 'Corriger et reformuler en français')} style={petitBouton}>{occupe ? '…' : '✨'}</button>
      </div>

      {ouvert && liste.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 30, insetInlineStart: 0, insetInlineEnd: 0, top: '100%', marginTop: '2px', background: 'var(--card, #1a1d2e)', border: `1px solid ${ORANGE}`, borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          {liste.map((s, k) => (
            <div key={k} onMouseDown={e => { e.preventDefault(); accepter(s); }} onMouseEnter={() => setActif(k)}
              style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', background: k === actif ? ORANGE + '30' : 'transparent' }}>
              <span>{s.texte}</span>
              <span style={{ color: 'var(--muted, #999)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {s.source === 'historique' ? `🕘 ${s.meme_equipement ? tr('memeEquipement', 'cet équipement') : tr('historique', 'historique')}${s.compte > 1 ? ` ×${s.compte}` : ''}`
                  : s.source === 'mot' ? `🔤 ${tr('mot', 'mot')}` : `📖 ${tr('vocabulaire', 'vocabulaire')}`}
              </span>
            </div>
          ))}
          <div style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--muted, #999)', borderTop: '1px solid var(--border, #2a2d3e)' }}>
            {tr('aideClavier', '↑ ↓ pour choisir · Tab ou Entrée pour accepter · Échap pour fermer')}
          </div>
        </div>
      )}

      {reformulation && (
        <div style={{ marginTop: '6px', border: '1px solid var(--info)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', background: '#3b82f614' }}>
          <div style={{ color: 'var(--muted, #999)', fontSize: '11px', marginBottom: '4px' }}>✨ {tr('proposition', 'Proposition')} ({reformulation.methode})</div>
          <div style={{ marginBottom: '6px' }}>{reformulation.apres}</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={{ ...petitBouton, background: 'var(--succes-fond)', border: 'none', color: 'white' }}
              onClick={() => { onChange(reformulation.apres); signaler(token, { type_aide: 'reformulation', champ, source: 'modele', accepte: true }); setReformulation(null); }}>{tr('remplacer', 'Remplacer')}</button>
            <button type="button" style={petitBouton}
              onClick={() => { signaler(token, { type_aide: 'reformulation', champ, source: 'modele', accepte: false }); setReformulation(null); }}>{tr('garder', 'Garder mon texte')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bouton « Proposer » : à partir de l'équipement, de l'alerte et de la description, propose les autres champs,
 * chacun avec sa justification. L'utilisateur coche ce qu'il veut appliquer.
 */
export function PropositionsIntelligentes({ token, demande, techniciens = [], onAppliquer, libelle }) {
  const { t } = useTranslation();
  const tr = (cle, defaut) => t('saisie.' + cle, { defaultValue: defaut });
  const [res, setRes] = useState(null);
  const [choix, setChoix] = useState({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const NOMS = { description: tr('c.description', 'Description'), priorite: tr('c.priorite', 'Priorité'), type_intervention: tr('c.type', 'Type'),
    technicien_id: tr('c.technicien', 'Technicien'), date_intervention: tr('c.date', 'Date prévue'), diagnostic: tr('c.diagnostic', 'Diagnostic probable'),
    actions_realisees: tr('c.actions', 'Actions'), pieces_remplacees: tr('c.pieces', 'Pièces') };

  const lancer = async () => {
    if (!demande.equipement_id) { setErreur(tr('choisirEquipement', "Choisissez d'abord l'équipement")); return; }
    setOccupe(true); setErreur(''); setRes(null);
    try {
      const r = await fetch(`${API}/saisie/proposer`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...demande, equipement_id: Number(demande.equipement_id), alerte_id: demande.alerte_id ? Number(demande.alerte_id) : null, avec_ia: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Erreur');
      const champs = Object.keys(d.propositions).filter(k => NOMS[k] && (demande.champs ? demande.champs.includes(k) : true));
      setRes({ ...d, champs });
      setChoix(Object.fromEntries(champs.map(k => [k, true])));
    } catch (e) { setErreur(e.message); }
    setOccupe(false);
  };

  const afficher = (k, v) => {
    if (k === 'technicien_id') return techniciens.find(x => String(x.id) === String(v))?.nom || `#${v}`;
    if (k === 'date_intervention') return new Date(v).toLocaleString();
    if (k === 'priorite') return t('interventions.priorites.' + v, { defaultValue: v });
    if (k === 'type_intervention') return t('interventions.types.' + v, { defaultValue: v });
    return v;
  };

  const appliquer = () => {
    const valeurs = Object.fromEntries(res.champs.filter(k => choix[k]).map(k => [k, String(res.propositions[k])]));
    onAppliquer(valeurs);
    signaler(token, { type_aide: 'proposition', champ: Object.keys(valeurs).join(',').slice(0, 40), source: res.methode.includes('+') ? 'modele' : 'historique', accepte: Object.keys(valeurs).length > 0 });
    setRes(null);
  };

  const bouton = (fond) => ({ background: fond, border: 'none', color: 'white', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' });

  return (
    <div style={{ margin: '10px 0' }}>
      <button type="button" onClick={lancer} disabled={occupe} style={{ ...bouton('linear-gradient(135deg,#FF6B00,#8b5cf6)'), opacity: occupe ? 0.6 : 1 }}>
        {occupe ? '⏳ ' + tr('analyse', 'Analyse de l’historique…') : '✨ ' + (libelle || tr('proposer', 'Proposer à partir de l’historique'))}
      </button>
      {erreur && <span style={{ color: 'var(--danger)', marginInlineStart: '10px', fontSize: '13px' }}>{erreur}</span>}

      {res && (
        <div style={{ marginTop: '10px', border: '1px solid #8b5cf6', borderRadius: '10px', padding: '12px', background: '#8b5cf610' }}>
          {res.champs.length === 0 && <div style={{ color: 'var(--muted, #999)' }}>{tr('rien', 'Aucune proposition : pas assez d’historique pour cette panne.')}</div>}
          {res.champs.map(k => (
            <label key={k} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!choix[k]} onChange={e => setChoix(c => ({ ...c, [k]: e.target.checked }))} style={{ marginTop: '3px' }} />
              <div>
                <div><b>{NOMS[k]} :</b> {afficher(k, res.propositions[k])}</div>
                {res.raisons?.[k] && <div style={{ fontSize: '11px', color: 'var(--muted, #999)' }}>↳ {res.raisons[k]}</div>}
              </div>
            </label>
          ))}
          {res.similaires?.length > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--muted, #999)', margin: '6px 0' }}>
              🕘 {tr('similaires', 'Interventions similaires')} : {res.similaires.map(s => s.numero).join(', ')}
            </div>
          )}
          {res.manuels?.length > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--muted, #999)', margin: '6px 0' }}>
              📘 {tr('manuel', 'À consulter dans le manuel')} : {res.manuels.map((m, i) => <div key={i} style={{ fontStyle: 'italic', marginTop: '2px' }}>« {m.extrait.slice(0, 160)}… » ({m.source})</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {res.champs.length > 0 && <button type="button" onClick={appliquer} style={bouton('var(--succes)')}>✅ {tr('appliquer', 'Appliquer la sélection')}</button>}
            <button type="button" onClick={() => setRes(null)} style={bouton('var(--neutre)')}>{tr('fermer', 'Fermer')}</button>
            <span style={{ fontSize: '11px', color: 'var(--muted, #999)', alignSelf: 'center' }}>{res.methode}</span>
          </div>
        </div>
      )}
    </div>
  );
}
