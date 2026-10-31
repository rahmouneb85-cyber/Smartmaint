import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';
const ERREURS_CONNUES = ['ollama_indisponible', 'delai_depasse', 'erreur_modele'];

function Assistant({ token, page, open, onClose, onLogout }) {
  const { i18n } = useTranslation();

  // Langue propre à l'assistant, indépendante de celle de la plateforme, et mémorisée
  const [langue, setLangue] = useState(localStorage.getItem('assistantLang') || i18n.language || 'fr');
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState('');
  const [chargement, setChargement] = useState(false);
  const finRef = useRef(null);

  // Traductions et sens d'écriture dans la langue de l'assistant (et non de la plateforme)
  const t = i18n.getFixedT(langue);
  const dir = LANGUES.find(l => l.code === langue)?.dir || 'ltr';

  useEffect(() => { localStorage.setItem('assistantLang', langue); }, [langue]);

  // Descend automatiquement vers le dernier message
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, chargement, open]);

  const envoyer = async (texte) => {
    const question = (texte ?? saisie).trim();
    if (!question || chargement) return;
    const nouveaux = [...messages, { role: 'user', content: question }];
    setMessages(nouveaux);
    setSaisie('');
    setChargement(true);

    const afficher = (contenu, role = 'assistant') =>
      setMessages([...nouveaux, { role, content: contenu }]);

    try {
      const res = await fetch(`${API}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: nouveaux, langue, page }),
      });
      if (res.status === 401 || res.status === 403) { onLogout(); return; }
      if (!res.ok || !res.body) throw new Error('erreur');

      // Lecture de la réponse morceau par morceau (streaming)
      const lecteur = res.body.getReader();
      const decodeur = new TextDecoder('utf-8');
      let reponse = '';
      while (true) {
        const { done, value } = await lecteur.read();
        if (done) break;
        reponse += decodeur.decode(value, { stream: true });

        const erreur = reponse.match(/\[\[ERREUR:(\w+)\]\]/);
        if (erreur) {
          const code = ERREURS_CONNUES.includes(erreur[1]) ? erreur[1] : 'erreur';
          afficher(t('assistant.errors.' + code), 'erreur');
          setChargement(false);
          return;
        }
        setChargement(false);   // le premier mot est arrivé : on retire « réfléchit... »
        afficher(reponse);
      }
      if (!reponse) throw new Error('erreur');
    } catch (e) {
      afficher(t('assistant.errors.erreur'), 'erreur');
    }
    setChargement(false);
  };

  // Affiche proprement le Markdown simple renvoyé par l'IA : **gras** et listes à puces
  const formater = (texte) => texte.split('\n').map((ligne, i) => {
    const propre = ligne.replace(/^\s*[*-]\s+/, '• ');
    const morceaux = propre.split(/\*\*(.+?)\*\*/g);
    return (
      <div key={i}>
        {morceaux.map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : p))}
        {propre === '' && '\u00A0'}
      </div>
    );
  });

  const bulle = (role) => ({
    maxWidth: '85%', padding: '10px 14px', borderRadius: '14px', fontSize: '14px', lineHeight: 1.5,
    wordBreak: 'break-word',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'var(--accent-fond)' : role === 'erreur' ? '#7f1d1d33' : 'var(--input, #0f1117)',
    color: role === 'user' ? 'white' : role === 'erreur' ? 'var(--danger)' : 'var(--text, white)',
    border: role === 'erreur' ? '1px solid var(--danger)' : 'none',
  });

  const petitBouton = { background: 'transparent', border: '1px solid var(--border, #2a2d3e)', color: 'var(--text, white)', borderRadius: '8px', padding: '5px 10px', minHeight: '30px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' };

  // Le cadre extérieur suit le sens de la PLATEFORME (panneau à droite en FR/EN, à gauche en AR)
  return (
    <aside aria-label={t('menu.assistant')} style={{
      display: open ? 'flex' : 'none', position: 'fixed', top: 0, insetInlineEnd: 0, zIndex: 1000,
      width: '380px', maxWidth: '100vw', height: '100vh',
      background: 'var(--card, #1a1d2e)', borderInlineStart: '2px solid var(--accent)',
      boxShadow: '0 0 30px rgba(0,0,0,0.35)', fontFamily: 'Arial',
    }}>
      {/* Le contenu suit le sens de la langue de l'ASSISTANT */}
      <div dir={dir} style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

        {/* EN-TÊTE */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #2a2d3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '16px' }}>🤖 {t('assistant.title')}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setMessages([])} style={petitBouton}>🗑️ {t('assistant.clear')}</button>
              <button onClick={onClose} title={t('assistant.close')} aria-label={t('assistant.close')} style={{ ...petitBouton, fontWeight: 'bold', minWidth: '32px' }}>✕</button>
            </div>
          </div>
          {/* Langue de l'assistant */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted, #888)' }}>
            <span>🌐 {t('assistant.language')} :</span>
            {LANGUES.map(l => (
              <button key={l.code} onClick={() => setLangue(l.code)} aria-pressed={langue === l.code} aria-label={l.label} lang={l.code}
                style={{
                  ...petitBouton, padding: '3px 9px', minWidth: '32px',
                  background: langue === l.code ? 'var(--accent-fond)' : 'transparent',
                  color: langue === l.code ? 'white' : 'var(--muted, #888)',
                  borderColor: langue === l.code ? 'var(--accent)' : 'var(--border, #2a2d3e)',
                }}>
                {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* CONVERSATION */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.length === 0 && (
            <>
              <div style={bulle('assistant')}>{t('assistant.welcome')}</div>
              {['s1', 's2', 's3'].map(s => (
                <button key={s} onClick={() => envoyer(t('assistant.suggestions.' + s))}
                  style={{ ...petitBouton, alignSelf: 'flex-start', textAlign: 'start', padding: '8px 12px', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  💡 {t('assistant.suggestions.' + s)}
                </button>
              ))}
            </>
          )}
          {messages.map((m, i) => <div key={i} style={bulle(m.role)}>{formater(m.content)}</div>)}
          {chargement && <div style={{ ...bulle('assistant'), color: 'var(--muted, #888)', fontStyle: 'italic' }}>⏳ {t('assistant.thinking')}</div>}
          <div ref={finRef} />
        </div>

        {/* SAISIE */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border, #2a2d3e)', display: 'flex', gap: '8px' }}>
          <textarea value={saisie} rows={2} placeholder={t('assistant.placeholder')}
            onChange={e => setSaisie(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
            style={{ flex: 1, resize: 'none', padding: '10px', borderRadius: '10px', border: '1px solid var(--border, #2a2d3e)', background: 'var(--input, #0f1117)', color: 'var(--text, white)', fontFamily: 'inherit', fontSize: '14px' }} />
          <button onClick={() => envoyer()} disabled={chargement || !saisie.trim()}
            style={{ background: 'var(--accent-fond)', border: 'none', color: 'white', borderRadius: '10px', padding: '0 16px', cursor: 'pointer', fontWeight: 'bold', opacity: chargement || !saisie.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>
            {t('assistant.send')}
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Assistant;
