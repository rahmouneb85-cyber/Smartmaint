import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';

// Support avec capture d'écran et suivi des demandes, ouvert depuis les boutons flottants.
// Le serveur ne renvoie que les demandes du compte connecté (toutes pour les administrateurs et superviseurs).

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
const jeton = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const appeler = async (chemin, methode = 'GET', corps) => {
  const r = await fetch(`${API}${chemin}`, { method: methode, headers: { ...jeton(), ...(corps ? { 'Content-Type': 'application/json' } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : String(r.status));
  return d;
};

export const COULEURS_STATUT = { ouverte: 'var(--info-fond)', en_cours: 'var(--attention-fond)', resolue: 'var(--succes-fond)', fermee: 'var(--neutre-fond)' };
const CATEGORIES = ['probleme', 'question', 'amelioration'];
const TAILLE_MAX = 5 * 1024 * 1024;

export function Statut({ statut, tr }) {
  return <span style={{ background: COULEURS_STATUT[statut] || '#4b5563', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
    {tr('st.' + statut, statut)}</span>;
}

// html2canvas ne lit pas les couleurs « color(srgb …) » produites par color-mix() : elles sont converties en rgba
const PROPRIETES = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'box-shadow', 'text-decoration-color', 'background-image'];
const versRgba = (v) => v.replace(/color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([-\d.e]+))?\)/g,
  (_, r, g, b, a) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a ?? 1})`);
function convertirCouleurs(copie) {
  const vue = copie.defaultView;
  copie.querySelectorAll('body *').forEach(el => {
    const style = vue.getComputedStyle(el);
    PROPRIETES.forEach(prop => {
      const valeur = style.getPropertyValue(prop);
      if (valeur.includes('color(')) el.style.setProperty(prop, versRgba(valeur));
    });
  });
}

// capture de la page affichée, sans les boutons flottants ; le module n'est chargé qu'au premier usage
async function capturerEcran() {
  const { default: html2canvas } = await import('html2canvas');
  const fond = getComputedStyle(document.body).backgroundColor;
  const canvas = await html2canvas(document.body, {
    backgroundColor: fond, logging: false, scale: Math.min(window.devicePixelRatio || 1, 1.5),
    width: window.innerWidth, height: window.innerHeight, x: window.scrollX, y: window.scrollY,
    ignoreElements: (el) => el.classList?.contains('boutons-flottants') || el.classList?.contains('visuellement-cache'),
    onclone: convertirCouleurs,
  });
  return new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('capture'))), 'image/jpeg', 0.85));
}

export function PanneauSupport({ style, tr, moi, pageCourante, demandeInitiale, toutesInitiales, surChangement }) {
  const { i18n } = useTranslation();
  const gestion = ['admin', 'superviseur'].includes(moi?.role);
  const [vue, setVue] = useState(demandeInitiale ? 'detail' : 'liste');      // liste | nouvelle | detail
  const [toutes, setToutes] = useState(gestion && !!toutesInitiales);
  const [liste, setListe] = useState(null);
  const [active, setActive] = useState(demandeInitiale || null);             // identifiant
  const [demande, setDemande] = useState(null);
  const [image, setImage] = useState(null);
  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = useCallback(() => {
    appeler(`/support/demandes${toutes ? '?toutes=true' : ''}`).then(setListe).catch(() => setListe([]));
  }, [toutes]);
  useEffect(() => { if (vue === 'liste') charger(); }, [vue, charger]);

  // détail d'une demande et de sa capture (chargée avec le jeton, jamais par une adresse publique)
  useEffect(() => {
    if (vue !== 'detail' || !active) return;
    let url = null;
    setDemande(null); setImage(null);
    appeler(`/support/demandes/${active}`).then(d => {
      setDemande(d); surChangement?.();
      if (d.capture) fetch(`${API}/support/demandes/${active}/capture`, { headers: jeton() })
        .then(r => (r.ok ? r.blob() : null)).then(b => { if (b) { url = URL.createObjectURL(b); setImage(url); } });
    }).catch(e => setErreur(e.message));
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rechargé quand la demande ouverte change
  }, [vue, active]);

  const date = (d) => new Date(d).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const ouvrir = (id) => { setErreur(''); setActive(id); setVue('detail'); };
  const repondre = async (e) => {
    e.preventDefault();
    if (!reponse.trim()) return;
    try { setDemande(await appeler(`/support/demandes/${active}/reponses`, 'POST', { texte: reponse.trim() })); setReponse(''); setErreur(''); }
    catch (err) { setErreur(err.message); }
  };
  const changerStatut = async (statut) => {
    try { setDemande(await appeler(`/support/demandes/${active}/statut`, 'PUT', { statut })); surChangement?.(); }
    catch (err) { setErreur(err.message); }
  };

  const bouton = { background: 'none', border: 'none', color: 'var(--text, #fff)', cursor: 'pointer', fontSize: 18, minWidth: 40, minHeight: 40 };
  const enTete = (titre, retourVers) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border, #2a2d3e)', position: 'sticky', top: 0, background: 'var(--card, #1a1d2e)', zIndex: 1 }}>
      {retourVers && <button onClick={() => { setErreur(''); setVue(retourVers); }} aria-label={tr('retour', 'Retour')} style={bouton}><span aria-hidden="true">{i18n.dir() === 'rtl' ? '→' : '←'}</span></button>}
      <h2 id="fab-support-titre" style={{ margin: 0, fontSize: 16, flex: 1 }}>{titre}</h2>
    </div>
  );
  const muet = { color: 'var(--muted, #888)', fontSize: 12 };

  return (
    <section aria-labelledby="fab-support-titre" style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      {vue === 'liste' && (
        <>
          {enTete('🛟 ' + tr('support', 'Support'))}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="fab-envoyer" style={{ width: '100%' }} onClick={() => { setErreur(''); setVue('nouvelle'); }}>📸 {tr('signaler', 'Signaler un problème')}</button>
            {gestion && (
              <div role="group" aria-label={tr('affichage', 'Affichage')} style={{ display: 'flex', gap: 6 }}>
                {[[false, tr('mesDemandes', 'Mes demandes')], [true, tr('toutesDemandes', 'Toutes les demandes')]].map(([v, l]) => (
                  <button key={String(v)} onClick={() => setToutes(v)} aria-pressed={toutes === v} className="fab-filtre">{l}</button>
                ))}
              </div>
            )}
          </div>
          {liste === null && <p style={{ padding: '0 16px', ...muet }}>{tr('chargement', 'Chargement…')}</p>}
          {liste?.length === 0 && <p style={{ padding: '0 16px', ...muet }}>{tr('aucuneDemande', 'Aucune demande pour le moment.')}</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 6px 6px' }}>
            {liste?.map(d => (
              <li key={d.id}>
                <button className="fab-ligne" onClick={() => ouvrir(d.id)} style={{ alignItems: 'flex-start' }}>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'start' }}>
                    <span style={{ display: 'block', fontWeight: d.nouveau ? 'bold' : 'normal' }}>{d.nouveau && <span aria-hidden="true">● </span>}#{d.id} · {d.sujet}</span>
                    <span style={{ display: 'block', ...muet, marginTop: 2 }}>
                      {toutes && d.auteur?.nom ? d.auteur.nom + ' · ' : ''}{date(d.maj)}{d.capture ? ' · 📎' : ''}
                    </span>
                  </span>
                  <Statut statut={d.statut} tr={tr} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {vue === 'nouvelle' && <NouvelleDemande tr={tr} enTete={enTete} pageCourante={pageCourante}
        surEnvoi={(d) => { surChangement?.(); ouvrir(d.id); }} />}

      {vue === 'detail' && (
        <>
          {enTete('🛟 ' + (demande ? `#${demande.id}` : tr('support', 'Support')), 'liste')}
          {!demande && !erreur && <p style={{ padding: 16, ...muet }}>{tr('chargement', 'Chargement…')}</p>}
          {demande && (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ flex: 1, minWidth: 0 }}>{demande.sujet}</strong>
                <Statut statut={demande.statut} tr={tr} />
              </div>
              <span style={muet}>{tr('cat.' + demande.categorie, demande.categorie)} · {demande.auteur?.nom} · {date(demande.date)}{demande.page ? ` · ${tr('pageConcernee', 'page')} « ${demande.page} »` : ''}</span>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{demande.description}</p>
              {image && <a href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt={tr('captureJointe', 'Capture d’écran jointe')} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border, #2a2d3e)' }} /></a>}
              {demande.reponses.map(r => (
                <div key={r.id} style={{ alignSelf: r.equipe ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '8px 12px', borderRadius: 12, fontSize: 13,
                  background: r.equipe ? 'var(--bg, #0f1117)' : 'var(--accent-fond)', color: r.equipe ? 'var(--text, #fff)' : '#fff' }}>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.85, marginBottom: 2 }}>{r.equipe ? '🛟 ' : ''}{r.auteur || '—'} · {date(r.date)}</span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{r.texte}</span>
                </div>
              ))}
              {gestion && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  {tr('statut', 'Statut')}
                  <select value={demande.statut} onChange={e => changerStatut(e.target.value)} className="fab-champ" style={{ flex: 1 }}>
                    {['ouverte', 'en_cours', 'resolue', 'fermee'].map(s => <option key={s} value={s}>{tr('st.' + s, s)}</option>)}
                  </select>
                </label>
              )}
              {!gestion && demande.statut !== 'fermee' && (
                <button onClick={() => changerStatut('fermee')} className="fab-filtre" style={{ alignSelf: 'flex-start' }}>✔ {tr('fermerDemande', 'Mon problème est réglé, fermer la demande')}</button>
              )}
            </div>
          )}
          {erreur && <p role="alert" style={{ margin: '0 12px', color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
          {demande && (
            <form onSubmit={repondre} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border, #2a2d3e)', marginTop: 'auto' }}>
              <input value={reponse} onChange={e => setReponse(e.target.value)} maxLength={4000} className="fab-champ"
                aria-label={tr('votreReponse', 'Votre réponse')} placeholder={tr('votreReponse', 'Votre réponse')} />
              <button type="submit" disabled={!reponse.trim()} className="fab-envoyer">{tr('envoyer', 'Envoyer')}</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

function NouvelleDemande({ tr, enTete, pageCourante, surEnvoi }) {
  const [f, setF] = useState({ categorie: 'probleme', sujet: '', description: '' });
  const [capture, setCapture] = useState(null);       // { blob, url }
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => () => { if (capture) URL.revokeObjectURL(capture.url); }, [capture]);
  const joindre = (blob) => {
    if (!blob) return;
    if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) { setErreur(tr('formatImage', 'Image PNG, JPEG ou WebP uniquement.')); return; }
    if (blob.size > TAILLE_MAX) { setErreur(tr('imageLourde', 'Image trop volumineuse (5 Mo maximum).')); return; }
    setErreur(''); setCapture({ blob, url: URL.createObjectURL(blob) });
  };
  const capturer = async () => {
    setEtat('capture'); setErreur('');
    try { joindre(await capturerEcran()); } catch { setErreur(tr('captureImpossible', 'Capture impossible : joignez une image à la place.')); }
    setEtat('');
  };
  const coller = (e) => {
    const fichier = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
    if (fichier) { e.preventDefault(); joindre(fichier); }
  };
  const envoyer = async (e) => {
    e.preventDefault();
    setEtat('envoi'); setErreur('');
    const donnees = new FormData();
    Object.entries(f).forEach(([k, v]) => donnees.append(k, v.trim ? v.trim() : v));
    if (pageCourante) donnees.append('page', pageCourante);
    donnees.append('navigateur', `${navigator.userAgent.slice(0, 200)} · ${window.innerWidth}x${window.innerHeight}`);
    if (capture) donnees.append('capture', capture.blob, capture.blob.type === 'image/png' ? 'capture.png' : 'capture.jpg');
    try {
      const r = await fetch(`${API}/support/demandes`, { method: 'POST', headers: jeton(), body: donnees });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : tr('invalideSupport', 'Vérifiez le sujet (3 caractères) et la description (5 caractères).'));
      surEnvoi(d);
    } catch (err) { setErreur(err.message); setEtat(''); }
  };

  return (
    <>
      {enTete('📸 ' + tr('signaler', 'Signaler un problème'), 'liste')}
      <form onSubmit={envoyer} onPaste={coller} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })} className="fab-champ" aria-label={tr('categorie', 'Type de demande')}>
          {CATEGORIES.map(c => <option key={c} value={c}>{tr('cat.' + c, c)}</option>)}
        </select>
        <input required minLength={3} maxLength={150} value={f.sujet} onChange={e => setF({ ...f, sujet: e.target.value })} className="fab-champ"
          placeholder={tr('sujet', 'Sujet')} aria-label={tr('sujet', 'Sujet')} />
        <textarea required minLength={5} maxLength={4000} rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className="fab-champ"
          placeholder={tr('description', 'Que s’est-il passé ? Qu’attendiez-vous ?')} aria-label={tr('descriptionCourte', 'Description')} />
        {capture ? (
          <div style={{ position: 'relative' }}>
            <img src={capture.url} alt={tr('apercu', 'Aperçu de la capture')} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border, #2a2d3e)' }} />
            <button type="button" onClick={() => setCapture(null)} className="fab-filtre" style={{ marginTop: 6 }}>✕ {tr('retirer', 'Retirer la capture')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={capturer} disabled={etat === 'capture'} className="fab-filtre">📸 {etat === 'capture' ? tr('captureEnCours', 'Capture…') : tr('capturer', 'Capturer l’écran')}</button>
            <label className="fab-filtre" style={{ display: 'inline-flex', alignItems: 'center' }}>
              📎 {tr('joindre', 'Joindre une image')}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => joindre(e.target.files?.[0])} className="visuellement-cache" />
            </label>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #888)' }}>{tr('aideCapture', 'Vous pouvez aussi coller une image (Ctrl+V). Vérifiez que la capture ne montre aucune information confidentielle.')}</p>
        {erreur && <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
        <button type="submit" disabled={etat === 'envoi'} className="fab-envoyer">{etat === 'envoi' ? tr('envoiEnCours', 'Envoi…') : tr('envoyer', 'Envoyer')}</button>
      </form>
    </>
  );
}
