// ─────────────────────────────────────────────────────────────
// Gestion automatique des jetons de SmartMaint
// Ce module remplace window.fetch pour les appels à l'API :
//  • ajoute l'identifiant de l'appareil et le cookie de session sur les routes /auth ;
//  • si l'API répond 401 (jeton d'accès expiré), renouvelle le jeton une seule fois
//    (même si plusieurs requêtes échouent en même temps) puis rejoue la requête ;
//  • si le renouvellement échoue (session fermée, expirée ou révoquée), déclenche la déconnexion.
// ─────────────────────────────────────────────────────────────
export const API = 'http://localhost:8001/api/v1';

const fetchOriginal = window.fetch.bind(window);
let renouvellementEnCours = null;

// Identifiant aléatoire de cet appareil (navigateur), conservé dans le navigateur
export function idAppareil() {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('deviceId', id);
    }
    return id;
  } catch (e) {
    return 'inconnu';
  }
}

function avecEntete(init, nom, valeur) {
  const entetes = new Headers((init && init.headers) || {});
  entetes.set(nom, valeur);
  return { ...(init || {}), headers: entetes };
}

// Un seul renouvellement à la fois, partagé par toutes les requêtes qui en ont besoin
export function renouvelerJeton() {
  if (!renouvellementEnCours) {
    renouvellementEnCours = fetchOriginal(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (rep) => {
        if (!rep.ok) throw new Error('Session fermée');
        const data = await rep.json();
        localStorage.setItem('token', data.access_token);
        window.dispatchEvent(new CustomEvent('smartmaint-token', { detail: data.access_token }));
        return data.access_token;
      })
      .finally(() => { setTimeout(() => { renouvellementEnCours = null; }, 0); });
  }
  return renouvellementEnCours;
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!url.startsWith(API)) return fetchOriginal(input, init);

  let options = { ...init };
  if (url.startsWith(`${API}/auth/`)) {
    options.credentials = 'include';                       // envoie le cookie HttpOnly de session
    options = avecEntete(options, 'X-Device-Id', idAppareil());
  }
  const reponse = await fetchOriginal(input, options);

  const sansRenouvellement = url.includes('/auth/login') || url.includes('/auth/refresh');
  if (reponse.status !== 401 || sansRenouvellement) return reponse;

  try {
    const nouveau = await renouvelerJeton();
    return fetchOriginal(input, avecEntete(options, 'Authorization', `Bearer ${nouveau}`));
  } catch (e) {
    window.dispatchEvent(new Event('smartmaint-logout'));
    return reponse;
  }
};

// Déconnexion réelle : la session est fermée sur le serveur et le cookie est effacé
export async function deconnecterServeur(token) {
  try {
    await window.fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (e) {
    // serveur injoignable : la déconnexion locale a lieu quand même
  }
}
