import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';
import en from './en.json';
import ar from './ar.json';

// Langues disponibles, avec leur sens d'écriture
export const LANGUES = [
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];

// Applique la langue et le sens d'écriture (LTR / RTL) à toute la page
const appliquerDirection = (code) => {
  const langue = LANGUES.find(l => l.code === code) || LANGUES[0];
  document.documentElement.setAttribute('lang', langue.code);
  document.documentElement.setAttribute('dir', langue.dir);
};

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: localStorage.getItem('lang') || 'fr',   // langue mémorisée, français par défaut
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

appliquerDirection(i18n.language);

// À chaque changement de langue : mémorisation + sens d'écriture
i18n.on('languageChanged', (code) => {
  localStorage.setItem('lang', code);
  appliquerDirection(code);
});

export default i18n;