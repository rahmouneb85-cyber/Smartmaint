import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUES } from './i18n';

const MENU = [
  { id: 'dashboard', icon: '📊' },
  { id: 'equipements', icon: '🏭' },
  { id: 'capteurs', icon: '📡' },
  { id: 'interventions', icon: '🔧' },
  { id: 'room', icon: '🎥' },
];

function Sidebar({ page, setPage, onLogout, theme, toggleTheme, onAssistant, assistantOpen, admin,
                   mobile = false, reduitForce = false, ouvert = false, onFermer = () => {} }) {
  const { t, i18n } = useTranslation();

  const [reduitChoisi, setCollapsed] = useState(localStorage.getItem('sidebar') === 'collapsed');
  // téléphone : menu complet dans un tiroir ; tablette : icônes seulement ; ordinateur : au choix
  const collapsed = !mobile && (reduitForce || reduitChoisi);
  const collapsedChoix = reduitChoisi;

  // Échap ferme le tiroir sur téléphone
  useEffect(() => {
    if (!mobile || !ouvert) return;
    const surTouche = (e) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [mobile, ouvert, onFermer]);

  const aller = (id) => { setPage(id); if (mobile) onFermer(); };

  const basculer = () => {
    const v = !collapsedChoix;
    setCollapsed(v);
    localStorage.setItem('sidebar', v ? 'collapsed' : 'open');
  };

  const langueSuivante = () => {
    const i = LANGUES.findIndex(l => l.code === i18n.language);
    i18n.changeLanguage(LANGUES[(i + 1) % LANGUES.length].code);
  };

  const bouton = (actif) => ({
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
    padding: '12px', marginBottom: '6px', border: 'none', borderRadius: '10px',
    background: actif ? 'var(--accent-fond)' : 'transparent',
    color: actif ? 'white' : 'var(--sb-text, #c9ccd8)',
    fontSize: '14px', fontWeight: actif ? 'bold' : 'normal',
    cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit',
    justifyContent: collapsed ? 'center' : 'flex-start',
  });

  if (mobile && !ouvert) return null;

  return (
    <>
    {mobile && <div onClick={onFermer} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 999 }} />}
    <aside aria-label={t('menu.title')} style={{
      width: collapsed ? '72px' : (mobile ? '270px' : '230px'), flexShrink: 0,
      height: '100vh', position: mobile ? 'fixed' : 'sticky', top: 0, boxSizing: 'border-box',
      overflowY: 'auto', overflowX: 'hidden',                     // le menu défile si l'écran n'est pas assez haut
      ...(mobile ? { insetInlineStart: 0, zIndex: 1000, boxShadow: '0 0 24px #0009' } : {}),
      background: 'var(--sb-bg, #11131f)',
      borderInlineEnd: '1px solid var(--border, #2a2d3e)',
      padding: '16px 12px', display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease',
    }}>
      <style>{`.sb-item:hover { background: var(--sb-hover, #1f2233) !important; }`}</style>

      {/* EN-TÊTE : bouton réduire / agrandir */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', marginBottom: '20px' }}>
        {!collapsed && <span style={{ color: 'var(--accent)', fontWeight: 'bold', letterSpacing: i18n.language === 'ar' ? 0 : '2px', fontSize: '12px' }}>{t('menu.title')}</span>}
        {mobile ? (
          <button onClick={onFermer} aria-label={t('menu.fermer', { defaultValue: 'Fermer le menu' })}
            style={{ background: 'transparent', border: '1px solid var(--border, #2a2d3e)', color: 'var(--sb-text, #c9ccd8)', borderRadius: '8px', minWidth: '44px', minHeight: '44px', cursor: 'pointer', fontSize: '18px' }}>
            ✕
          </button>
        ) : !reduitForce && (
          <button onClick={basculer} title={collapsed ? t('menu.expand') : t('menu.collapse')} aria-label={collapsed ? t('menu.expand') : t('menu.collapse')}
            aria-expanded={!collapsed}
            style={{ background: 'transparent', border: '1px solid var(--border, #2a2d3e)', color: 'var(--sb-text, #c9ccd8)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}>
            ☰
          </button>
        )}
      </div>

      {/* NAVIGATION */}
      <nav aria-label={t('menu.title')} style={{ flex: 1 }}>
        {(admin ? [...MENU, { id: 'copilote', icon: '✨' }, { id: 'documents', icon: '📄' }, { id: 'workflows', icon: '⚙️' }, { id: 'compte', icon: '👤' }, { id: 'securite', icon: '🛡️' }, { id: 'parametres', icon: '🎛️' }] : [...MENU, { id: 'copilote', icon: '✨' }, { id: 'documents', icon: '📄' }, { id: 'compte', icon: '👤' }]).map(item => (
          <button key={item.id} onClick={() => aller(item.id)} title={t('menu.' + item.id)}
            aria-current={page === item.id ? 'page' : undefined} aria-label={collapsed ? t('menu.' + item.id) : undefined}
            className={page === item.id ? '' : 'sb-item'} style={bouton(page === item.id)}>
            <span aria-hidden="true" style={{ fontSize: '18px' }}>{item.icon}</span>
            {!collapsed && <span>{t('menu.' + item.id)}</span>}
          </button>
        ))}

        {/* ASSISTANT IA */}
        {onAssistant && (
          <button onClick={onAssistant} title={t('menu.assistant')}
            style={{ ...bouton(false), marginTop: '14px', border: '1px solid var(--accent)', color: 'var(--accent)', background: assistantOpen ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
            {!collapsed && <span>{t('menu.assistant')}</span>}
          </button>
        )}
      </nav>

      {/* BAS DE LA SIDEBAR : langue, thème et déconnexion */}
      <div style={{ borderTop: '1px solid var(--border, #2a2d3e)', paddingTop: '12px' }}>

        {/* Sélecteur de langue */}
        {collapsed ? (
          <button onClick={langueSuivante} title={t('menu.language')} className="sb-item" style={bouton(false)}>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{i18n.language.toUpperCase()}</span>
          </button>
        ) : (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ color: 'var(--muted, #888)', fontSize: '11px', marginBottom: '6px', paddingInlineStart: '4px' }}>🌐 {t('menu.language')}</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {LANGUES.map(l => (
                <button key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                  aria-label={l.label} aria-pressed={i18n.language === l.code} lang={l.code}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                    border: '1px solid ' + (i18n.language === l.code ? 'var(--accent-fond)' : 'var(--border, #2a2d3e)'),
                    background: i18n.language === l.code ? 'var(--accent-fond)' : 'transparent',
                    color: i18n.language === l.code ? 'white' : 'var(--sb-text, #c9ccd8)',
                  }}>
                  {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {toggleTheme && (
          <button onClick={toggleTheme} title={t('menu.changeTheme')} className="sb-item" style={bouton(false)}>
            <span style={{ fontSize: '18px' }}>{theme === 'light' ? '🌙' : '☀️'}</span>
            {!collapsed && <span>{theme === 'light' ? t('menu.themeDark') : t('menu.themeLight')}</span>}
          </button>
        )}
        <button onClick={onLogout} title={t('menu.logout')} className="sb-item"
          style={{ ...bouton(false), color: 'var(--danger)' }}>
          <span style={{ fontSize: '18px' }}>🚪</span>
          {!collapsed && <span>{t('menu.logout')}</span>}
        </button>
      </div>
    </aside>
    </>
  );
}

export default Sidebar;
