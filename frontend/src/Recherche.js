import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';

// Recherche intelligente du bouton flottant (raccourci Ctrl+K).
// Les pages sont cherchées dans l'interface, selon le rôle ; les données sont cherchées par le serveur,
// qui applique les mêmes droits que les pages (aucune donnée non autorisée n'est renvoyée).

const ICONES = { pages: '🧭', equipements: '🏭', interventions: '🔧', documents: '📄', support: '🛟', workflows: '⚙️', utilisateurs: '👤' };
const PAGES = [['dashboard', '📊'], ['equipements', '🏭'], ['capteurs', '📡'], ['interventions', '🔧'], ['room', '🎥'], ['copilote', '✨'], ['documents', '📄'], ['compte', '👤']];
const sansAccents = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAX_RECENTES = 5;

function lireRecentes(cle) {
  try { return JSON.parse(localStorage.getItem(cle) || '[]').slice(0, MAX_RECENTES); } catch { return []; }
}

export function PanneauRecherche({ style, tr, moi, aller, ouvrirSupport, ouvrirMessage }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [donnees, setDonnees] = useState(null);           // réponse du serveur
  const [attente, setAttente] = useState(false);
  const [actif, setActif] = useState(0);
  const cle = `smartmaint_recherches_${moi?.id || 'x'}`;
  const [recentes, setRecentes] = useState(() => lireRecentes(cle));
  const champ = useRef(null);

  useEffect(() => { champ.current?.focus(); }, []);

  // pages accessibles au rôle, filtrées sur le texte saisi (dans la langue affichée)
  const pages = useMemo(() => {
    const role = moi?.role;
    const liste = [...PAGES, ...(['admin', 'superviseur'].includes(role) ? [['workflows', '⚙️']] : []), ...(role === 'admin' ? [['securite', '🛡️'], ['parametres', '🎛️']] : [])];
    const mots = sansAccents(q).split(/\s+/).filter(m => m.length > 1);
    if (!mots.length) return [];
    return liste.map(([id, icone]) => ({ id, icone, titre: t('menu.' + id) }))
      .filter(p => mots.every(m => sansAccents(p.titre + ' ' + p.id).includes(m)))
      .map(p => ({ ...p, page: p.id }));
  }, [q, moi, t]);

  // données : appel au serveur 250 ms après la dernière frappe
  useEffect(() => {
    const texte = q.trim();
    if (texte.length < 2) { setDonnees(null); return; }
    setAttente(true);
    const controle = new AbortController();
    const id = setTimeout(() => {
      fetch(`${API}/recherche?q=${encodeURIComponent(texte)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: controle.signal })
        .then(r => (r.ok ? r.json() : null)).then(d => { setDonnees(d); setAttente(false); setActif(0); })
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(id); controle.abort(); };
  }, [q]);

  const groupes = useMemo(() => [
    ...(pages.length ? [{ groupe: 'pages', elements: pages }] : []),
    ...(donnees?.resultats || []),
  ], [pages, donnees]);
  const elements = groupes.flatMap(g => g.elements.map(e => ({ ...e, groupe: g.groupe })));

  const memoriser = () => {
    const texte = q.trim();
    if (texte.length < 2) return;
    const liste = [texte, ...recentes.filter(r => r !== texte)].slice(0, MAX_RECENTES);
    setRecentes(liste);
    try { localStorage.setItem(cle, JSON.stringify(liste)); } catch { /* stockage indisponible : sans conséquence */ }
  };
  const choisir = (e) => {
    memoriser();
    if (e.action === 'support') ouvrirSupport(e.id);
    else if (e.action === 'message') ouvrirMessage(e.id);
    else aller(e.page);
  };
  const clavier = (ev) => {
    if (!elements.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActif((actif + 1) % elements.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActif((actif - 1 + elements.length) % elements.length); }
    else if (ev.key === 'Enter') { ev.preventDefault(); choisir(elements[actif]); }
  };
  useEffect(() => { document.getElementById(`fab-res-${actif}`)?.scrollIntoView({ block: 'nearest' }); }, [actif]);

  const comprise = donnees?.comprise;
  const puces = comprise ? [
    comprise.numero != null && `n° ${comprise.numero}`,
    comprise.type && t('menu.' + comprise.type, { defaultValue: comprise.type }),
    ...Object.values(comprise.filtres || {}).map(v => tr('st.' + v, v)),
  ].filter(Boolean) : [];
  const muet = { color: 'var(--muted, #888)', fontSize: 13, padding: '4px 16px', margin: 0 };
  let index = -1;

  return (
    <section aria-labelledby="fab-recherche-titre" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border, #2a2d3e)', position: 'sticky', top: 0, background: 'var(--card, #1a1d2e)', zIndex: 1 }}>
        <h2 id="fab-recherche-titre" style={{ margin: '0 0 8px', fontSize: 16 }}>🔎 {tr('recherche', 'Recherche')}</h2>
        <input ref={champ} value={q} onChange={e => setQ(e.target.value)} onKeyDown={clavier} maxLength={100} className="fab-champ" style={{ width: '100%' }}
          role="combobox" aria-expanded={elements.length > 0} aria-controls="fab-resultats" aria-autocomplete="list"
          aria-activedescendant={elements.length ? `fab-res-${actif}` : undefined}
          aria-label={tr('rechercheAide', 'Équipement, intervention, document, collègue, page…')}
          placeholder={tr('rechercheAide', 'Équipement, intervention, document, collègue, page…')} />
        {puces.length > 0 && <div style={{ marginTop: 6 }} aria-label={tr('compris', 'Filtres reconnus')}>{puces.map(p => <span key={p} className="fab-puce">{p}</span>)}</div>}
      </div>

      {q.trim().length < 2 && (
        <>
          {recentes.length > 0 && <h3 className="fab-recherche-groupe">{tr('recentes', 'Recherches récentes')}</h3>}
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px' }}>
            {recentes.map(r => <li key={r}><button className="fab-ligne" onClick={() => setQ(r)}><span aria-hidden="true">🕘</span>{r}</button></li>)}
          </ul>
          <p style={{ ...muet, fontSize: 12, padding: '8px 16px 12px' }}>{tr('exemples', 'Exemples : « pompe atelier », « #12 », « urgente en cours », « en panne ».')}</p>
        </>
      )}
      {q.trim().length >= 2 && attente && !donnees && <p style={muet}>{tr('chargement', 'Chargement…')}</p>}
      {q.trim().length >= 2 && donnees && elements.length === 0 && <p style={muet} role="status">{tr('aucunResultat', 'Aucun résultat accessible pour cette recherche.')}</p>}

      <div id="fab-resultats" role="listbox" aria-label={tr('resultats', 'Résultats')} style={{ paddingBottom: 6 }}>
        {groupes.map(g => (
          <div key={g.groupe} role="group" aria-labelledby={`fab-groupe-${g.groupe}`}>
            <h3 id={`fab-groupe-${g.groupe}`} className="fab-recherche-groupe" role="presentation">{ICONES[g.groupe]} {tr('g.' + g.groupe, g.groupe)}</h3>
            {g.elements.map(e => {
              index += 1;
              const i = index;
              return (
                <div key={g.groupe + e.id} id={`fab-res-${i}`} role="option" aria-selected={i === actif} className="fab-ligne fab-resultat"
                  onClick={() => choisir({ ...e, groupe: g.groupe })} onMouseEnter={() => setActif(i)} style={{ margin: '0 6px', width: 'auto' }}>
                  {e.icone && <span aria-hidden="true">{e.icone}</span>}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.titre}</span>
                    {e.detail && <span className="fab-detail" style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.detail}</span>}
                  </span>
                  {e.statut && <span className="fab-puce">{tr('st.' + e.statut, e.statut)}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div aria-live="polite" className="visuellement-cache">{donnees ? tr('nbResultats', '{{n}} résultat(s)', { n: elements.length }) : ''}</div>
    </section>
  );
}
