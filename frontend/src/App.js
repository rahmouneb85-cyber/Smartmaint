import React, { useState, useEffect, lazy, Suspense } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import Login from './Login';
import Sidebar from './Sidebar';
import Assistant from './Assistant';
import AnalyseIA from './AnalyseIA';
import './App.css';
import { deconnecterServeur } from './api';
import IndicateursMaintenance from './IndicateursMaintenance';
import SanteSysteme from './SanteSysteme';
import BoutonsFlottants from './BoutonsFlottants';
import { FenetreConfirmation } from './Confirmation';

// Pages chargées seulement à la première ouverture : le tableau de bord s'affiche plus vite
const Equipements = lazy(() => import('./Equipements'));
const Capteurs = lazy(() => import('./Capteurs'));
const Interventions = lazy(() => import('./Interventions'));
const Securite = lazy(() => import('./Securite'));
const MonCompte = lazy(() => import('./MonCompte'));
const Copilote = lazy(() => import('./Copilote'));
const Documents = lazy(() => import('./Documents'));
const Workflows = lazy(() => import('./Workflows'));
const Parametres = lazy(() => import('./Parametres'));
const RoomLive = lazy(() => import('./RoomLive'));

function ChargementPage() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted, #888)' }}>
      <span aria-hidden="true">⏳ </span>{t('app.chargement', { defaultValue: 'Chargement…' })}
    </div>
  );
}

const API = 'http://localhost:8001/api/v1';
const COLORS = ['#FF6B00', '#00ff88', '#2196F3'];
const TARGET_IDS = [2, 3, 4];
const COULEURS_SEVERITE = { faible: 'var(--succes)', moyenne: 'var(--attention)', haute: 'var(--orange)', critique: 'var(--danger)' };
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };

// Largeur de la fenêtre, mise à jour quand l'écran est redimensionné ou tourné
function useLargeurEcran() {
  const [largeur, setLargeur] = useState(window.innerWidth);
  useEffect(() => {
    const surRedimension = () => setLargeur(window.innerWidth);
    window.addEventListener('resize', surRedimension);
    return () => window.removeEventListener('resize', surRedimension);
  }, []);
  return largeur;
}

function App() {
  const { t, i18n } = useTranslation();
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [page, setPage] = useState('dashboard');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [equipements, setEquipements] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [alertStats, setAlertStats] = useState({ total: 0, critiques: 0 });
  const [capteurs, setCapteurs] = useState([]);
  const [sensorData, setSensorData] = useState([]);
  const [erreur, setErreur] = useState(false);
  const largeur = useLargeurEcran();
  const mobile = largeur < 768;                 // téléphone : menu en tiroir
  const menuReduit = largeur < 1100;            // tablette : menu réduit aux icônes
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Tableaux larges : défilement horizontal accessible au clavier (sur tablette et téléphone)
  useEffect(() => {
    const marquer = () => document.querySelectorAll('main table:not([tabindex])').forEach(tb => tb.setAttribute('tabindex', '0'));
    marquer();
    const obs = new MutationObserver(marquer);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const [moi, setMoi] = useState(null);   // utilisateur connecté (nom, rôle)
  const logoutLocal = () => { localStorage.removeItem('token'); setToken(null); setMoi(null); setPage('dashboard'); };
  // déconnexion réelle : la session est fermée sur le serveur, puis dans le navigateur
  const logout = () => { deconnecterServeur(localStorage.getItem('token')).finally(logoutLocal); };

  // jeton renouvelé automatiquement, ou session fermée à distance (voir api.js)
  useEffect(() => {
    const surJeton = (e) => setToken(e.detail);
    window.addEventListener('smartmaint-token', surJeton);
    window.addEventListener('smartmaint-logout', logoutLocal);
    return () => {
      window.removeEventListener('smartmaint-token', surJeton);
      window.removeEventListener('smartmaint-logout', logoutLocal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null)).then(setMoi).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  }, [token]);

  const fetchData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [eqRes, alertRes, capRes, statsRes] = await Promise.all([
        fetch(`${API}/equipements/`, { headers }),
        fetch(`${API}/alertes/`, { headers }),
        fetch(`${API}/capteurs/`, { headers }),
        fetch(`${API}/alertes/stats`, { headers })
      ]);

      if ([eqRes, alertRes, capRes, statsRes].some(r => r.status === 401 || r.status === 403)) {
        logout();
        return;
      }

      const eqData = await eqRes.json();
      const alertData = await alertRes.json();
      const capData = await capRes.json();
      const statsData = await statsRes.json();
      setEquipements(Array.isArray(eqData) ? eqData : []);
      setAlertes(Array.isArray(alertData) ? alertData : []);
      setCapteurs(Array.isArray(capData) ? capData : []);
      setAlertStats(statsData?.total !== undefined ? statsData : { total: 0, critiques: 0 });

      const dataPromises = TARGET_IDS.map(id =>
        fetch(`${API}/capteurs/${id}/data`, { headers }).then(r => r.json()).then(d => Array.isArray(d) ? d : [])
      );
      const allData = await Promise.all(dataPromises);

      const len = 20;
      const chartData = [];
      for (let i = 0; i < len; i++) {
        const point = { index: i + 1 };
        allData.forEach((d, idx) => {
          const slice = d.slice(-len);
          if (slice[i]) point[`capteur${TARGET_IDS[idx]}`] = parseFloat(slice[i].valeur.toFixed(2));
        });
        chartData.push(point);
      }
      setSensorData(chartData);
      setErreur(false);
    } catch (err) {
      console.error('Erreur:', err);
      setErreur(true);
    }
  };

  const nomType = (type) => type ? t('types.' + type, { defaultValue: type }) : '';

   const titreAlerte = (a) => {
    const ia = a.type?.match(/^Anomalie IA (\w+)$/);
    if (ia) return t('dashboard.anomalieIA', { type: nomType(ia[1]) });
    const m = a.type?.match(/^Anomalie (\w+)$/);
    return m ? t('dashboard.anomalie', { type: nomType(m[1]) }) : a.type;
  };
  const messageAlerte = (a) => {
    const ia = a.message?.match(/^Score IA : ([\d.]+) % \((.+)\)$/);
    if (ia) return t('dashboard.messageIA', { score: ia[1], valeur: ia[2] });
    const m = a.message?.match(/^Valeur anormale détectée\s*:\s*(.+)$/);
    return m ? t('dashboard.valeurAnormale', { valeur: m[1] }) : a.message;
  };
  if (!token) return <Login onLogin={(tk) => setToken(tk)} />;

  const grille = theme === 'light' ? '#e5e7eb' : '#2a2d3e';
  const carte = { background: 'var(--card, #1a1d2e)', borderRadius: '12px', padding: '20px' };
  const locale = LOCALES[i18n.language] || 'fr-FR';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial', background: 'var(--bg, #0f1117)', color: 'var(--text, white)' }}>
      <a href="#contenu" className="lien-evitement">{t('app.allerContenu', { defaultValue: 'Aller au contenu' })}</a>

      <Sidebar page={page} setPage={setPage} onLogout={logout} theme={theme} toggleTheme={toggleTheme}
        onAssistant={() => setAssistantOpen(!assistantOpen)} assistantOpen={assistantOpen}
        admin={moi?.role === 'admin'} mobile={mobile} reduitForce={menuReduit && !mobile}
        ouvert={menuOuvert} onFermer={() => setMenuOuvert(false)} />

      <main id="contenu" tabIndex={-1} style={{ flex: 1, minWidth: 0, padding: mobile ? '12px' : '20px', outline: 'none' }}>

        {/* HEADER */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: mobile ? '16px' : '25px', borderBottom: '2px solid var(--accent, #FF6B00)', paddingBottom: '15px' }}>
          {mobile && (
            <button onClick={() => setMenuOuvert(true)} aria-label={t('menu.ouvrir', { defaultValue: 'Ouvrir le menu' })} aria-expanded={menuOuvert}
              style={{ background: 'transparent', border: '1px solid var(--border, #2a2d3e)', color: 'var(--text, white)', borderRadius: '10px', minWidth: '44px', minHeight: '44px', fontSize: '20px', cursor: 'pointer' }}>
              ☰
            </button>
          )}
          <SmartMaintLogo size={mobile ? 36 : 45} />
          <div style={{ marginInlineStart: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '24px' }} dir="ltr">
              <span style={{ color: 'var(--text, white)' }}>SMART</span><span style={{ color: 'var(--accent)', fontWeight: '300', fontStyle: 'italic' }}>maint</span>
            </h1>
            <p style={{ margin: 0, color: 'var(--muted, #888)', fontSize: '11px' }}>{t('app.subtitle')}</p>
          </div>
          <div style={{ marginInlineStart: 'auto', background: 'var(--card, #1a1d2e)', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', color: erreur ? 'var(--danger)' : 'var(--succes)' }}>
            {erreur ? '🔴 ' + t('app.offline') : '🟢 ' + t('app.active')}
          </div>
        </div>

        {erreur && (
          <div style={{ background: '#7f1d1d33', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '10px 15px', borderRadius: '8px', marginBottom: '20px' }}>
            ⚠️ {t('app.serverError')}
          </div>
        )}

        <Suspense fallback={<ChargementPage />}>
        {page === 'equipements' && <Equipements token={token} onLogout={logout} />}
        {page === 'capteurs' && <Capteurs token={token} onLogout={logout} />}
        {page === 'interventions' && <Interventions token={token} onLogout={logout} moi={moi} />}
        {page === 'securite' && moi?.role === 'admin' && <Securite token={token} moi={moi} />}
        {page === 'compte' && <MonCompte token={token} moi={moi} onLogout={logout} />}
        {page === 'copilote' && <Copilote token={token} moi={moi} />}
        {page === 'documents' && <Documents token={token} moi={moi} />}
        {page === 'workflows' && ['admin', 'superviseur'].includes(moi?.role) && <Workflows token={token} moi={moi} />}
        {page === 'parametres' && moi?.role === 'admin' && <Parametres token={token} />}
        {page === 'room' && <RoomLive moi={moi} />}
        </Suspense>

        {page === 'dashboard' && (
          <>
            {['admin', 'superviseur'].includes(moi?.role) && <SanteSysteme token={token} />}

            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              {[
                { label: t('dashboard.equipements'), value: equipements.length, icon: '🏭', color: 'var(--succes)' },
                { label: t('dashboard.capteurs'), value: capteurs.length, icon: '📡', color: 'var(--info)' },
                { label: t('dashboard.totalAlertes'), value: alertStats.total, icon: '🔔', color: 'var(--orange)' },
                { label: t('dashboard.alertesCritiques'), value: alertStats.critiques, icon: '⚠️', color: 'var(--danger)' },
              ].map((kpi, i) => (
                <div key={i} style={{ ...carte, borderInlineStart: `4px solid ${kpi.color}` }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{kpi.icon}</div>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: kpi.color }}>{kpi.value}</div>
                  <div style={{ color: 'var(--muted, #888)', fontSize: '13px' }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* GRAPHIQUE */}
            <div style={{ ...carte, marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.17em', color: 'var(--accent)', marginTop: 0 }}>📊 {t('dashboard.chartTitle')}</h2>
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={sensorData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grille} />
                    <XAxis dataKey="index" stroke="#888" tick={{ fontSize: 11 }} label={{ value: t('dashboard.mesures'), position: 'insideBottom', fill: '#888' }} />
                    <YAxis stroke="#888" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: 'var(--card, #1a1d2e)', border: '1px solid var(--accent)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--text, white)' }} labelStyle={{ color: 'var(--text, white)' }} />
                    <Legend />
                    {TARGET_IDS.map((id, idx) => {
                      const cap = capteurs.find(c => c.id === id);
                      return (
                        <Line key={id} type="monotone" dataKey={`capteur${id}`}
                          name={`${nomType(cap?.type)} (id:${id})`}
                          stroke={COLORS[idx]} strokeWidth={2} dot={false} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* ANALYSE IA PRÉDICTIVE */}
            <IndicateursMaintenance token={token} />
            <AnalyseIA token={token} equipements={equipements} onLogout={logout} />
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* ÉQUIPEMENTS */}
              <div style={carte}>
                <h2 style={{ fontSize: '1.17em', color: 'var(--accent)', marginTop: 0 }}>🏭 {t('dashboard.equipementsTitle')}</h2>
                {equipements.map(eq => (
                  <div key={eq.id} style={{ background: 'var(--bg, #0f1117)', borderRadius: '8px', padding: '12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{eq.nom}</div>
                      <div style={{ color: 'var(--muted, #888)', fontSize: '12px' }}>{eq.type} — {eq.localisation}</div>
                    </div>
                    <span style={{ background: eq.statut === 'actif' ? 'color-mix(in srgb, var(--succes) 13%, transparent)' : 'color-mix(in srgb, var(--danger) 13%, transparent)', color: eq.statut === 'actif' ? 'var(--succes)' : 'var(--danger)', padding: '4px 10px', borderRadius: '12px', fontSize: '12px' }}>
                      {(eq.statut === 'actif' ? '✅ ' : '❌ ') + t('statuts.' + eq.statut, { defaultValue: eq.statut })}
                    </span>
                  </div>
                ))}
              </div>

              {/* DERNIÈRES ALERTES */}
              <div style={carte}>
                <h2 style={{ fontSize: '1.17em', color: 'var(--danger)', marginTop: 0 }}>⚠️ {t('dashboard.alertesTitle')}</h2>
                {alertes.slice(0, 8).map(alert => {
                  const c = COULEURS_SEVERITE[alert.severite] || 'var(--orange)';
                  return (
                    <div key={alert.id} style={{ background: 'var(--bg, #0f1117)', borderRadius: '8px', padding: '10px', marginBottom: '8px', borderInlineStart: `3px solid ${c}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{titreAlerte(alert)}</span>
                        <span style={{ fontSize: '11px', color: c }}>{t('severites.' + alert.severite, { defaultValue: alert.severite })}</span>
                      </div>
                      <div style={{ color: 'var(--muted, #888)', fontSize: '11px' }}>{messageAlerte(alert)}</div>
                      <div style={{ color: 'var(--muted, #888)', fontSize: '10px', marginTop: '4px' }}>{new Date(alert.created_at).toLocaleString(locale)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      <FenetreConfirmation />
      <BoutonsFlottants mode="prive" token={token} moi={moi} page={page} setPage={setPage} theme={theme} toggleTheme={toggleTheme}
        onAssistant={() => setAssistantOpen(true)} assistantOpen={assistantOpen} />
      <Assistant token={token} page={page} open={assistantOpen}
        onClose={() => setAssistantOpen(false)} onLogout={logout} />
    </div>
  );
}

export default App;
