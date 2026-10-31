// Couleur de fond d'un bouton à texte blanc : version foncée de la couleur sémantique,
// pour garder un contraste d'au moins 4,5:1 (WCAG AA) dans les deux thèmes.
//   fondPour('var(--danger)') → 'var(--danger-fond)'
export const fondPour = (couleur) => (typeof couleur === 'string'
  ? couleur.replace(/var\(--(accent|orange|succes|danger|info|neutre|attention)\)/,
    (_, nom) => `var(--${nom === 'orange' ? 'accent' : nom}-fond)`)
  : couleur);
