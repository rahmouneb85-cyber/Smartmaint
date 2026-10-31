import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';

// Messagerie interne et contacts WhatsApp, ouverts depuis les boutons flottants.
// Toutes les données viennent du serveur, qui ne renvoie que les conversations du compte connecté
// et les numéros que les collègues ont choisi de partager.

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
const entete = (json) => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
const appeler = async (chemin, methode = 'GET', corps) => {
  const r = await fetch(`${API}${chemin}`, { method: methode, headers: entete(!!corps), body: corps ? JSON.stringify(corps) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : String(r.status));
  return d;
};

const ROLES = { admin: '🛡️', superviseur: '📋', technicien: '🔧' };

function Initiales({ nom, couleur = '#1d4ed8' }) {
  const ini = (nom || '?').split(' ').map(m => m[0]).slice(0, 2).join('').toUpperCase();
  return <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 18, background: couleur, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 13, flexShrink: 0 }}>{ini}</span>;
}

function Recherche({ valeur, surChangement, libelle }) {
  return <input value={valeur} onChange={e => surChangement(e.target.value)} placeholder={libelle} aria-label={libelle} className="fab-champ" style={{ width: '100%' }} />;
}

// ─────────────────────────────────────────────────────────────
// MESSAGERIE INTERNE
// ─────────────────────────────────────────────────────────────
export function PanneauMessagerie({ style, tr, surChangement, conversationInitiale }) {
  const { i18n } = useTranslation();
  const [vue, setVue] = useState(conversationInitiale ? 'conversation' : 'liste');   // liste | contacts | conversation
  const [conversations, setConversations] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [active, setActive] = useState(conversationInitiale || null);       // { id, contact }
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState('');
  const fin = useRef(null);

  const chargerListe = useCallback(() => appeler('/messagerie/conversations').then(setConversations).catch(() => setConversations([])), []);
  useEffect(() => { chargerListe(); }, [chargerListe]);

  useEffect(() => {
    if (vue !== 'contacts') return;
    const id = setTimeout(() => appeler(`/messagerie/contacts?q=${encodeURIComponent(filtre)}`).then(setContacts).catch(() => setContacts([])), 250);
    return () => clearTimeout(id);
  }, [vue, filtre]);

  // conversation ouverte : nouveaux messages toutes les 5 secondes
  const dernierId = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => {
    if (vue !== 'conversation' || !active) return;
    let actif = true;
    const lire = (apres) => appeler(`/messagerie/conversations/${active.id}/messages?apres_id=${apres}`)
      .then(m => { if (actif && m.length) { setMessages(prec => [...prec.filter(x => x.id <= apres), ...m]); surChangement?.(); } }).catch(() => {});
    if (!dernierId) lire(0);
    const id = setInterval(() => lire(dernierId), 5000);
    return () => { actif = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relance quand un nouveau message arrive
  }, [vue, active, dernierId]);

  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const ouvrir = async (contactId) => {
    try {
      const c = await appeler('/messagerie/conversations', 'POST', { destinataire_id: contactId });
      setMessages([]); setActive(c); setVue('conversation');
    } catch (e) { setErreur(e.message); }
  };
  const envoyer = async (e) => {
    e.preventDefault();
    const texte = saisie.trim();
    if (!texte) return;
    try {
      const m = await appeler(`/messagerie/conversations/${active.id}/messages`, 'POST', { texte });
      setMessages(prec => [...prec, m]); setSaisie(''); setErreur('');
    } catch (err) { setErreur(err.message); }
  };
  const date = (d) => new Date(d).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const retour = { background: 'none', border: 'none', color: 'var(--text, #fff)', cursor: 'pointer', fontSize: 18, minWidth: 40, minHeight: 40 };
  const enTete = (titre, retourVers) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border, #2a2d3e)', position: 'sticky', top: 0, background: 'var(--card, #1a1d2e)', zIndex: 1 }}>
      {retourVers && <button onClick={() => { setVue(retourVers); if (retourVers === 'liste') chargerListe(); }} aria-label={tr('retour', 'Retour')} style={retour}><span aria-hidden="true">{i18n.dir() === 'rtl' ? '→' : '←'}</span></button>}
      <h2 id="fab-msg-titre" style={{ margin: 0, fontSize: 16, flex: 1 }}>{titre}</h2>
    </div>
  );

  return (
    <section aria-labelledby="fab-msg-titre" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      {vue === 'liste' && (
        <>
          {enTete('💬 ' + tr('messagerie', 'Messagerie'))}
          <div style={{ padding: 10 }}>
            <button className="fab-envoyer" style={{ width: '100%' }} onClick={() => { setFiltre(''); setVue('contacts'); }}>✏️ {tr('nouveau', 'Nouveau message')}</button>
          </div>
          {conversations === null && <p style={{ padding: '0 16px', color: 'var(--muted, #888)' }}>{tr('chargement', 'Chargement…')}</p>}
          {conversations?.length === 0 && <p style={{ padding: '0 16px', color: 'var(--muted, #888)' }}>{tr('aucuneConv', 'Aucune conversation pour le moment.')}</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 6px' }}>
            {conversations?.map(c => (
              <li key={c.id}>
                <button className="fab-ligne" onClick={() => { setMessages([]); setActive(c); setVue('conversation'); }}>
                  <Initiales nom={c.contact?.nom} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'start' }}>
                    <span style={{ display: 'block', fontWeight: c.non_lus ? 'bold' : 'normal' }}>{c.contact?.nom || '—'}</span>
                    <span style={{ display: 'block', color: 'var(--muted, #888)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.dernier ? (c.dernier.moi ? tr('vous', 'Vous : ') : '') + c.dernier.texte : ''}
                    </span>
                  </span>
                  {c.non_lus > 0 && <span style={{ background: 'var(--info-fond)', color: '#fff', borderRadius: 10, minWidth: 20, height: 20, fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}
                    aria-label={tr('nonLusConv', '{{n}} non lu(s)', { n: c.non_lus })}>{c.non_lus}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'contacts' && (
        <>
          {enTete('✏️ ' + tr('nouveau', 'Nouveau message'), 'liste')}
          <div style={{ padding: 10 }}><Recherche valeur={filtre} surChangement={setFiltre} libelle={tr('rechercherContact', 'Rechercher un collègue')} /></div>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 6px' }}>
            {contacts.map(c => (
              <li key={c.id}>
                <button className="fab-ligne" onClick={() => ouvrir(c.id)}>
                  <Initiales nom={c.nom} />
                  <span style={{ textAlign: 'start' }}>{c.nom}<span style={{ display: 'block', fontSize: 12, color: 'var(--muted, #888)' }}>{ROLES[c.role]} {tr('role.' + c.role, c.role)}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'conversation' && active && (
        <>
          {enTete(active.contact?.nom || '—', 'liste')}
          <div aria-live="polite" style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
            {messages.length === 0 && <p style={{ color: 'var(--muted, #888)', fontSize: 13, margin: 0 }}>{tr('premierMessage', 'Écrivez le premier message.')}</p>}
            {messages.map(m => (
              <div key={m.id} style={{ alignSelf: m.moi ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                <div style={{ padding: '8px 12px', borderRadius: 12, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  background: m.moi ? 'var(--accent-fond)' : 'var(--bg, #0f1117)', color: m.moi ? '#fff' : 'var(--text, #fff)' }}>{m.texte}</div>
                <div style={{ fontSize: 11, color: 'var(--muted, #888)', marginTop: 2, textAlign: m.moi ? 'end' : 'start' }}>{date(m.date)}</div>
              </div>
            ))}
            <div ref={fin} />
          </div>
          {erreur && <p role="alert" style={{ margin: '0 12px', color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
          <form onSubmit={envoyer} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border, #2a2d3e)', position: 'sticky', bottom: 0, background: 'var(--card, #1a1d2e)' }}>
            <input value={saisie} onChange={e => setSaisie(e.target.value)} maxLength={2000} aria-label={tr('votreMessage', 'Votre message')}
              placeholder={tr('votreMessage', 'Votre message')} className="fab-champ" autoFocus />
            <button type="submit" disabled={!saisie.trim()} className="fab-envoyer">{tr('envoyer', 'Envoyer')}</button>
          </form>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// WHATSAPP : collègues ayant partagé leur numéro, et réglage de mon propre numéro
// ─────────────────────────────────────────────────────────────
export function PanneauWhatsApp({ style, tr, moi, ouvrirMessagerie }) {
  const [contacts, setContacts] = useState(null);
  const [filtre, setFiltre] = useState('');
  const [numero, setNumero] = useState(moi?.telephone ? '+' + moi.telephone : '');
  const [visible, setVisible] = useState(!!moi?.telephone_visible);
  const [etat, setEtat] = useState('');

  // coordonnées à jour (elles ont pu être modifiées depuis la connexion)
  useEffect(() => {
    appeler('/auth/me').then(u => { setNumero(u.telephone ? '+' + u.telephone : ''); setVisible(!!u.telephone_visible); }).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => appeler(`/messagerie/contacts?q=${encodeURIComponent(filtre)}`).then(setContacts).catch(() => setContacts([])), 250);
    return () => clearTimeout(id);
  }, [filtre]);

  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      const r = await appeler('/messagerie/mes-coordonnees', 'PUT', { telephone: numero, visible });
      setVisible(r.visible); setEtat('ok');
    } catch (err) { setEtat(err.message); }
  };

  return (
    <section aria-labelledby="fab-wa-titre" style={style}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #2a2d3e)' }}>
        <h2 id="fab-wa-titre" style={{ margin: 0, fontSize: 16 }}>💬 WhatsApp</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted, #888)' }}>{tr('waAide', 'Seuls les collègues qui ont choisi de partager leur numéro sont joignables.')}</p>
      </div>
      <div style={{ padding: 10 }}><Recherche valeur={filtre} surChangement={setFiltre} libelle={tr('rechercherContact', 'Rechercher un collègue')} /></div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px' }}>
        {contacts?.map(c => (
          <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px' }}>
            <Initiales nom={c.nom} couleur={c.whatsapp ? '#15803d' : '#4b5563'} />
            <span style={{ flex: 1, minWidth: 0 }}>{c.nom}
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted, #888)' }}>{c.whatsapp ? <span dir="ltr">+{c.whatsapp}</span> : tr('nonPartage', 'Numéro non partagé')}</span>
            </span>
            {c.whatsapp
              ? <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer" className="fab-envoyer" style={{ background: '#15803d', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                  aria-label={tr('ouvrirWa', 'Ouvrir WhatsApp avec {{nom}}', { nom: c.nom })}>WhatsApp</a>
              : <button onClick={() => ouvrirMessagerie(c.id)} className="fab-envoyer" style={{ background: 'var(--info-fond)' }}
                  aria-label={tr('ecrireA', 'Écrire à {{nom}}', { nom: c.nom })}>{tr('message', 'Message')}</button>}
          </li>
        ))}
        {contacts?.length === 0 && <li style={{ padding: 10, color: 'var(--muted, #888)' }}>{tr('aucunContact', 'Aucun collègue trouvé.')}</li>}
      </ul>
      <form onSubmit={enregistrer} style={{ padding: 12, borderTop: '1px solid var(--border, #2a2d3e)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="fab-mon-numero" style={{ fontSize: 13, fontWeight: 'bold' }}>{tr('monNumero', 'Mon numéro WhatsApp')}</label>
        <input id="fab-mon-numero" value={numero} onChange={e => { setNumero(e.target.value); setEtat(''); }} placeholder="+213 6 12 34 56 78" inputMode="tel" dir="ltr" className="fab-champ" />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={visible} onChange={e => { setVisible(e.target.checked); setEtat(''); }} style={{ width: 18, height: 18 }} />
          {tr('partager', 'Partager mon numéro avec mes collègues')}
        </label>
        {etat && <p role="status" style={{ margin: 0, fontSize: 13, color: etat === 'ok' ? 'var(--succes)' : 'var(--danger)' }}>{etat === 'ok' ? tr('enregistre', 'Enregistré') : etat}</p>}
        <button type="submit" className="fab-envoyer">{tr('enregistrer', 'Enregistrer')}</button>
      </form>
    </section>
  );
}
