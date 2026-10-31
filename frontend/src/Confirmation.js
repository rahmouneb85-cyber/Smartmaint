import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Fenêtre de confirmation intégrée à SmartMaint, à la place de window.confirm / window.alert :
// même style que l'application, traduite, utilisable au clavier (Échap annule, focus piégé dans la fenêtre).
//   if (!(await confirmer('Supprimer ?'))) return;
//   informer('Saisie vocale indisponible');
let afficher = null;

export function confirmer(message, options = {}) {
  return new Promise(resoudre => {
    if (!afficher) { resoudre(window.confirm(message)); return; }       // filet de sécurité
    afficher({ message, resoudre, type: 'confirmation', ...options });
  });
}

export function informer(message) {
  return new Promise(resoudre => {
    if (!afficher) { window.alert(message); resoudre(true); return; }
    afficher({ message, resoudre, type: 'information' });
  });
}

export function FenetreConfirmation() {
  const { t } = useTranslation();
  const [demande, setDemande] = useState(null);
  const boutonAnnuler = useRef(null);
  const boutonOk = useRef(null);
  const precedent = useRef(null);

  useEffect(() => {
    afficher = (d) => { precedent.current = document.activeElement; setDemande(d); };
    return () => { afficher = null; };
  }, []);

  const fermer = (reponse) => {
    demande?.resoudre(reponse);
    setDemande(null);
    precedent.current?.focus?.();                 // le focus revient sur le bouton d'origine
  };

  useEffect(() => {
    if (!demande) return;
    (demande.type === 'information' ? boutonOk : boutonAnnuler).current?.focus();
    const surTouche = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); fermer(false); }
      if (e.key === 'Tab') {                       // le focus reste dans la fenêtre
        const elements = [boutonAnnuler.current, boutonOk.current].filter(Boolean);
        const i = elements.indexOf(document.activeElement);
        e.preventDefault();
        elements[(i + (e.shiftKey ? elements.length - 1 : 1)) % elements.length]?.focus();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gestionnaire lié à la demande affichée
  }, [demande]);

  if (!demande) return null;
  const danger = demande.type === 'confirmation' && demande.danger !== false;
  const bouton = { padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', minHeight: '44px', fontFamily: 'inherit' };

  return (
    <div onClick={() => fermer(false)} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmation-titre" aria-describedby="confirmation-message"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--card, #1a1d2e)', color: 'var(--text, white)', border: '1px solid var(--border, #2a2d3e)', borderRadius: '14px', padding: '22px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 40px #0008' }}>
        <h2 id="confirmation-titre" style={{ margin: '0 0 10px', fontSize: '18px', color: danger ? 'var(--danger)' : 'var(--accent)' }}>
          {demande.type === 'information' ? 'ℹ️ ' + t('commun.information', { defaultValue: 'Information' }) : (danger ? '⚠️ ' : '') + t('commun.confirmation', { defaultValue: 'Confirmation' })}
        </h2>
        <p id="confirmation-message" style={{ margin: '0 0 20px', lineHeight: 1.5 }}>{demande.message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {demande.type === 'confirmation' && (
            <button ref={boutonAnnuler} onClick={() => fermer(false)}
              style={{ ...bouton, background: 'transparent', color: 'var(--text, white)', border: '1px solid var(--border, #2a2d3e)' }}>
              {demande.annuler || t('common.cancel')}
            </button>
          )}
          <button ref={boutonOk} onClick={() => fermer(true)}
            style={{ ...bouton, border: 'none', color: '#fff', fontWeight: 'bold', background: danger ? 'var(--danger-fond)' : 'var(--accent-fond)' }}>
            {demande.ok || (demande.type === 'information' ? 'OK' : (danger ? t('common.delete') : t('commun.continuer', { defaultValue: 'Continuer' })))}
          </button>
        </div>
      </div>
    </div>
  );
}
