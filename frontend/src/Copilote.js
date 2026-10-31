import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { informer } from './Confirmation';

const ORANGE = 'var(--accent)';
const VOIX = { fr: 'fr-FR', en: 'en-US', ar: 'ar-MA' };

const SUGGESTIONS = {
  fr: ["Quel équipement pose le plus de problèmes ce mois-ci ?", "Analyse la dernière alerte critique et propose un diagnostic",
       "Quelles interventions sont encore ouvertes ?", "La pompe P01 vibre : prépare un ordre d'intervention"],
  en: ["Which equipment has the most problems this month?", "Analyse the latest critical alert and suggest a diagnosis",
       "Which interventions are still open?", "Pump P01 is vibrating: prepare a work order"],
  ar: ["ما هي المعدات التي تسبب أكثر المشاكل هذا الشهر؟", "حلل آخر تنبيه حرج واقترح تشخيصًا",
       "ما هي التدخلات التي لا تزال مفتوحة؟", "المضخة P01 تهتز: حضّر أمر تدخل"],
};

// Mise en forme légère : **gras**, listes, et sources [Alerte #12] en badges
function Texte({ texte }) {
  const ligne = (l, k) => {
    const morceaux = l.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).filter(Boolean).map((m, j) => {
      if (m.startsWith('**')) return <strong key={j}>{m.slice(2, -2)}</strong>;
      if (/^\[(Alerte|Alert|OI-|FI-|Intervention|تنبيه)/.test(m))
        return <span key={j} style={{ background: 'color-mix(in srgb, var(--info) 13%, transparent)', color: '#60a5fa', borderRadius: '6px', padding: '0 6px', fontSize: '12px', whiteSpace: 'nowrap' }}>{m.slice(1, -1)}</span>;
      return <span key={j}>{m}</span>;
    });
    const puce = /^\s*([-*•]|\d+\.)\s+/.test(l);
    return <div key={k} style={{ margin: '3px 0', paddingInlineStart: puce ? '14px' : 0, textIndent: puce ? '-10px' : 0 }}>{morceaux}</div>;
  };
  const bloc = (l, k) => {
    if (!l.trim()) return <div key={k} style={{ height: '6px' }} />;
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) return <hr key={k} style={{ border: 'none', borderTop: '1px solid var(--border, #2a2d3e)', margin: '12px 0' }} />;
    const titre = l.match(/^\s*(#{1,4})\s+(.*)$/);
    if (titre) return <div key={k} style={{ fontWeight: 'bold', color: ORANGE, fontSize: titre[1].length <= 2 ? '17px' : '15.5px', margin: '10px 0 4px' }}>{titre[2].replace(/\*\*/g, '')}</div>;
    return ligne(l.replace(/^\s*[-*]\s+/, '• '), k);
  };
  return <div style={{ lineHeight: 1.6 }}>{texte.split('\n').map(bloc)}</div>;
}

// ─── Mémoire de la conversation ───
// Gardée hors du composant : elle survit au changement de page, et une réponse en cours continue d'arriver
// même si l'utilisateur va sur une autre page. Copie dans sessionStorage (onglet courant) pour survivre à F5.
const memoire = { cle: null, messages: [], enCours: false, abonnes: new Set() };

function cleMemoire(moi) { return 'smartmaint-copilote-' + (moi?.id ?? 'anonyme'); }

function chargerMemoire(cle) {
  if (memoire.cle === cle) return;
  memoire.cle = cle;
  memoire.enCours = false;
  try {
    const sauve = JSON.parse(sessionStorage.getItem(cle) || '[]');
    // une réponse interrompue par un rechargement de page ne reviendra pas : on l'indique
    memoire.messages = sauve.map(m => (m.enCours ? { ...m, enCours: false, erreur: m.texte ? undefined : 'Réponse interrompue (page rechargée). Reposez la question.' } : m));
  } catch (e) { memoire.messages = []; }
}

function majMemoire(fn) {
  memoire.messages = fn(memoire.messages);
  try { sessionStorage.setItem(memoire.cle, JSON.stringify(memoire.messages.slice(-40))); } catch (e) { /* stockage indisponible */ }
  memoire.abonnes.forEach(f => f());
}

// À la déconnexion, la conversation est effacée (elle ne doit pas rester visible pour le compte suivant)
if (typeof window !== 'undefined') {
  window.addEventListener('smartmaint-logout', () => {
    try { Object.keys(sessionStorage).filter(k => k.startsWith('smartmaint-copilote-')).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* rien */ }
    memoire.cle = null; memoire.messages = []; memoire.enCours = false;
  });
}

function Copilote({ token, moi }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut, opts = {}) => t('copilote.' + cle, { defaultValue: defaut, ...opts });
  const langue = ['fr', 'en', 'ar'].includes(i18n.language) ? i18n.language : 'fr';
  chargerMemoire(cleMemoire(moi));
  const [, rafraichir] = useState(0);
  useEffect(() => {
    const f = () => rafraichir(n => n + 1);
    memoire.abonnes.add(f);
    return () => memoire.abonnes.delete(f);
  }, []);
  const messages = memoire.messages;
  const enCours = memoire.enCours;
  const setMessages = (v) => majMemoire(typeof v === 'function' ? v : () => v);
  const setEnCours = (v) => { memoire.enCours = v; memoire.abonnes.forEach(f => f()); };
  const [saisie, setSaisie] = useState('');
  const [statut, setStatut] = useState(null);
  const [ecoute, setEcoute] = useState(false);
  const fin = useRef(null);
  const reco = useRef(null);
  const entetes = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const chargerStatut = useCallback(() => {
    fetch(`${API}/copilote/statut`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null)).then(setStatut).catch(() => {});
  }, [token]);
  useEffect(() => { chargerStatut(); }, [chargerStatut]);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);


  const envoyer = async (texte) => {
    const question = (texte ?? saisie).trim();
    if (!question || enCours) return;
    const historique = messages.filter(m => m.texte).map(m => ({ role: m.role, content: m.texte }));
    const idReponse = Date.now();
    // met à jour la réponse en cours, retrouvée par son identifiant (même si la conversation a bougé entre-temps)
    const majDernier = (fn) => setMessages(ms => ms.map(m => (m.id === idReponse ? fn({ ...m }) : m)));
    setMessages(ms => [...ms, { role: 'user', texte: question }, { role: 'assistant', id: idReponse, etapes: [], enCours: true }]);
    setSaisie('');
    setEnCours(true);
    try {
      const rep = await fetch(`${API}/copilote/question`, { method: 'POST', headers: entetes, body: JSON.stringify({ question, historique, langue }) });
      if (!rep.ok || !rep.body) throw new Error(`Erreur ${rep.status}`);
      const lecteur = rep.body.getReader();
      const dec = new TextDecoder();
      let tampon = '';
      for (;;) {
        const { value, done } = await lecteur.read();
        if (done) break;
        tampon += dec.decode(value, { stream: true });
        const lignes = tampon.split('\n');
        tampon = lignes.pop();
        for (const l of lignes) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l);
          if (ev.type === 'etape') majDernier(m => ({ ...m, etapes: [...m.etapes, { libelle: ev.libelle, outil: ev.outil, statut: 'en_cours' }] }));
          else if (ev.type === 'resultat_etape') majDernier(m => {
            const e = [...m.etapes]; const i = e.map(x => x.outil).lastIndexOf(ev.outil);
            if (i >= 0) e[i] = { ...e[i], statut: ev.statut };
            return { ...m, etapes: e };
          });
          else if (ev.type === 'reponse') majDernier(m => ({ ...m, enCours: false, texte: ev.texte, sources: ev.sources, actions: ev.actions,
            echangeId: ev.echange_id, info: `${ev.modele} · ${(ev.duree_ms / 1000).toFixed(1)} s` }));
          else if (ev.type === 'erreur') majDernier(m => ({ ...m, enCours: false, erreur: ev.message }));
        }
      }
    } catch (e) {
      majDernier(m => ({ ...m, enCours: false, erreur: tr('erreurReseau', 'Le copilote est injoignable. Vérifiez que le backend tourne.') }));
    }
    majDernier(m => ({ ...m, enCours: false }));
    setEnCours(false);
  };

  const agir = async (msgIndex, action, verbe) => {
    try {
      const r = await fetch(`${API}/copilote/actions/${action.id}/${verbe}`, { method: 'POST', headers: entetes });
      const d = await r.json().catch(() => ({}));
      const nouveau = r.ok ? (verbe === 'confirmer' ? 'confirmee' : 'annulee') : 'echec';
      setMessages(ms => ms.map((m, i) => i !== msgIndex ? m : {
        ...m, actions: m.actions.map(a => a.id === action.id ? { ...a, statut: nouveau, message: d.message || d.detail } : a) }));
    } catch (e) { /* le message d'erreur reste affiché sur la carte */ }
  };

  const avis = (msgIndex, valeur) => {
    const m = messages[msgIndex];
    fetch(`${API}/copilote/echanges/${m.echangeId}/avis`, { method: 'POST', headers: entetes, body: JSON.stringify({ avis: valeur }) });
    setMessages(ms => ms.map((x, i) => (i === msgIndex ? { ...x, avis: valeur } : x)));
  };

  const dicter = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { informer(tr('voixIndispo', 'La saisie vocale n\'est pas disponible dans ce navigateur (utilisez Chrome ou Edge).')); return; }
    if (ecoute) { reco.current?.stop(); return; }
    const r = new SR();
    r.lang = VOIX[langue]; r.interimResults = true;
    r.onresult = (e) => setSaisie(Array.from(e.results).map(x => x[0].transcript).join(''));
    r.onend = () => setEcoute(false);
    reco.current = r; setEcoute(true); r.start();
  };

  const indexer = async () => {
    await fetch(`${API}/copilote/indexer`, { method: 'POST', headers: entetes });
    chargerStatut();
  };

  const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '14px' };
  const enLigne = statut && (statut.ollama_disponible || statut.gemini_configure);

  return (
    <div style={{ ...carte, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: '480px' }}>
      <style>{`@keyframes cop-pulse{0%,100%{opacity:.35}50%{opacity:1}} .cop-sugg:hover{border-color:${ORANGE}!important;transform:translateY(-2px)}`}</style>

      {/* EN-TÊTE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border, #2a2d3e)', flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: '12px', background: `linear-gradient(135deg, ${ORANGE}, #8b5cf6)`, display: 'grid', placeItems: 'center', fontSize: '20px' }}>✨</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', fontSize: '17px' }}>{tr('titre', 'Copilote de maintenance')}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>
            <span style={{ color: enLigne ? 'var(--succes)' : 'var(--danger)' }}>●</span>{' '}
            {statut ? `${statut.ordre[0] === 'gemini' ? statut.modele_en_ligne : statut.modele_local} · ${statut.documents_indexes} ${tr('documents', 'documents indexés')}` : '…'}
          </div>
        </div>
        {moi && ['admin', 'superviseur'].includes(moi.role) && (
          <button onClick={indexer} title={tr('indexerAide', 'Mettre à jour la base de connaissances')} style={{ background: 'transparent', border: '1px solid var(--border, #333)', color: 'var(--text, white)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
            🔄 {tr('indexer', 'Mettre à jour les connaissances')}
          </button>
        )}
        {messages.length > 0 && !enCours && (
          <button onClick={() => setMessages([])} style={{ background: 'transparent', border: '1px solid var(--border, #333)', color: 'var(--text, white)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px' }}>
            ➕ {tr('nouvelle', 'Nouvelle conversation')}
          </button>
        )}
      </div>

      {/* CONVERSATION */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {messages.length === 0 && (
          <div style={{ maxWidth: '760px', margin: '30px auto', textAlign: 'center' }}>
            <div style={{ fontSize: '26px', fontWeight: 'bold', marginBottom: '8px' }}>
              {tr('bonjour', 'Bonjour {{nom}}, que puis-je faire pour vous ?', { nom: (moi?.nom || '').split(' ')[0] })}
            </div>
            <div style={{ color: 'var(--muted, #888)', marginBottom: '26px' }}>
              {tr('intro', "J'analyse les équipements, les alertes et l'historique des interventions, et je peux préparer des actions pour vous.")}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {SUGGESTIONS[langue].map(s => (
                <button key={s} className="cop-sugg" onClick={() => envoyer(s)}
                  style={{ textAlign: 'start', background: 'var(--bg, #0f1117)', border: '1px solid var(--border, #2a2d3e)', borderRadius: '12px', padding: '14px', color: 'var(--text, white)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', transition: 'all .15s' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0' }}>
            <div style={{ background: ORANGE, color: 'white', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', maxWidth: '75%' }}>{m.texte}</div>
          </div>
        ) : (
          <div key={i} style={{ margin: '14px 0', maxWidth: '88%' }}>
            {/* étapes de l'agent */}
            {m.etapes?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {m.etapes.map((e, k) => (
                  <span key={k} style={{ fontSize: '12px', padding: '3px 9px', borderRadius: '20px', border: '1px solid var(--border, #2a2d3e)',
                    color: e.statut === 'erreur' ? 'var(--attention)' : 'var(--muted, #aaa)', animation: e.statut === 'en_cours' ? 'cop-pulse 1.2s infinite' : 'none' }}>
                    {e.statut === 'en_cours' ? '⏳' : e.statut === 'erreur' ? '↻' : '✓'} {t('copilote.outil.' + e.outil, { defaultValue: e.libelle })}
                  </span>
                ))}
              </div>
            )}
            {m.enCours && !m.texte && (
              <div style={{ color: 'var(--muted, #888)', animation: 'cop-pulse 1.2s infinite' }}>✨ {tr('reflexion', 'Le copilote analyse les données…')}</div>
            )}
            {m.texte && <div style={{ ...carte, background: 'var(--bg, #0f1117)', padding: '14px 16px', borderRadius: '4px 14px 14px 14px' }}><Texte texte={m.texte} /></div>}
            {m.erreur && <div style={{ color: 'var(--danger)', marginTop: '6px' }}>⚠️ {m.erreur}</div>}

            {/* actions à confirmer */}
            {m.actions?.map(a => (
              <div key={a.id} style={{ marginTop: '10px', border: `1px solid ${a.statut === 'confirmee' ? 'var(--succes)' : ORANGE}`, borderRadius: '12px', padding: '12px 14px', background: a.statut === 'confirmee' ? '#22c55e11' : '#FF6B0011' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted, #888)', marginBottom: '4px' }}>🛠️ {tr('actionProposee', 'Action proposée')}</div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{a.resume}</div>
                <div style={{ fontSize: '13px', color: 'var(--muted, #aaa)', marginBottom: '10px' }}>{a.parametres?.description}</div>
                {a.statut === 'en_attente' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => agir(i, a, 'confirmer')} style={{ background: 'var(--succes-fond)', border: 'none', color: 'white', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>✅ {tr('confirmer', 'Confirmer')}</button>
                    <button onClick={() => agir(i, a, 'annuler')} style={{ background: 'var(--neutre-fond)', border: 'none', color: 'white', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>{tr('annuler', 'Annuler')}</button>
                  </div>
                ) : (
                  <div style={{ color: a.statut === 'confirmee' ? 'var(--succes)' : a.statut === 'echec' ? 'var(--danger)' : 'var(--muted, #888)' }}>
                    {a.statut === 'confirmee' ? '✅ ' : a.statut === 'echec' ? '⚠️ ' : ''}{a.message || tr('st.' + a.statut, a.statut)}
                  </div>
                )}
              </div>
            ))}

            {/* sources et avis */}
            {m.texte && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: 'var(--muted, #888)' }}>
                {m.sources?.length > 0 && <span>📎 {tr('sources', 'Sources')} :</span>}
                {m.sources?.map((s, k) => <span key={k} style={{ border: '1px solid var(--border, #2a2d3e)', borderRadius: '6px', padding: '1px 7px' }}>{s.libelle}</span>)}
                <span style={{ marginInlineStart: 'auto' }}>{m.info}</span>
                {m.echangeId && (m.avis ? <span>{m.avis > 0 ? '👍' : '👎'}</span> : (
                  <>
                    <button onClick={() => avis(i, 1)} title={tr('utile', 'Réponse utile')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>👍</button>
                    <button onClick={() => avis(i, -1)} title={tr('pasUtile', 'Réponse pas utile')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>👎</button>
                  </>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={fin} />
      </div>

      {/* SAISIE */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border, #2a2d3e)' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--bg, #0f1117)', border: '1px solid var(--border, #333)', borderRadius: '14px', padding: '8px' }}>
          <textarea value={saisie} onChange={e => setSaisie(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            placeholder={tr('placeholder', 'Posez une question ou demandez une action…')}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text, white)', fontFamily: 'inherit', fontSize: '15px', padding: '6px', maxHeight: '120px' }} />
          <button onClick={dicter} title={tr('voix', 'Dicter')} style={{ background: ecoute ? '#ef4444' : 'transparent', border: '1px solid var(--border, #333)', borderRadius: '10px', width: 40, height: 40, cursor: 'pointer', fontSize: '16px', animation: ecoute ? 'cop-pulse 1s infinite' : 'none' }}>🎤</button>
          <button onClick={() => envoyer()} disabled={enCours || !saisie.trim()} style={{ background: ORANGE, border: 'none', borderRadius: '10px', width: 40, height: 40, cursor: enCours ? 'wait' : 'pointer', color: 'white', fontSize: '18px', opacity: enCours || !saisie.trim() ? 0.5 : 1 }}>➤</button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted, #888)', marginTop: '6px', textAlign: 'center' }}>
          {tr('avertissement', "Le copilote s'appuie sur les données de SmartMaint et ne modifie rien sans votre confirmation.")}
        </div>
      </div>
    </div>
  );
}

export default Copilote;
