import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { fondPour } from './couleurs';

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '20px', marginBottom: '20px' };
const champ = { padding: '10px', borderRadius: '8px', border: '1px solid var(--border, #333)', background: 'var(--bg, #0f1117)', color: 'var(--text, white)', fontFamily: 'inherit', minWidth: '200px' };
const btn = (c) => ({ background: fondPour(c), border: 'none', color: 'white', padding: '9px 14px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' });
const td = { padding: '10px', borderBottom: '1px solid var(--border, #2a2d3e)', fontSize: '13px' };

// Page « Mon compte » : profil, mot de passe, double authentification et sessions de l'utilisateur
function MonCompte({ token, moi, onLogout }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut, opts = {}) => t('compte.' + cle, { defaultValue: defaut, ...opts });
  const locale = LOCALES[i18n.language] || 'fr-FR';
  const [statut2fa, setStatut2fa] = useState(null);
  const [preparation, setPreparation] = useState(null);   // QR code en attente de confirmation
  const [code, setCode] = useState('');
  const [codesSecours, setCodesSecours] = useState(null);
  const [desactivation, setDesactivation] = useState(null);
  const [mdp, setMdp] = useState({ ancien: '', nouveau: '', confirmation: '' });
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState('');

  const appel = useCallback(async (chemin, options = {}) => {
    const rep = await fetch(`${API}${chemin}`, {
      ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await rep.json().catch(() => ({}));
    if (!rep.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Erreur ${rep.status}`);
    return data;
  }, [token]);

  const charger = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([appel('/auth/2fa/statut'), appel('/auth/sessions')]);
      setStatut2fa(s); setSessions(l);
    } catch (e) { setMessage('❌ ' + e.message); }
  }, [appel]);

  useEffect(() => { charger(); }, [charger]);

  const executer = async (fn) => {
    setMessage('');
    try { await fn(); charger(); } catch (e) { setMessage('❌ ' + e.message); }
  };

  const preparer = () => executer(async () => { setPreparation(await appel('/auth/2fa/preparer', { method: 'POST' })); setCode(''); });
  const activer = () => executer(async () => {
    const r = await appel('/auth/2fa/activer', { method: 'POST', body: JSON.stringify({ code }) });
    setPreparation(null); setCode(''); setCodesSecours(r.codes_secours);
    setMessage('✅ ' + tr('mfaActivee', 'Double authentification activée'));
  });
  const regenerer = () => executer(async () => {
    const c = window.prompt(tr('demanderCode', 'Code à 6 chiffres de votre application :'));
    if (!c) return;
    const r = await appel('/auth/2fa/codes-secours', { method: 'POST', body: JSON.stringify({ code: c }) });
    setCodesSecours(r.codes_secours);
  });
  const desactiver = () => executer(async () => {
    await appel('/auth/2fa/desactiver', { method: 'POST', body: JSON.stringify(desactivation) });
    setDesactivation(null);
    setMessage('✅ ' + tr('mfaDesactivee', 'Double authentification désactivée'));
  });
  const changerMdp = () => executer(async () => {
    if (mdp.nouveau !== mdp.confirmation) throw new Error(tr('mdpDifferents', 'Les deux nouveaux mots de passe sont différents'));
    const r = await appel('/auth/mot-de-passe', { method: 'POST', body: JSON.stringify({ ancien: mdp.ancien, nouveau: mdp.nouveau }) });
    setMdp({ ancien: '', nouveau: '', confirmation: '' });
    setMessage('✅ ' + tr('mdpModifie', 'Mot de passe modifié ({{n}} autre(s) session(s) fermée(s))', { n: r.sessions_fermees }));
  });
  const fermerSession = (id) => executer(() => appel(`/auth/sessions/${id}`, { method: 'DELETE' }));
  const fermerAutres = () => executer(() => appel('/auth/sessions/fermer-autres', { method: 'POST' }));

  const telechargerCodes = () => {
    const contenu = `SmartMaint - ${tr('codesTitre', 'Codes de secours')} (${moi?.email})\n\n` + codesSecours.join('\n') + '\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type: 'text/plain' }));
    a.download = 'smartmaint-codes-secours.txt';
    a.click();
  };

  const role = moi ? t('securite.role.' + moi.role, { defaultValue: moi.role }) : '';

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginTop: 0 }}>👤 {tr('titre', 'Mon compte')}</h2>
      {message && <p style={{ color: message.startsWith('✅') ? 'var(--succes)' : 'var(--danger)' }}>{message}</p>}

      {/* PROFIL */}
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>{tr('profil', 'Profil')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div><div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{tr('nom', 'Nom')}</div><b>{moi?.nom}</b></div>
          <div><div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>Email</div><b>{moi?.email}</b></div>
          <div><div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{tr('role', 'Rôle')}</div><b>{role}</b></div>
        </div>
      </div>

      {/* DOUBLE AUTHENTIFICATION */}
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>🔐 {tr('mfaTitre', 'Double authentification (2FA)')}</h3>
        {statut2fa?.actif ? (
          <>
            <p style={{ color: 'var(--succes)' }}>✅ {tr('mfaActive', 'Activée')} · {tr('codesRestants', '{{n}} code(s) de secours restant(s)', { n: statut2fa.codes_restants })}</p>
            {!desactivation ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button style={btn('var(--info)')} onClick={regenerer}>🔄 {tr('regenerer', 'Nouveaux codes de secours')}</button>
                <button style={btn('var(--danger)')} onClick={() => setDesactivation({ mot_de_passe: '', code: '' })}>{tr('desactiver', 'Désactiver la 2FA')}</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input style={champ} type="password" placeholder={tr('motDePasse', 'Mot de passe')} value={desactivation.mot_de_passe} onChange={e => setDesactivation({ ...desactivation, mot_de_passe: e.target.value })} />
                <input style={champ} placeholder={tr('code', 'Code à 6 chiffres')} value={desactivation.code} onChange={e => setDesactivation({ ...desactivation, code: e.target.value })} dir="ltr" />
                <button style={btn('var(--danger)')} onClick={desactiver}>{tr('confirmer', 'Confirmer')}</button>
                <button style={btn('var(--neutre)')} onClick={() => setDesactivation(null)}>{tr('annuler', 'Annuler')}</button>
              </div>
            )}
          </>
        ) : !preparation ? (
          <>
            <p style={{ color: 'var(--muted, #888)' }}>{tr('mfaExplication', "Protégez votre compte : en plus du mot de passe, un code à 6 chiffres généré par votre téléphone sera demandé à chaque connexion.")}</p>
            <button style={btn('var(--accent)')} onClick={preparer}>📱 {tr('activer', 'Activer la 2FA')}</button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <img src={preparation.qr_code} alt="QR code" style={{ background: 'white', padding: '8px', borderRadius: '8px', width: '200px' }} />
            <div style={{ flex: 1, minWidth: '240px' }}>
              <ol style={{ paddingInlineStart: '18px', lineHeight: 1.7, marginTop: 0 }}>
                <li>{tr('etape1', 'Installez Google Authenticator ou Microsoft Authenticator sur votre téléphone.')}</li>
                <li>{tr('etape2', 'Scannez le QR code avec l\'application.')}</li>
                <li>{tr('etape3', 'Saisissez le code à 6 chiffres affiché pour confirmer.')}</li>
              </ol>
              <div style={{ color: 'var(--muted, #888)', fontSize: '12px', marginBottom: '10px' }}>
                {tr('cleManuelle', 'Clé à saisir manuellement :')} <code dir="ltr" style={{ userSelect: 'all' }}>{preparation.secret}</code>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input style={{ ...champ, minWidth: '140px', letterSpacing: '4px', textAlign: 'center' }} maxLength={6} inputMode="numeric" placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} dir="ltr" />
                <button style={btn('var(--succes)')} onClick={activer} disabled={code.length !== 6}>✅ {tr('confirmer', 'Confirmer')}</button>
                <button style={btn('var(--neutre)')} onClick={() => setPreparation(null)}>{tr('annuler', 'Annuler')}</button>
              </div>
            </div>
          </div>
        )}

        {codesSecours && (
          <div style={{ marginTop: '16px', border: '2px dashed var(--attention)', borderRadius: '10px', padding: '14px' }}>
            <b style={{ color: 'var(--attention)' }}>⚠️ {tr('codesTitre', 'Codes de secours')}</b>
            <p style={{ fontSize: '13px', color: 'var(--muted, #888)' }}>{tr('codesConsigne', 'Conservez ces codes en lieu sûr : chacun permet une connexion si vous perdez votre téléphone. Ils ne seront plus affichés.')}</p>
            <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px', fontFamily: 'monospace', fontSize: '16px' }}>
              {codesSecours.map(c => <span key={c}>{c}</span>)}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button style={btn('var(--info)')} onClick={telechargerCodes}>⬇️ {tr('telecharger', 'Télécharger')}</button>
              <button style={btn('var(--neutre)')} onClick={() => setCodesSecours(null)}>{tr('jaiNote', "J'ai noté mes codes")}</button>
            </div>
          </div>
        )}
      </div>

      {/* MOT DE PASSE */}
      <div style={carte}>
        <h3 style={{ marginTop: 0 }}>🔑 {tr('mdpTitre', 'Changer le mot de passe')}</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input style={champ} type="password" autoComplete="current-password" placeholder={tr('ancien', 'Mot de passe actuel')} value={mdp.ancien} onChange={e => setMdp({ ...mdp, ancien: e.target.value })} />
          <input style={champ} type="password" autoComplete="new-password" placeholder={tr('nouveau', 'Nouveau mot de passe')} value={mdp.nouveau} onChange={e => setMdp({ ...mdp, nouveau: e.target.value })} />
          <input style={champ} type="password" autoComplete="new-password" placeholder={tr('confirmation', 'Confirmation')} value={mdp.confirmation} onChange={e => setMdp({ ...mdp, confirmation: e.target.value })} />
          <button style={btn('var(--accent)')} onClick={changerMdp} disabled={!mdp.ancien || !mdp.nouveau}>{tr('modifier', 'Modifier')}</button>
        </div>
        <p style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{t('securite.regleMdp', { defaultValue: '8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un caractère spécial.' })} {tr('autresFermees', 'Vos autres sessions seront fermées.')}</p>
      </div>

      {/* MES SESSIONS */}
      <div style={carte}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>💻 {tr('sessionsTitre', 'Mes sessions actives')}</h3>
          {sessions.length > 1 && <button style={btn('var(--orange)')} onClick={fermerAutres}>🚪 {tr('fermerAutres', 'Fermer les autres sessions')}</button>}
        </div>
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={td}><b>{s.appareil || '?'}</b>{s.courante && <span style={{ color: 'var(--succes)', marginInlineStart: '8px', fontSize: '12px' }}>● {tr('cetAppareil', 'cet appareil')}</span>}</td>
                  <td style={td} dir="ltr">{s.ip}</td>
                  <td style={td}>{s.localisation}</td>
                  <td style={td}>{new Date(s.derniere_activite).toLocaleString(locale)}</td>
                  <td style={td}>{s.courante
                    ? <button style={btn('var(--neutre)')} onClick={onLogout}>{tr('seDeconnecter', 'Se déconnecter')}</button>
                    : <button style={btn('var(--danger)')} onClick={() => fermerSession(s.id)}>{tr('fermer', 'Fermer')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MonCompte;
