import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { LANGUES } from './i18n';
import { PanneauMessagerie, PanneauWhatsApp } from './Messagerie';
import { PanneauSupport } from './Support';
import { PanneauRecherche } from './Recherche';

// ─────────────────────────────────────────────────────────────
// BOUTONS FLOTTANTS
// Un seul composant pour toute l'application :
//   mode « public » : page de connexion (assistant limité, WhatsApp de l'entreprise, contact, langue)
//   mode « prive »  : après connexion (recherche, assistant, copilote, notifications, messagerie, WhatsApp, support,
//                     actions rapides, langue, thème, compte)
// Position gérée ici seulement : « inset-inline-end » place les boutons à droite en français et en anglais,
// et automatiquement à gauche en arabe (sens de lecture de droite à gauche), dès que la langue change.
// Seules les fonctions réellement disponibles pour l'utilisateur sont affichées.
// ─────────────────────────────────────────────────────────────

const COULEURS = { messagerie: '#1d4ed8', assistant: '#4f46e5', copilote: '#7c3aed', notifications: '#dc2626', whatsapp: '#15803d',
  contact: '#c2410c', actions: '#6d28d9', langue: '#1d4ed8', theme: '#374151', compte: '#0f766e', recherche: '#0e7490', support: '#be123c', room: '#15803d' };

function useTailleEcran() {
  const [t, setT] = useState({ l: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setT({ l: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return t;
}

function BoutonsFlottants({ mode = 'prive', token, moi, page, setPage, theme, toggleTheme, onAssistant, assistantOpen }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut, opt) => t('fab.' + cle, { defaultValue: defaut, ...opt });
  const ecran = useTailleEcran();
  const mobile = ecran.l < 768;
  const [menu, setMenu] = useState(false);
  const [panneau, setPanneau] = useState(null);              // notifications | actions | assistant | contact | messagerie | whatsapp | support | recherche
  const [compteur, setCompteur] = useState({ non_lues: 0, critiques: 0, derniere_id: null, messages_non_lus: 0, support_reponses: 0, support_a_traiter: 0, rooms_invitations: 0 });
  const [pulsationMsg, setPulsationMsg] = useState(false);
  const [conversationInitiale, setConversationInitiale] = useState(null);
  const [supportInitial, setSupportInitial] = useState(null);        // { id, toutes }
  const messagesAvant = useRef(null);
  const [pulsation, setPulsation] = useState(false);
  const [annonce, setAnnonce] = useState('');
  const [config, setConfig] = useState(null);
  const [reglages, setReglages] = useState(null);            // personnalisation de l'administrateur (null : tout afficher)
  const [prefs, setPrefs] = useState(null);                  // préférences personnelles du compte connecté
  const derniere = useRef(null);
  const boutonPrincipal = useRef(null);
  const zone = useRef(null);
  const role = moi?.role;
  const gestion = ['admin', 'superviseur'].includes(role);

  // ── compteur de notifications (mode privé) : appel léger toutes les 20 secondes ──
  const lireCompteur = useCallback(() => {
    if (mode !== 'prive' || !token) return;
    fetch(`${API}/notifications/compteur`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        if (derniere.current !== null && d.derniere_id && d.derniere_id !== derniere.current) {
          setPulsation(true);                                   // nouvel événement : mise en évidence quelques secondes
          setAnnonce(tr('nouvelle', 'Nouvelle notification'));
          setTimeout(() => setPulsation(false), 6000);
        }
        derniere.current = d.derniere_id || 0;
        if (messagesAvant.current !== null && (d.messages_non_lus || 0) > messagesAvant.current) {
          setPulsationMsg(true);                                // nouveau message : animation du bouton de messagerie
          setAnnonce(tr('nouveauMessage', 'Nouveau message'));
          setTimeout(() => setPulsationMsg(false), 6000);
        }
        messagesAvant.current = d.messages_non_lus || 0;
        setCompteur(d);
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tr dépend seulement de la langue
  }, [mode, token]);

  useEffect(() => {
    lireCompteur();
    const id = setInterval(lireCompteur, 20000);
    return () => clearInterval(id);
  }, [lireCompteur]);

  // ── boutons publics disponibles (numéro WhatsApp configuré, assistant activé) ──
  useEffect(() => {
    if (mode !== 'public') return;
    fetch(`${API}/public/config`).then(r => (r.ok ? r.json() : null)).then(setConfig).catch(() => setConfig({ contact: true }));
  }, [mode]);

  // ── personnalisation des boutons (Paramètres) : rôle et horaires vérifiés par le serveur ──
  useEffect(() => {
    if (mode !== 'prive' || !token) return;
    const charger = () => fetch(`${API}/boutons/mes-boutons`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || token}` } })
      .then(r => (r.ok ? r.json() : null)).then(d => {
        setReglages(d ? Object.fromEntries(d.boutons.map(b => [b.cle, b])) : null);
        setPrefs(d?.preferences || null);
      }).catch(() => {});
    charger();
    window.addEventListener('smartmaint-boutons', charger);      // envoyé par la page Paramètres après un enregistrement
    return () => window.removeEventListener('smartmaint-boutons', charger);
  }, [mode, token]);
  useEffect(() => {
    if (mode === 'public' && config?.boutons) setReglages(Object.fromEntries(config.boutons.map(b => [b.cle, b])));
  }, [mode, config]);

  // ── Ctrl+K (ou Cmd+K) : recherche, depuis n'importe quelle page ──
  useEffect(() => {
    if (mode !== 'prive') return;
    const raccourci = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMenu(false); setPanneau('recherche'); }
    };
    window.addEventListener('keydown', raccourci);
    return () => window.removeEventListener('keydown', raccourci);
  }, [mode]);

  // ── Échap ferme ; clic en dehors ferme ──
  useEffect(() => {
    if (!menu && !panneau) return;
    const touche = (e) => { if (e.key === 'Escape') { setMenu(false); setPanneau(null); boutonPrincipal.current?.focus(); } };
    const clic = (e) => { if (zone.current && !zone.current.contains(e.target)) { setMenu(false); setPanneau(null); } };
    window.addEventListener('keydown', touche);
    window.addEventListener('mousedown', clic);
    return () => { window.removeEventListener('keydown', touche); window.removeEventListener('mousedown', clic); };
  }, [menu, panneau]);

  if (mode === 'prive' && assistantOpen) return null;          // le panneau de l'assistant occupe ce côté de l'écran

  const ouvrir = (p) => { setPanneau(panneau === p ? null : p); setMenu(false); };
  const aller = (cible) => { setPage?.(cible); setMenu(false); setPanneau(null); };
  const ouvrirSupport = (id = null, toutes = false) => { setSupportInitial({ id, toutes }); setMenu(false); setPanneau('support'); };
  const ouvrirMessage = async (id) => {
    try {
      const r = await fetch(`${API}/messagerie/conversations`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ destinataire_id: id }) });
      if (r.ok) { setConversationInitiale(await r.json()); setPanneau('messagerie'); }
    } catch { /* le panneau reste ouvert */ }
  };
  const supportEnAttente = (compteur.support_reponses || 0) + (compteur.support_a_traiter || 0);
  const langue = (i18n.language || 'fr').slice(0, 2);
  // boutons ajoutés par l'administrateur : raccourci vers une page, ou lien https (vérifié par le serveur)
  const ajoutes = mode === 'prive' && reglages ? Object.values(reglages).filter(r => r.cle.startsWith('perso.')).map(r => ({
    id: r.cle.slice(6), cle: r.cle, icone: r.icone, libelle: r.libelles?.[langue] || r.libelles?.fr || '—',
    ...(r.cible_type === 'lien' ? { lien: r.cible } : { action: () => aller(r.cible) }),
  })) : [];

  const elements = mode === 'public' ? [
    config?.assistant !== false && { id: 'assistant', icone: '🤖', libelle: tr('assistant', 'Assistant IA'), action: () => ouvrir('assistant') },
    config?.whatsapp && { id: 'whatsapp', icone: '💬', libelle: 'WhatsApp', lien: `https://wa.me/${config.whatsapp}` },
    { id: 'contact', icone: '✉️', libelle: tr('contact', 'Nous contacter'), action: () => ouvrir('contact') },
  ] : [
    { id: 'recherche', icone: '🔎', libelle: tr('recherche', 'Recherche'), action: () => ouvrir('recherche') },
    { id: 'assistant', icone: '🤖', libelle: tr('assistant', 'Assistant IA'), action: () => { setMenu(false); onAssistant?.(); } },
    { id: 'copilote', icone: '✨', libelle: tr('copilote', 'Copilote IA'), action: () => aller('copilote') },
    { id: 'notifications', icone: '🔔', libelle: tr('notifications', 'Notifications'), badge: compteur.non_lues, action: () => ouvrir('notifications') },
    { id: 'messagerie', icone: '✉️', libelle: tr('messagerie', 'Messagerie'), badge: compteur.messages_non_lus, action: () => { setConversationInitiale(null); ouvrir('messagerie'); } },
    { id: 'whatsapp', icone: '💬', libelle: 'WhatsApp', action: () => ouvrir('whatsapp') },
    { id: 'support', icone: '🛟', libelle: tr('support', 'Support'), badge: supportEnAttente, action: () => ouvrirSupport(null, (compteur.support_a_traiter || 0) > 0) },
    { id: 'actions', icone: '⚡', libelle: tr('actions', 'Actions rapides'), action: () => ouvrir('actions') },
    { id: 'theme', icone: theme === 'light' ? '🌙' : '☀️', libelle: theme === 'light' ? tr('sombre', 'Mode sombre') : tr('clair', 'Mode clair'), action: () => toggleTheme?.() },
    { id: 'compte', icone: '👤', libelle: tr('compte', 'Mon compte'), action: () => aller('compte') },
    ...ajoutes,
  ];
  // un bouton masqué ici reste une fonctionnalité accessible : seul son affichage change
  const reglage = (cle) => reglages?.[cle];
  const critique = (compteur.critiques || 0) > 0;
  const CONDITIONS = { non_lus: (b) => b > 0, alerte_critique: () => critique, non_lus_ou_alerte: (b) => b > 0 || critique };
  const affiche = (cle, badge = 0) => {
    if (mode === 'prive' && prefs?.masques?.includes(cle)) return false;          // masqué par l'utilisateur, pour lui seul
    if (!reglages) return !cle.startsWith('contextuel.') || badge > 0;
    const r = reglage(cle);
    if (!r) return false;
    if (mode === 'prive' && r.pages?.length && !r.pages.includes(page)) return false;
    if ((r.appareils === 'bureau' && mobile) || (r.appareils === 'mobile' && !mobile)) return false;
    if (r.langues?.length && !r.langues.includes(langue)) return false;
    return !CONDITIONS[r.condition] || CONDITIONS[r.condition](badge);
  };
  const cleDe = (e) => e.cle || `${mode}.${e.id}`;
  const echelle = (cle) => ({ petit: 0.85, grand: 1.15 }[reglage(cle)?.taille] || 1);
  const animation = (cle) => (prefs?.animations_reduites ? 'aucune' : reglage(cle)?.animation || 'discrete');
  const couleur = (cle, defaut) => reglage(cle)?.couleur || defaut;
  const visibles = [...elements.filter(Boolean).filter(e => affiche(cleDe(e), e.badge))
    .sort((a, b) => (reglage(cleDe(a))?.ordre ?? 0) - (reglage(cleDe(b))?.ordre ?? 0)),
    // personnalisation personnelle : toujours proposée, pour qu'un utilisateur puisse réafficher ses boutons
    ...(mode === 'prive' ? [{ id: 'raccourcis', cle: 'raccourcis', icone: '🧩', libelle: tr('mesBoutons', 'Personnaliser mes boutons'), action: () => ouvrir('raccourcis') }] : [])];
  const langueVisible = mode === 'public' || affiche('prive.langue');

  const taille = mobile ? 54 : 60;
  const marge = mobile ? 14 : 22;
  // le menu doit tenir dans la hauteur de l'écran : boutons plus petits si nécessaire, sinon défilement
  const hauteurMenu = ecran.h - taille - marge * 2 - 24;
  const nbLignes = Math.max(1, visibles.length + (langueVisible ? 1 : 0));
  const ecart = hauteurMenu / nbLignes < 56 ? 6 : 10;
  const tailleAction = Math.max(36, Math.min(46, Math.floor(hauteurMenu / nbLignes) - ecart));
  const rond = (couleur, t = 46) => ({
    width: t, height: t, borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff', fontSize: t * 0.42,
    background: couleur, boxShadow: '0 6px 18px #0006', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', flexShrink: 0,
  });
  const pastille = { position: 'absolute', top: -4, insetInlineEnd: -4, minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
    background: '#b91c1c', color: '#fff', fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid var(--bg, #0f1117)', boxSizing: 'border-box' };
  const carte = { background: 'var(--card, #1a1d2e)', color: 'var(--text, #fff)', border: '1px solid var(--border, #2a2d3e)',
    borderRadius: 16, boxShadow: '0 12px 40px #0008', width: mobile ? 'calc(100vw - 28px)' : 340, maxHeight: '60vh', overflowY: 'auto' };

  return (
    <div ref={zone} className={'boutons-flottants' + (prefs?.animations_reduites ? ' fab-sans-animation' : '')} dir={i18n.dir()}
      style={{ position: 'fixed', bottom: marge, insetInlineEnd: marge, zIndex: 1500, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
      <div aria-live="polite" className="visuellement-cache">{annonce}</div>

      {/* PANNEAUX */}
      {panneau === 'notifications' && <PanneauNotifications token={token} style={carte} tr={tr} aller={aller} surChangement={lireCompteur} ouvrirSupport={ouvrirSupport} />}
      {panneau === 'actions' && (
        <div style={{ ...carte, padding: 8 }} role="group" aria-label={tr('actions', 'Actions rapides')}>
          {actionsRapides(prefs, gestion).map(a => (
            <button key={a.id} className="fab-ligne" onClick={() => (a.page ? aller(a.page) : ouvrirSupport())}>
              <span aria-hidden="true" style={{ fontSize: 18 }}>{a.icone}</span>{tr('a.' + a.id, a.id)}
            </button>
          ))}
          <button className="fab-ligne" onClick={() => ouvrir('raccourcis')} style={{ color: 'var(--muted, #888)', fontSize: 13 }}>
            <span aria-hidden="true">🧩</span>{tr('choisirActions', 'Choisir mes actions rapides')}
          </button>
        </div>
      )}
      {panneau === 'raccourcis' && <PanneauRaccourcis style={{ ...carte, maxHeight: '75vh' }} tr={tr} prefs={prefs} gestion={gestion}
        boutons={elements.filter(Boolean).filter(e => mode === 'prive' && (!reglages || reglage(cleDe(e))))} cleDe={cleDe}
        surEnregistrement={setPrefs} />}
      {panneau === 'assistant' && <AssistantPublic style={carte} tr={tr} langue={i18n.language} />}
      {panneau === 'contact' && <FormulaireContact style={carte} tr={tr} langue={i18n.language} />}
      {panneau === 'messagerie' && <PanneauMessagerie style={carte} tr={tr} surChangement={lireCompteur} conversationInitiale={conversationInitiale} />}
      {panneau === 'whatsapp' && <PanneauWhatsApp style={carte} tr={tr} moi={moi} ouvrirMessagerie={ouvrirMessage} />}
      {panneau === 'support' && <PanneauSupport key={JSON.stringify(supportInitial)} style={{ ...carte, maxHeight: '75vh' }} tr={tr} moi={moi} pageCourante={page}
        demandeInitiale={supportInitial?.id} toutesInitiales={supportInitial?.toutes} surChangement={lireCompteur} />}
      {panneau === 'recherche' && <PanneauRecherche style={{ ...carte, width: mobile ? 'calc(100vw - 28px)' : 380, maxHeight: '70vh' }} tr={tr} moi={moi}
        aller={aller} ouvrirSupport={(id) => ouvrirSupport(id)} ouvrirMessage={ouvrirMessage} />}

      {/* MENU DU BOUTON PRINCIPAL */}
      {menu && (
        <nav aria-label={tr('menu', 'Raccourcis')} className="fab-menu"
          style={{ display: 'flex', flexDirection: 'column', gap: ecart, alignItems: 'flex-end', maxHeight: hauteurMenu, overflowY: 'auto', padding: 6, margin: -6 }}>
          {visibles.map((e, i) => {
            const contenu = (
              <>
                <span className="fab-etiquette">{e.libelle}</span>
                <span aria-hidden="true" style={rond(couleur(cleDe(e), COULEURS[e.id] || '#0f766e'), Math.round(tailleAction * echelle(cleDe(e))))}>
                  {e.id !== 'theme' && reglage(cleDe(e))?.icone ? reglage(cleDe(e)).icone : e.icone}
                  {e.badge > 0 && <span style={pastille}>{e.badge > 99 ? '99+' : e.badge}</span>}
                </span>
              </>
            );
            const style = { animationDelay: `${i * 35}ms` };
            const classe = `fab-action fab-anim-${animation(cleDe(e))}`;
            return e.lien
              ? <a key={e.id} href={e.lien} target="_blank" rel="noopener noreferrer" className={classe} style={style}
                  aria-label={e.libelle} autoFocus={i === 0}>{contenu}</a>
              : <button key={e.id} onClick={e.action} className={classe} style={style} autoFocus={i === 0}
                  aria-label={e.badge ? `${e.libelle} (${e.badge})` : e.libelle}>{contenu}</button>;
          })}
          {/* langue : choix direct */}
          {langueVisible && <div className="fab-action" role="group" aria-label={t('menu.language')} style={{ gap: 6 }}>
            {LANGUES.map(l => (
              <button key={l.code} onClick={() => i18n.changeLanguage(l.code)} lang={l.code} aria-label={l.label}
                aria-pressed={i18n.language === l.code}
                style={{ minWidth: 44, minHeight: 36, borderRadius: 18, cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit',
                  border: '1px solid var(--border, #2a2d3e)', color: i18n.language === l.code ? '#fff' : 'var(--text, #fff)',
                  background: i18n.language === l.code ? couleur('prive.langue', COULEURS.langue) : 'var(--card, #1a1d2e)' }}>
                {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
              </button>
            ))}
          </div>}
        </nav>
      )}

      {/* BOUTON CONTEXTUEL : invitation à une réunion Room Live */}
      {mode === 'prive' && !menu && !panneau && (compteur.rooms_invitations || 0) > 0 && affiche('contextuel.room', compteur.rooms_invitations) && page !== 'room' && (
        <button onClick={() => aller('room')} className={`fab-contextuel fab-pulsation fab-anim-${animation('contextuel.room')}`}
          aria-label={tr('roomInvitations', '{{n}} invitation(s) à une réunion Room Live', { n: compteur.rooms_invitations })}
          style={rond(couleur('contextuel.room', COULEURS.room), Math.round(48 * echelle('contextuel.room')))}>
          <span aria-hidden="true">{reglage('contextuel.room')?.icone || '📹'}</span>
          <span aria-hidden="true" style={pastille}>{compteur.rooms_invitations > 99 ? '99+' : compteur.rooms_invitations}</span>
        </button>
      )}

      {/* BOUTON CONTEXTUEL : réponse du support, ou demandes à traiter pour l'administration */}
      {mode === 'prive' && !menu && !panneau && affiche('contextuel.support', supportEnAttente) && (
        <button onClick={() => ouvrirSupport(null, !compteur.support_reponses && supportEnAttente > 0)} className={`fab-contextuel fab-anim-${animation('contextuel.support')}`}
          aria-label={compteur.support_reponses ? tr('supportReponses', '{{n}} réponse(s) du support', { n: compteur.support_reponses })
            : supportEnAttente > 0 ? tr('supportATraiter', '{{n}} demande(s) de support à traiter', { n: compteur.support_a_traiter })
              : tr('supportAlerte', 'Alerte critique : contacter le support')}
          style={rond(couleur('contextuel.support', COULEURS.support), Math.round(48 * echelle('contextuel.support')))}>
          <span aria-hidden="true">{reglage('contextuel.support')?.icone || '🛟'}</span>
          {supportEnAttente > 0 && <span aria-hidden="true" style={pastille}>{supportEnAttente > 99 ? '99+' : supportEnAttente}</span>}
        </button>
      )}

      {/* BOUTON CONTEXTUEL : messages non lus (affiché seulement s'il y en a) */}
      {mode === 'prive' && !menu && !panneau && compteur.messages_non_lus > 0 && affiche('contextuel.messagerie', compteur.messages_non_lus) && (
        <button onClick={() => { setConversationInitiale(null); ouvrir('messagerie'); }} className={`fab-contextuel fab-anim-${animation('contextuel.messagerie')}` + (pulsationMsg ? ' fab-pulsation' : '')}
          aria-label={tr('messagesNonLus', '{{n}} message(s) non lu(s)', { n: compteur.messages_non_lus })}
          style={rond(couleur('contextuel.messagerie', COULEURS.messagerie), Math.round(48 * echelle('contextuel.messagerie')))}>
          <span aria-hidden="true">{reglage('contextuel.messagerie')?.icone || '✉️'}</span>
          <span aria-hidden="true" style={pastille}>{compteur.messages_non_lus > 99 ? '99+' : compteur.messages_non_lus}</span>
        </button>
      )}

      {/* BOUTON CONTEXTUEL : notifications non lues (affiché seulement s'il y en a) */}
      {mode === 'prive' && !menu && !panneau && compteur.non_lues > 0 && affiche('contextuel.notifications', compteur.non_lues) && (
        <button onClick={() => ouvrir('notifications')} className={`fab-contextuel fab-anim-${animation('contextuel.notifications')}` + (pulsation ? ' fab-pulsation' : '')}
          aria-label={tr('nonLues', '{{n}} notification(s) non lue(s)', { n: compteur.non_lues })}
          style={rond(compteur.critiques > 0 ? COULEURS.notifications : couleur('contextuel.notifications', '#b45309'), Math.round(48 * echelle('contextuel.notifications')))}>
          <span aria-hidden="true">{reglage('contextuel.notifications')?.icone || '🔔'}</span>
          <span aria-hidden="true" style={pastille}>{compteur.non_lues > 99 ? '99+' : compteur.non_lues}</span>
        </button>
      )}

      {/* BOUTON PRINCIPAL PERMANENT */}
      <button ref={boutonPrincipal} onClick={() => { setMenu(!menu); setPanneau(null); }} className="fab-principal"
        aria-expanded={menu} aria-label={menu ? tr('fermer', 'Fermer les raccourcis') : tr('ouvrir', 'Ouvrir les raccourcis')}
        style={{ ...rond('var(--accent-fond)', taille), fontSize: taille * 0.5, transform: menu ? 'rotate(45deg)' : 'none' }}>
        <span aria-hidden="true">+</span>
        {mode === 'prive' && !menu && (compteur.non_lues > 0 || compteur.messages_non_lus > 0 || supportEnAttente > 0 || (compteur.rooms_invitations || 0) > 0) && <span aria-hidden="true" style={{ ...pastille, transform: 'rotate(0)' }} />}
      </button>
    </div>
  );
}

// ── Actions rapides : choix personnel de l'utilisateur, limité par le serveur aux actions de son rôle ──
const ACTIONS_PAR_DEFAUT = [
  { id: 'intervention', icone: '🔧', page: 'interventions' }, { id: 'document', icone: '📄', page: 'documents' },
  { id: 'question', icone: '✨', page: 'copilote' }, { id: 'equipement', icone: '🏭', page: 'equipements', gestion: true },
  { id: 'workflows', icone: '⚙️', page: 'workflows', gestion: true },
];
function actionsRapides(prefs, gestion) {
  if (!prefs?.actions_disponibles) return ACTIONS_PAR_DEFAUT.filter(a => !a.gestion || gestion);
  const dispo = Object.fromEntries(prefs.actions_disponibles.map(a => [a.id, a]));
  return prefs.actions.filter(id => dispo[id]).map(id => dispo[id]);
}

// ── Personnalisation personnelle : boutons masqués pour soi, actions rapides favorites, animations ──
function PanneauRaccourcis({ style, tr, prefs, boutons, cleDe, surEnregistrement }) {
  const [masques, setMasques] = useState(prefs?.masques || []);
  const [actions, setActions] = useState(prefs?.actions || []);
  const [reduites, setReduites] = useState(!!prefs?.animations_reduites);
  const [etat, setEtat] = useState('');
  const dispo = prefs?.actions_disponibles || [];
  const appel = async (methode, corps) => {
    setEtat('');
    try {
      const r = await fetch(`${API}/boutons/mes-preferences`, { method: methode, headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      surEnregistrement(d); setMasques(d.masques); setActions(d.actions); setReduites(d.animations_reduites); setEtat('ok');
    } catch { setEtat('erreur'); }
  };
  const basculer = (liste, v) => (liste.includes(v) ? liste.filter(x => x !== v) : [...liste, v]);
  const deplacer = (id, sens) => {
    const i = actions.indexOf(id); const j = i + sens;
    if (i < 0 || j < 0 || j >= actions.length) return;
    const copie = [...actions]; [copie[i], copie[j]] = [copie[j], copie[i]]; setActions(copie);
  };
  if (!prefs) return <section style={{ ...style, padding: 16 }}><p style={{ margin: 0 }}>{tr('chargement', 'Chargement…')}</p></section>;
  const titre = { margin: '12px 0 6px', fontSize: 13, color: 'var(--muted, #888)', fontWeight: 'normal' };
  return (
    <section aria-labelledby="fab-raccourcis-titre" style={{ ...style, padding: 14 }}>
      <h2 id="fab-raccourcis-titre" style={{ margin: 0, fontSize: 16 }}>🧩 {tr('mesBoutons', 'Personnaliser mes boutons')}</h2>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted, #888)' }}>{tr('mesBoutonsAide', 'Ces choix ne concernent que votre compte et ne changent pas vos droits.')}</p>
      <h3 style={titre}>{tr('afficherPourMoi', 'Boutons affichés pour moi')}</h3>
      {boutons.map(e => (
        <label key={cleDe(e)} className="fab-ligne" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={!masques.includes(cleDe(e))} onChange={() => setMasques(basculer(masques, cleDe(e)))} style={{ width: 18, height: 18 }} />
          <span aria-hidden="true">{e.icone}</span>{e.libelle}
        </label>
      ))}
      <h3 style={titre}>{tr('mesActions', 'Mes actions rapides (dans l’ordre)')}</h3>
      {dispo.map(a => {
        const on = actions.includes(a.id);
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label className="fab-ligne" style={{ cursor: 'pointer', flex: 1 }}>
              <input type="checkbox" checked={on} onChange={() => setActions(basculer(actions, a.id))} style={{ width: 18, height: 18 }} />
              <span aria-hidden="true">{a.icone}</span>{tr('a.' + a.id, a.id)}
            </label>
            {on && <>
              <button onClick={() => deplacer(a.id, -1)} className="fab-filtre" aria-label={tr('monterAction', 'Monter {{nom}}', { nom: tr('a.' + a.id, a.id) })}>↑</button>
              <button onClick={() => deplacer(a.id, 1)} className="fab-filtre" aria-label={tr('descendreAction', 'Descendre {{nom}}', { nom: tr('a.' + a.id, a.id) })}>↓</button>
            </>}
          </div>
        );
      })}
      <h3 style={titre}>{tr('confort', 'Confort')}</h3>
      <label className="fab-ligne" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={reduites} onChange={e => setReduites(e.target.checked)} style={{ width: 18, height: 18 }} />
        {tr('animationsReduites', 'Réduire les animations')}
      </label>
      {etat && <p role="status" style={{ margin: '8px 0 0', fontSize: 13, color: etat === 'ok' ? 'var(--succes)' : 'var(--danger)' }}>
        {etat === 'ok' ? tr('prefsOk', 'Préférences enregistrées.') : tr('erreur', 'Service indisponible')}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="fab-envoyer" onClick={() => appel('PUT', { masques, actions, animations_reduites: reduites })}>{tr('enregistrerPrefs', 'Enregistrer')}</button>
        <button className="fab-filtre" onClick={() => appel('DELETE')}>{tr('prefsDefaut', 'Revenir aux réglages par défaut')}</button>
      </div>
    </section>
  );
}

// ── Panneau des notifications ──
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };

function PanneauNotifications({ token, style, tr, aller, surChangement, ouvrirSupport }) {
  const { t, i18n } = useTranslation();
  const [liste, setListe] = useState(null);
  // titre dans la langue de l'interface, à partir du modèle et des valeurs envoyés par le serveur
  const titre = (n) => {
    const d = n.donnees;
    if (!d?.modele) return n.titre;
    const valeurs = { ...d, severite: t('severites.' + d.severite, { defaultValue: d.severite }).toLocaleLowerCase(),
      statut: t('fab.st.' + d.statut, { defaultValue: d.statut }) };
    const cle = d.modele === 'alerte' && d.n > 1 ? 'alertes' : d.modele;
    return t('fab.n.' + cle, { ...valeurs, defaultValue: n.titre });
  };
  const entete = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || token}` });
  const charger = useCallback(() => {
    fetch(`${API}/notifications?limite=30`, { headers: entete() }).then(r => (r.ok ? r.json() : [])).then(setListe).catch(() => setListe([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jeton relu à chaque appel
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const lire = async (n) => {
    if (!n.lue) await fetch(`${API}/notifications/${n.id}/lue`, { method: 'POST', headers: entete() });
    surChangement();
    if (n.type === 'support' && n.objet_id) ouvrirSupport(n.objet_id);
    else if (n.page) aller(n.page);
  };
  const toutLire = async () => {
    await fetch(`${API}/notifications/tout-lire`, { method: 'POST', headers: entete() });
    charger(); surChangement();
  };
  const couleur = { critique: 'var(--danger)', attention: 'var(--attention)', info: 'var(--info)' };

  return (
    <section aria-labelledby="fab-notifs-titre" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border, #2a2d3e)', position: 'sticky', top: 0, background: 'var(--card, #1a1d2e)' }}>
        <h2 id="fab-notifs-titre" style={{ margin: 0, fontSize: 16 }}>🔔 {tr('notifications', 'Notifications')}</h2>
        {liste?.some(n => !n.lue) && (
          <button onClick={toutLire} style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, minHeight: 32, fontFamily: 'inherit' }}>
            {tr('toutLire', 'Tout marquer comme lu')}
          </button>
        )}
      </div>
      {liste === null && <p style={{ padding: 16, margin: 0, color: 'var(--muted, #888)' }}>{tr('chargement', 'Chargement…')}</p>}
      {liste?.length === 0 && <p style={{ padding: 16, margin: 0, color: 'var(--muted, #888)' }}>✅ {tr('aucune', 'Aucune notification')}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
        {liste?.map(n => (
          <li key={n.id}>
            <button className="fab-ligne" onClick={() => lire(n)} style={{ alignItems: 'flex-start', opacity: n.lue ? 0.7 : 1 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: n.lue ? 'transparent' : couleur[n.niveau] }} />
              <span style={{ textAlign: 'start' }}>
                <span style={{ display: 'block', fontWeight: n.lue ? 'normal' : 'bold', fontSize: 13 }}>{titre(n)}</span>
                {n.message && <span style={{ display: 'block', color: 'var(--muted, #888)', fontSize: 12, marginTop: 2 }}>{n.message.slice(0, 120)}</span>}
                <span style={{ display: 'block', color: 'var(--muted, #888)', fontSize: 11, marginTop: 2 }}>{new Date(n.date).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Assistant public (avant connexion) : informations générales seulement ──
function AssistantPublic({ style, tr, langue }) {
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    const q = saisie.trim();
    if (!q || attente) return;
    const historique = [...messages, { role: 'user', content: q }];
    setMessages(historique); setSaisie(''); setAttente(true);
    try {
      const r = await fetch(`${API}/public/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, langue, historique: messages.slice(-4) }) });
      const d = await r.json();
      setMessages([...historique, { role: 'assistant', content: r.ok ? d.reponse : (d.detail || tr('erreur', 'Service indisponible')) }]);
    } catch { setMessages([...historique, { role: 'assistant', content: tr('erreur', 'Service indisponible') }]); }
    setAttente(false);
  };
  return (
    <section aria-labelledby="fab-assistant-titre" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #2a2d3e)' }}>
        <h2 id="fab-assistant-titre" style={{ margin: 0, fontSize: 16 }}>🤖 {tr('assistant', 'Assistant IA')}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted, #888)' }}>{tr('assistantPublic', 'Informations générales. Connectez-vous pour accéder à vos données.')}</p>
      </div>
      <div aria-live="polite" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 12, fontSize: 13,
            background: m.role === 'user' ? 'var(--accent-fond)' : 'var(--bg, #0f1117)', color: m.role === 'user' ? '#fff' : 'var(--text, #fff)' }}>{m.content}</div>
        ))}
        {attente && <div style={{ color: 'var(--muted, #888)', fontSize: 13 }}>⏳</div>}
      </div>
      <form onSubmit={envoyer} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border, #2a2d3e)' }}>
        <input value={saisie} onChange={e => setSaisie(e.target.value)} maxLength={500} aria-label={tr('question', 'Votre question')}
          placeholder={tr('question', 'Votre question')} className="fab-champ" />
        <button type="submit" disabled={attente || !saisie.trim()} className="fab-envoyer">{tr('envoyer', 'Envoyer')}</button>
      </form>
    </section>
  );
}

// ── Contact (avant connexion) ──
function FormulaireContact({ style, tr, langue }) {
  const [f, setF] = useState({ nom: '', email: '', message: '' });
  const [etat, setEtat] = useState(null);
  const envoyer = async (e) => {
    e.preventDefault();
    setEtat('envoi');
    try {
      const r = await fetch(`${API}/public/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, langue }) });
      setEtat(r.ok ? 'ok' : r.status === 429 ? 'limite' : 'invalide');
    } catch { setEtat('invalide'); }
  };
  const messages = { ok: ['var(--succes)', tr('envoye', 'Message envoyé à l’administrateur.')], limite: ['var(--danger)', tr('limite', 'Trop de messages : réessayez dans une minute.')],
    invalide: ['var(--danger)', tr('invalide', 'Vérifiez votre nom, votre email et votre message (5 caractères minimum).')] };
  return (
    <section aria-labelledby="fab-contact-titre" style={style}>
      <form onSubmit={envoyer} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 id="fab-contact-titre" style={{ margin: 0, fontSize: 16 }}>✉️ {tr('contact', 'Nous contacter')}</h2>
        <input required minLength={2} value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} placeholder={tr('nom', 'Nom')} aria-label={tr('nom', 'Nom')} className="fab-champ" />
        <input required type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="Email" aria-label="Email" className="fab-champ" />
        <textarea required minLength={5} rows={4} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder={tr('message', 'Message')} aria-label={tr('message', 'Message')} className="fab-champ" />
        {etat && messages[etat] && <p role="status" style={{ margin: 0, fontSize: 13, color: messages[etat][0] }}>{messages[etat][1]}</p>}
        <button type="submit" disabled={etat === 'envoi' || etat === 'ok'} className="fab-envoyer">{tr('envoyer', 'Envoyer')}</button>
      </form>
    </section>
  );
}

export default BoutonsFlottants;
