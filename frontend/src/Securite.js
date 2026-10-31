import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { confirmer } from './Confirmation';
import { fondPour } from './couleurs';

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const ONGLETS = ['resume', 'utilisateurs', 'sessions', 'appareils', 'journal', 'sauvegardes'];
const ICONES = { resume: '📊', utilisateurs: '👥', sessions: '🔑', appareils: '💻', journal: '📜', sauvegardes: '💾' };

// Couleur de chaque type d'événement du journal
const COULEUR_EVENEMENT = {
  connexion_reussie: 'var(--succes)', deconnexion: 'var(--neutre)', echec_connexion: 'var(--attention)',
  connexion_bloquee: 'var(--danger)', connexion_inhabituelle: 'var(--danger)', reutilisation_jeton: 'var(--danger)',
  compte_desactive: 'var(--danger)', appareil_bloque: 'var(--danger)', appareil_bloque_admin: 'var(--danger)',
  nouvel_appareil: 'var(--info)', creation_compte: '#8b5cf6', modification_compte: '#8b5cf6',
  deconnexion_distance: 'var(--orange)', session_fermee: 'var(--neutre)', sessions_fermees: 'var(--neutre)',
  appareil_reactive: 'var(--succes)', appareil_supprime: 'var(--neutre)',
  mfa_demande: 'var(--info)', mfa_activee: 'var(--succes)', mfa_desactivee: 'var(--attention)', mfa_reinitialisee: 'var(--orange)',
  code_secours_utilise: 'var(--attention)', codes_secours_regeneres: 'var(--info)', changement_mdp: '#8b5cf6', echec_changement_mdp: 'var(--attention)',
  sauvegarde_creee: 'var(--succes)', sauvegarde_echec: 'var(--danger)', restauration_testee: 'var(--succes)', restauration_echec: 'var(--danger)',
};

const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '20px' };
const th = { textAlign: 'start', padding: '10px', background: '#1e293b', color: 'white', fontSize: '12px', whiteSpace: 'nowrap' };
const td = { padding: '10px', borderBottom: '1px solid var(--border, #2a2d3e)', fontSize: '13px', verticalAlign: 'middle' };
const champ = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border, #333)', background: 'var(--bg, #0f1117)', color: 'var(--text, white)', fontFamily: 'inherit' };
const btn = (couleur) => ({ background: fondPour(couleur), border: 'none', color: 'white', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' });
const badge = (couleur) => ({ background: `color-mix(in srgb, ${couleur} 13%, transparent)`, color: couleur, border: `1px solid ${couleur}`, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', whiteSpace: 'nowrap' });

// Console d'administration de la sécurité (réservée aux administrateurs)
function Securite({ token, moi }) {
  const { t, i18n } = useTranslation();
  const locale = LOCALES[i18n.language] || 'fr-FR';
  const [onglet, setOnglet] = useState('resume');
  const [resume, setResume] = useState(null);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [appareils, setAppareils] = useState([]);
  const [journal, setJournal] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [message, setMessage] = useState('');
  const [nouveau, setNouveau] = useState(null);   // formulaire de création de compte
  const [sauvegardes, setSauvegardes] = useState([]);
  const [enCours, setEnCours] = useState('');
  const [test, setTest] = useState(null);         // résultat du dernier test de restauration

  const tr = (cle, defaut, opts = {}) => t('securite.' + cle, { defaultValue: defaut, ...opts });
  const date = (d) => d ? new Date(d).toLocaleString(locale) : '';
  const nomEvenement = (e) => t('securite.ev.' + e, { defaultValue: e.replace(/_/g, ' ') });

  const appel = useCallback(async (chemin, options = {}) => {
    const rep = await fetch(`${API}${chemin}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const data = await rep.json().catch(() => ({}));
    if (!rep.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map(d => String(d.msg).replace(/^Value error, /, '')).join(' ; ') : data.detail;
      throw new Error(detail || `Erreur ${rep.status}`);
    }
    return data;
  }, [token]);

  const charger = useCallback(async () => {
    try {
      const [r, u, s, a, j, b] = await Promise.all([
        appel('/admin/securite/resume'), appel('/admin/utilisateurs'), appel('/admin/sessions'),
        appel('/admin/appareils'), appel('/admin/journal?limite=300' + (filtre ? `&evenement=${encodeURIComponent(filtre)}` : '')),
        appel('/admin/sauvegardes'),
      ]);
      setResume(r); setUtilisateurs(u); setSessions(s); setAppareils(a); setJournal(j); setSauvegardes(b);
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  }, [appel, filtre]);

  useEffect(() => {
    charger();
    const intervalle = setInterval(charger, 15000);
    return () => clearInterval(intervalle);
  }, [charger]);

  const action = async (chemin, methode, corps, confirmation) => {
    if (confirmation && !(await confirmer(confirmation))) return;
    try {
      const data = await appel(chemin, { method: methode, body: corps ? JSON.stringify(corps) : undefined });
      setMessage('✅ ' + (data.message || tr('fait', 'Action effectuée')));
      charger();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  const creerCompte = async () => {
    try {
      await appel('/auth/register', { method: 'POST', body: JSON.stringify(nouveau) });
      setMessage('✅ ' + tr('compteCree', 'Compte créé'));
      setNouveau(null);
      charger();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
  };

  const lancer = async (chemin, cle) => {
    setEnCours(cle); setMessage('');
    try {
      const data = await appel(chemin, { method: 'POST' });
      if (data.tables) {
        setTest(data);
        setMessage((data.reussi ? '✅ ' : '❌ ') + tr(data.reussi ? 'restaurationOk' : 'restaurationKo', data.reussi ? 'Restauration testée avec succès' : 'Le test de restauration a échoué'));
      } else {
        setMessage('✅ ' + data.message);
      }
      charger();
    } catch (e) {
      setMessage('❌ ' + e.message);
    }
    setEnCours('');
  };

  const tableau = (entetes, lignes) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{entetes.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{lignes}</tbody>
      </table>
    </div>
  );

  const vide = (n) => <tr><td colSpan={n} style={{ ...td, textAlign: 'center', color: 'var(--muted, #888)' }}>{tr('aucun', 'Aucun élément')}</td></tr>;

  return (
    <div style={carte}>
      <h2 style={{ color: 'var(--accent)', marginTop: 0 }}>🛡️ {tr('titre', 'Console de sécurité')}</h2>

      {/* ONGLETS */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {ONGLETS.map(o => (
          <button key={o} onClick={() => setOnglet(o)}
            style={{ ...btn(onglet === o ? 'var(--accent)' : 'transparent'), border: '1px solid ' + (onglet === o ? 'var(--accent)' : 'var(--border, #333)'), color: onglet === o ? 'white' : 'var(--text, white)', padding: '8px 14px', fontSize: '13px' }}>
            {ICONES[o]} {tr('onglet.' + o, { resume: 'Résumé', utilisateurs: 'Utilisateurs', sessions: 'Sessions actives', appareils: 'Appareils', journal: 'Journal' }[o])}
          </button>
        ))}
      </div>

      {message && <p style={{ color: message.startsWith('✅') ? 'var(--succes)' : 'var(--danger)', marginTop: 0 }}>{message}</p>}

      {/* RÉSUMÉ */}
      {onglet === 'resume' && resume && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
          {[
            ['utilisateurs_actifs', 'Comptes actifs', 'var(--succes)', `${resume.utilisateurs_actifs} / ${resume.utilisateurs}`],
            ['sessions_actives', 'Sessions actives', 'var(--info)'],
            ['appareils', 'Appareils connus', '#8b5cf6', `${resume.appareils} (${resume.appareils_bloques} ${tr('bloques', 'bloqués')})`],
            ['connexions_24h', 'Connexions (24 h)', 'var(--succes)'],
            ['echecs_24h', 'Échecs (24 h)', 'var(--attention)'],
            ['blocages_24h', 'Blocages (24 h)', 'var(--danger)'],
            ['inhabituelles_24h', 'Connexions inhabituelles (24 h)', 'var(--danger)'],
          ].map(([cle, defaut, couleur, valeur]) => (
            <div key={cle} style={{ background: 'var(--bg, #0f1117)', borderRadius: '10px', padding: '14px', borderInlineStart: `4px solid ${couleur}` }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: couleur }}>{valeur ?? resume[cle]}</div>
              <div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{tr('r.' + cle, defaut)}</div>
            </div>
          ))}
        </div>
      )}

      {/* UTILISATEURS */}
      {onglet === 'utilisateurs' && (
        <>
          {!nouveau ? (
            <button onClick={() => setNouveau({ nom: '', email: '', role: 'technicien', mot_de_passe: '' })} style={{ ...btn('var(--accent)'), padding: '8px 14px', marginBottom: '12px' }}>
              ➕ {tr('nouveauCompte', 'Nouveau compte')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
              <input style={champ} placeholder={tr('nom', 'Nom')} value={nouveau.nom} onChange={e => setNouveau({ ...nouveau, nom: e.target.value })} />
              <input style={champ} type="email" placeholder="Email" value={nouveau.email} onChange={e => setNouveau({ ...nouveau, email: e.target.value })} />
              <select style={champ} value={nouveau.role} onChange={e => setNouveau({ ...nouveau, role: e.target.value })}>
                {['technicien', 'superviseur', 'admin'].map(r => <option key={r} value={r}>{tr('role.' + r, r)}</option>)}
              </select>
              <input style={champ} type="password" autoComplete="new-password" placeholder={tr('motDePasse', 'Mot de passe')} value={nouveau.mot_de_passe} onChange={e => setNouveau({ ...nouveau, mot_de_passe: e.target.value })} />
              <button onClick={creerCompte} style={btn('var(--succes)')}>✅ {tr('creer', 'Créer')}</button>
              <button onClick={() => setNouveau(null)} style={btn('var(--neutre)')}>{tr('annuler', 'Annuler')}</button>
              <div style={{ width: '100%', color: 'var(--muted, #888)', fontSize: '11px' }}>{tr('regleMdp', '8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un caractère spécial.')}</div>
            </div>
          )}
          {tableau([tr('nom', 'Nom'), 'Email', tr('roleCol', 'Rôle'), tr('statut', 'Statut'), '2FA', tr('sessions', 'Sessions'), tr('actions', 'Actions')],
            utilisateurs.length ? utilisateurs.map(u => {
              const soi = moi && u.id === moi.id;
              return (
                <tr key={u.id}>
                  <td style={td}><b>{u.nom}</b>{soi && <span style={{ ...badge('var(--accent)'), marginInlineStart: '6px' }}>{tr('vous', 'vous')}</span>}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    <select style={champ} value={u.role} disabled={soi}
                      onChange={e => action(`/admin/utilisateurs/${u.id}`, 'PUT', { role: e.target.value }, tr('confRole', 'Changer le rôle ? Les sessions de cet utilisateur seront fermées.'))}>
                      {['technicien', 'superviseur', 'admin'].map(r => <option key={r} value={r}>{tr('role.' + r, r)}</option>)}
                    </select>
                  </td>
                  <td style={td}><span style={badge(u.actif ? 'var(--succes)' : 'var(--danger)')}>{u.actif ? tr('actif', 'Actif') : tr('desactive', 'Désactivé')}</span></td>
                  <td style={td}><span style={badge(u.totp_actif ? 'var(--succes)' : 'var(--neutre)')}>{u.totp_actif ? '🔐 ' + tr('active', 'Activée') : tr('inactive', 'Non activée')}</span></td>
                  <td style={td}>{u.sessions_actives}</td>
                  <td style={{ ...td, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {!soi && (u.actif
                      ? <button style={btn('var(--danger)')} onClick={() => action(`/admin/utilisateurs/${u.id}`, 'PUT', { actif: false }, tr('confDesactiver', 'Désactiver ce compte ? Toutes ses sessions seront fermées.'))}>⛔ {tr('desactiver', 'Désactiver')}</button>
                      : <button style={btn('var(--succes)')} onClick={() => action(`/admin/utilisateurs/${u.id}`, 'PUT', { actif: true })}>✅ {tr('activer', 'Activer')}</button>)}
                    {!soi && u.totp_actif && (
                      <button style={btn('#8b5cf6')} onClick={() => action(`/admin/utilisateurs/${u.id}/reinitialiser-2fa`, 'POST', null, tr('conf2fa', 'Réinitialiser la double authentification de cet utilisateur (téléphone perdu) ?'))}>🔓 {tr('reset2fa', 'Réinitialiser 2FA')}</button>
                    )}
                    {!soi && u.sessions_actives > 0 && (
                      <button style={btn('var(--orange)')} onClick={() => action(`/admin/utilisateurs/${u.id}/deconnecter`, 'POST', null, tr('confDeco', 'Déconnecter cet utilisateur de tous ses appareils ?'))}>🚪 {tr('deconnecter', 'Déconnecter partout')}</button>
                    )}
                  </td>
                </tr>
              );
            }) : vide(7))}
        </>
      )}

      {/* SESSIONS ACTIVES */}
      {onglet === 'sessions' && tableau(
        [tr('utilisateur', 'Utilisateur'), tr('appareil', 'Appareil'), 'IP', tr('localisation', 'Localisation'), tr('debut', 'Début'), tr('activite', 'Dernière activité'), ''],
        sessions.length ? sessions.map(s => (
          <tr key={s.id}>
            <td style={td}><b>{s.nom}</b><div style={{ color: 'var(--muted, #888)', fontSize: '11px' }}>{s.email}</div></td>
            <td style={td}>{s.appareil || '?'}</td>
            <td style={td} dir="ltr">{s.ip}</td>
            <td style={td}>{s.localisation}</td>
            <td style={td}>{date(s.debut)}</td>
            <td style={td}>{date(s.derniere_activite)}</td>
            <td style={td}><button style={btn('var(--danger)')} onClick={() => action(`/admin/sessions/${s.id}`, 'DELETE', null, tr('confSession', 'Fermer cette session ? L\'utilisateur sera déconnecté de cet appareil.'))}>🚪 {tr('fermer', 'Fermer')}</button></td>
          </tr>
        )) : vide(7))}

      {/* APPAREILS */}
      {onglet === 'appareils' && tableau(
        [tr('utilisateur', 'Utilisateur'), tr('appareil', 'Appareil'), tr('statut', 'Statut'), tr('derniereIp', 'Dernière IP'), tr('localisation', 'Localisation'), tr('premiere', 'Première connexion'), tr('derniere', 'Dernière connexion'), tr('actions', 'Actions')],
        appareils.length ? appareils.map(a => (
          <tr key={a.id}>
            <td style={td}><b>{a.nom_utilisateur}</b><div style={{ color: 'var(--muted, #888)', fontSize: '11px' }}>{a.email}</div></td>
            <td style={td}>{a.appareil}<div style={{ color: 'var(--muted, #888)', fontSize: '11px' }}>{a.sessions_actives} {tr('sessionsActives', 'session(s) active(s)')}</div></td>
            <td style={td}><span style={badge(a.statut === 'bloque' ? 'var(--danger)' : 'var(--succes)')}>{a.statut === 'bloque' ? tr('bloque', 'Bloqué') : tr('autorise', 'Autorisé')}</span></td>
            <td style={td} dir="ltr">{a.derniere_ip}</td>
            <td style={td}>{a.localisation}</td>
            <td style={td}>{date(a.premiere_connexion)}</td>
            <td style={td}>{date(a.derniere_connexion)}</td>
            <td style={{ ...td, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {a.statut === 'bloque'
                ? <button style={btn('var(--succes)')} onClick={() => action(`/admin/appareils/${a.id}/reactiver`, 'PUT')}>✅ {tr('reactiver', 'Réactiver')}</button>
                : <button style={btn('var(--danger)')} onClick={() => action(`/admin/appareils/${a.id}/bloquer`, 'PUT', null, tr('confBloquer', 'Bloquer cet appareil ? Ses sessions seront fermées et il ne pourra plus se connecter.'))}>⛔ {tr('bloquer', 'Bloquer')}</button>}
              <button style={btn('var(--neutre)')} onClick={() => action(`/admin/appareils/${a.id}`, 'DELETE', null, tr('confSupprimer', 'Supprimer cet appareil de la liste ?'))}>🗑️</button>
            </td>
          </tr>
        )) : vide(8))}

      {/* JOURNAL */}
      {onglet === 'journal' && (
        <>
          <select style={{ ...champ, marginBottom: '12px' }} value={filtre} onChange={e => setFiltre(e.target.value)}>
            <option value="">{tr('tousEvenements', 'Tous les événements')}</option>
            {Object.keys(COULEUR_EVENEMENT).map(e => <option key={e} value={e}>{nomEvenement(e)}</option>)}
          </select>
          {tableau([tr('date', 'Date'), tr('evenement', 'Événement'), 'Email', 'IP', tr('details', 'Détails')],
            journal.length ? journal.map(l => (
              <tr key={l.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{date(l.date)}</td>
                <td style={td}><span style={badge(COULEUR_EVENEMENT[l.evenement] || 'var(--neutre)')}>{nomEvenement(l.evenement)}</span></td>
                <td style={td}>{l.email}</td>
                <td style={td} dir="ltr">{l.ip}</td>
                <td style={{ ...td, color: 'var(--muted, #888)' }}>{l.details}</td>
              </tr>
            )) : vide(5))}
        </>
      )}
      {/* SAUVEGARDES */}
      {onglet === 'sauvegardes' && (
        <>
          <p style={{ color: 'var(--muted, #888)', fontSize: '13px', marginTop: 0 }}>
            {tr('sauvegardesInfo', 'Sauvegarde automatique toutes les 24 h. Chaque fichier est compressé, chiffré et protégé par une empreinte SHA-256. Le test restaure la sauvegarde dans une base temporaire, compare les tables puis la supprime.')}
          </p>
          <button style={{ ...btn('var(--accent)'), padding: '8px 14px', marginBottom: '12px' }} disabled={!!enCours} onClick={() => lancer('/admin/sauvegardes', 'creer')}>
            {enCours === 'creer' ? '⏳ ' + tr('enCours', 'En cours...') : '💾 ' + tr('sauvegarderMaintenant', 'Sauvegarder maintenant')}
          </button>
          {tableau([tr('fichier', 'Fichier'), tr('date', 'Date'), tr('origine', 'Origine'), tr('taille', 'Taille'), tr('dernierTest', 'Dernier test'), ''],
            sauvegardes.length ? sauvegardes.map(b => (
              <tr key={b.nom}>
                <td style={td} dir="ltr"><code style={{ fontSize: '12px' }}>{b.nom}</code></td>
                <td style={td}>{date(b.date)}</td>
                <td style={td}>{tr('origineType.' + b.origine, b.origine)}</td>
                <td style={td}>{b.taille_ko} Ko <span style={{ color: 'var(--muted, #888)', fontSize: '11px' }}>({b.taille_sql_ko} Ko SQL)</span></td>
                <td style={td}>{b.dernier_test ? <span style={badge(b.dernier_test.reussi ? 'var(--succes)' : 'var(--danger)')}>{b.dernier_test.reussi ? '✅' : '❌'} {date(b.dernier_test.date)}</span> : '—'}</td>
                <td style={td}><button style={btn('var(--info)')} disabled={!!enCours} onClick={() => lancer(`/admin/sauvegardes/${encodeURIComponent(b.nom)}/tester`, b.nom)}>
                  {enCours === b.nom ? '⏳' : '🧪 ' + tr('tester', 'Tester la restauration')}</button></td>
              </tr>
            )) : vide(6))}
          {test && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ marginBottom: '8px' }}>{tr('resultatTest', 'Résultat du test')} : <code>{test.nom}</code> ({test.duree_s} s)</h4>
              {tableau([tr('table', 'Table'), tr('lignesSauvegarde', 'Lignes dans la sauvegarde'), tr('lignesActuelles', 'Lignes actuelles')],
                test.tables.map(l => (
                  <tr key={l.table}>
                    <td style={td}><code>{l.table}</code></td>
                    <td style={td}>{l.sauvegarde ?? '❌'}</td>
                    <td style={td}>{l.actuelle}</td>
                  </tr>
                )))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Securite;
