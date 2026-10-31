import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import BoutonsFlottants from './BoutonsFlottants';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';

const champ = {
  width: '100%', padding: '12px', marginBottom: '12px', background: '#0f1117',
  border: '1px solid #333', borderRadius: '8px', color: 'white', boxSizing: 'border-box', fontFamily: 'inherit'
};

// Page de connexion. L'inscription libre est fermée : seuls les administrateurs créent les comptes.
function Login({ onLogin }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState({ email: '', mot_de_passe: '' });
  const [voirMdp, setVoirMdp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaJeton, setMfaJeton] = useState(null);   // étape 2 : code de double authentification
  const [code, setCode] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.email || !form.mot_de_passe) {
      setError(t('login.champsVides', { defaultValue: 'Veuillez saisir votre email et votre mot de passe.' }));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), mot_de_passe: form.mot_de_passe })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          // le serveur indique le nombre de minutes restantes dans son message
          const minutes = (String(data.detail || '').match(/\d+/) || ['15'])[0];
          setError(t('login.bloque', { minutes, defaultValue: 'Trop de tentatives échouées. Réessayez dans {{minutes}} minute(s).' }));
        } else if (res.status === 403 && /appareil/i.test(String(data.detail || ''))) {
          setError(t('login.appareilBloque', { defaultValue: "Cet appareil a été bloqué par l'administrateur." }));
        } else if (res.status === 403) {
          setError(t('login.desactive', { defaultValue: "Compte désactivé. Contactez l'administrateur." }));
        } else {
          setError(t('login.badCredentials'));
        }
        setForm(f => ({ ...f, mot_de_passe: '' }));
        setLoading(false);
        return;
      }
      if (data.mfa_requis) {
        // mot de passe correct : on demande maintenant le code de l'application d'authentification
        setMfaJeton(data.mfa_jeton);
        setCode('');
        setLoading(false);
        return;
      }
      localStorage.setItem('token', data.access_token);
      onLogin(data.access_token);
    } catch (err) {
      setError(t('login.serverError'));
    }
    setLoading(false);
  };

  const verifierCode = async (e) => {
    if (e) e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/2fa/connexion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_jeton: mfaJeton, code: code.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          const minutes = (String(data.detail || '').match(/\d+/) || ['15'])[0];
          setError(t('login.bloque', { minutes, defaultValue: 'Trop de tentatives échouées. Réessayez dans {{minutes}} minute(s).' }));
        } else if (/délai|reconnect/i.test(String(data.detail || ''))) {
          setMfaJeton(null);
          setError(t('login.mfaExpire', { defaultValue: 'Délai dépassé. Reconnectez-vous.' }));
        } else {
          setError(t('login.codeFaux', { defaultValue: 'Code incorrect.' }));
        }
        setCode('');
        setLoading(false);
        return;
      }
      localStorage.setItem('token', data.access_token);
      onLogin(data.access_token);
    } catch (err) {
      setError(t('login.serverError'));
    }
    setLoading(false);
  };

  return (
    <main style={{ background: '#0f1117', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{ background: '#1a1d2e', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '380px', boxSizing: 'border-box', boxShadow: '0 0 40px rgba(255,107,0,0.2)' }}>

        {/* SÉLECTEUR DE LANGUE */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginBottom: '20px' }}>
          {LANGUES.map(l => (
            <button key={l.code} type="button" onClick={() => i18n.changeLanguage(l.code)}
              aria-label={l.label} aria-pressed={i18n.language === l.code} lang={l.code}
              style={{
                padding: '5px 10px', minWidth: '40px', minHeight: '32px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                border: '1px solid ' + (i18n.language === l.code ? '#ff6b00' : '#333'),
                background: i18n.language === l.code ? 'var(--accent-fond)' : 'transparent',
                color: i18n.language === l.code ? 'white' : '#a3a3a3',
              }}>
              {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
            </button>
          ))}
        </div>

        {/* LOGO */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '30px' }}>
          <SmartMaintLogo size={50} />
          <div style={{ marginInlineStart: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '26px' }} dir="ltr">
              <span style={{ color: 'white' }}>SMART</span>
              <span style={{ color: '#ff6b00', fontWeight: '300', fontStyle: 'italic' }}>maint</span>
            </h1>
            <p style={{ margin: 0, color: '#888', fontSize: '11px' }}>{t('login.subtitle')}</p>
          </div>
        </div>

        <h2 style={{ color: '#ff6b00', textAlign: 'center', marginBottom: '25px', fontSize: '19px' }}>
          <span aria-hidden="true">🔐 </span>{t('login.connexion', { defaultValue: 'Connexion' })}
        </h2>

        {mfaJeton ? (
        <form onSubmit={verifierCode} noValidate>
          <p style={{ color: '#c9ccd8', fontSize: '13px', textAlign: 'center', marginTop: 0 }}>
            📱 {t('login.mfaConsigne', { defaultValue: "Saisissez le code à 6 chiffres affiché dans votre application d'authentification, ou un code de secours." })}
          </p>
          <input autoFocus inputMode="text" autoComplete="one-time-code" maxLength={9} placeholder="123456"
            aria-label={t('login.code', { defaultValue: 'Code de vérification' })}
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            style={{ ...champ, textAlign: 'center', fontSize: '22px', letterSpacing: '6px' }} dir="ltr" />
          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: '13px', margin: '4px 0 12px', textAlign: 'center' }}>⚠️ {error}</p>
          )}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: 'var(--accent-fond)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
            {loading ? t('login.loading') : t('login.verifier', { defaultValue: 'Vérifier' })}
          </button>
          <button type="button" onClick={() => { setMfaJeton(null); setError(''); setForm(f => ({ ...f, mot_de_passe: '' })); }}
            style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← {t('login.retour', { defaultValue: 'Retour' })}
          </button>
        </form>
        ) : (
        <form onSubmit={handleSubmit} noValidate>
          <input type="email" autoComplete="username" placeholder={t('login.email', { defaultValue: 'Email' })}
            aria-label={t('login.email', { defaultValue: 'Email' })} aria-invalid={!!error}
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={champ} />

          <div style={{ position: 'relative' }}>
            <input type={voirMdp ? 'text' : 'password'} autoComplete="current-password"
              placeholder={t('login.password', { defaultValue: 'Mot de passe' })}
              aria-label={t('login.password', { defaultValue: 'Mot de passe' })} aria-invalid={!!error}
              value={form.mot_de_passe} onChange={e => setForm({ ...form, mot_de_passe: e.target.value })}
              style={{ ...champ, paddingInlineEnd: '44px' }} />
            <button type="button" onClick={() => setVoirMdp(!voirMdp)}
              title={voirMdp ? t('login.cacher', { defaultValue: 'Masquer' }) : t('login.afficher', { defaultValue: 'Afficher' })}
              aria-label={voirMdp ? t('login.cacher', { defaultValue: 'Masquer' }) : t('login.afficher', { defaultValue: 'Afficher' })} aria-pressed={voirMdp}
              style={{ position: 'absolute', insetInlineEnd: '4px', top: '4px', minWidth: '36px', minHeight: '36px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#888' }}>
              {voirMdp ? '🙈' : '👁️'}
            </button>
          </div>

          {error && (
            <p role="alert" style={{ color: '#f87171', fontSize: '13px', margin: '4px 0 12px', textAlign: 'center' }}>⚠️ {error}</p>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: 'var(--accent-fond)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
            {loading ? t('login.loading') : t('login.seConnecter', { defaultValue: 'Se connecter' })}
          </button>
        </form>
        )}

        <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginTop: '18px', marginBottom: 0 }}>
          {t('login.compteAdmin', { defaultValue: "Les comptes sont créés par l'administrateur." })}
        </p>
      </div>
      <BoutonsFlottants mode="public" />
    </main>
  );
}

export default Login;
