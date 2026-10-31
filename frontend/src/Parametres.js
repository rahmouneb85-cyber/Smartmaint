import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { confirmer } from './Confirmation';
import { exporterExcel, exporterPdf, exporterWord } from './exports';

// Paramètres → Personnalisation des boutons flottants (administrateur).
// Les réglages changent seulement l'affichage : masquer un bouton ne supprime pas la fonctionnalité
// et ne modifie aucun droit d'accès. Les contacts autorisés de la messagerie, eux, sont appliqués par le serveur.

const ESPACES = ['prive', 'contextuel', 'public'];
const CARTE = { background: 'var(--card, #1a1d2e)', borderRadius: 14, padding: 16, border: '1px solid var(--border, #2a2d3e)' };
const CHAMP = { background: 'var(--input, #0f1117)', color: 'var(--text, #fff)', border: '1px solid var(--border, #333)', borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit', fontSize: 13, minHeight: 36 };
const BOUTON = (fond) => ({ background: fond, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold', minHeight: 40 });

// contraste du blanc sur la couleur choisie (WCAG) : en dessous de 3:1, l'icône devient difficile à voir
function contrasteBlanc(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] + 0.05);
}

function Puce({ actif, onClick, children, desactive }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif} disabled={desactive} className="fab-filtre"
      style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }}>{children}</button>
  );
}

function Parametres({ token }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut, o = {}) => t('parametres.' + cle, { defaultValue: defaut, ...o });
  const [donnees, setDonnees] = useState(null);              // réponse du serveur (catalogue, date…)
  const [boutons, setBoutons] = useState([]);
  const [contacts, setContacts] = useState({});
  const [modifie, setModifie] = useState(false);
  const [message, setMessage] = useState(null);              // [couleur, texte]
  const [ouvert, setOuvert] = useState(null);                // bouton dont les détails sont dépliés
  const [apercu, setApercu] = useState({ role: 'technicien', langue: i18n.language === 'ar' ? 'ar' : 'fr', appareil: 'bureau', page: 'dashboard', nonLus: true });
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const appliquer = (d) => { setDonnees(d); setBoutons(d.boutons); setContacts(d.contacts); setModifie(false); };
  const charger = useCallback(() => {
    fetch(`${API}/boutons/configuration`, { headers: H }).then(r => (r.ok ? r.json() : Promise.reject(r.status))).then(appliquer)
      .catch(() => setMessage(['var(--danger)', tr('erreurChargement', 'Impossible de charger les réglages.')]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial
  }, [token]);
  useEffect(() => { charger(); }, [charger]);

  const libelle = useCallback((cle) => {
    const [espace, nom] = cle.split('.');
    if (espace === 'perso') {
      const b = boutons.find(x => x.cle === cle);
      return b?.libelles?.[i18n.language.slice(0, 2)] || b?.libelles?.fr || tr('nouveauBouton', 'Nouveau bouton');
    }
    const base = { whatsapp: 'WhatsApp', theme: tr('theme', 'Mode sombre ou clair'), langue: t('menu.language') }[nom] || t('fab.' + nom, { defaultValue: nom });
    return espace === 'contextuel' ? tr('contextuel', 'Bouton contextuel : {{nom}}', { nom: base }) : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépend de la langue et des boutons ajoutés
  }, [i18n.language, boutons]);

  const changer = (cle, champs) => { setBoutons(bs => bs.map(b => (b.cle === cle ? { ...b, ...champs } : b))); setModifie(true); };
  const deplacer = (cle, sens) => {
    setBoutons(bs => {
      const espace = bs.find(b => b.cle === cle).espace;
      const groupe = bs.filter(b => b.espace === espace).sort((a, b) => a.ordre - b.ordre);
      const i = groupe.findIndex(b => b.cle === cle);
      const j = i + sens;
      if (j < 0 || j >= groupe.length) return bs;
      [groupe[i], groupe[j]] = [groupe[j], groupe[i]];
      const ordres = Object.fromEntries(groupe.map((b, k) => [b.cle, k]));
      return bs.map(b => (b.cle in ordres ? { ...b, ordre: ordres[b.cle] } : b));
    });
    setModifie(true);
  };
  const basculerListe = (liste, valeur) => (liste.includes(valeur) ? liste.filter(x => x !== valeur) : [...liste, valeur]);
  const infoDe = (b) => donnees?.catalogue.boutons[b.cle] || { icone: '📌', conditions: ['toujours', 'horaires'] };
  const ajouterBouton = () => {
    const cle = 'perso.b' + Date.now().toString(36).slice(-8);
    const ordre = Math.max(0, ...boutons.filter(b => b.espace === 'prive').map(b => b.ordre)) + 1;
    setBoutons(bs => [...bs, { cle, espace: 'prive', visible: true, ordre, couleur: '#0f766e', icone: '📌', taille: 'normal', animation: 'discrete',
      langues: [], roles: [...roles], pages: [], appareils: 'tous', condition: 'toujours', heure_debut: 8, heure_fin: 18,
      libelles: { fr: '', en: '', ar: '' }, cible_type: 'page', cible: 'dashboard' }]);
    setOuvert(cle); setModifie(true);
  };
  const retirerBouton = (cle) => { setBoutons(bs => bs.filter(b => b.cle !== cle)); setModifie(true); };
  const nbAjoutes = boutons.filter(b => b.cle.startsWith('perso.')).length;

  const enregistrer = async () => {
    const r = await fetch(`${API}/boutons/configuration`, { method: 'PUT', headers: H, body: JSON.stringify({ boutons, contacts }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(['var(--danger)', typeof d.detail === 'string' ? d.detail : tr('invalide', 'Réglage invalide.')]); return; }
    appliquer(d);
    window.dispatchEvent(new Event('smartmaint-boutons'));
    setMessage(['var(--succes)', tr('enregistre', 'Réglages enregistrés : ils s’appliquent immédiatement.')]);
  };
  const reinitialiser = async () => {
    if (!(await confirmer(tr('confirmReinit', 'Rétablir les réglages d’origine de tous les boutons et des contacts de la messagerie ?'), { ok: tr('retablir', 'Rétablir') }))) return;
    const r = await fetch(`${API}/boutons/configuration/reinitialiser`, { method: 'POST', headers: H });
    if (r.ok) { appliquer(await r.json()); window.dispatchEvent(new Event('smartmaint-boutons')); setMessage(['var(--succes)', tr('reinitialise', 'Réglages d’origine rétablis.')]); }
  };

  const tries = useMemo(() => ESPACES.map(e => [e, boutons.filter(b => b.espace === e).sort((a, b) => a.ordre - b.ordre)]), [boutons]);
  const roles = donnees?.catalogue.roles || [];
  const nomRole = (r) => t('fab.role.' + r, { defaultValue: r });

  // ── export de la configuration ──
  const exporter = (format) => {
    const entetes = [tr('bouton', 'Bouton'), tr('espace', 'Espace'), tr('visible', 'Visible'), tr('ordre', 'Ordre'), tr('couleur', 'Couleur'),
      tr('icone', 'Icône'), tr('taille', 'Taille'), tr('animation', 'Animation'), tr('langues', 'Langues'),
      tr('roles', 'Rôles'), tr('pages', 'Pages'), tr('appareils', 'Appareils'), tr('condition', 'Condition')];
    const lignes = tries.flatMap(([, bs]) => bs.map((b, rang) => [libelle(b.cle), tr('e.' + b.espace, b.espace), b.visible ? tr('oui', 'Oui') : tr('non', 'Non'), rang + 1, b.couleur,
      b.icone, tr('t.' + b.taille, b.taille), tr('an.' + b.animation, b.animation), b.langues.length ? b.langues.join(', ').toUpperCase() : tr('toutes', 'Toutes'),
      b.espace === 'public' ? '—' : b.roles.map(nomRole).join(', '), b.pages.length ? b.pages.map(p => t('menu.' + p)).join(', ') : tr('toutes', 'Toutes'),
      tr('ap.' + b.appareils, b.appareils), tr('c.' + b.condition, b.condition) + (b.condition === 'horaires' ? ` (${b.heure_debut} h – ${b.heure_fin} h)` : '')]));
    const titre = tr('titreExport', 'SmartMaint · Personnalisation des boutons flottants');
    const sousTitre = `${new Date().toLocaleString(i18n.language)}`;
    const dir = i18n.dir();
    if (format === 'excel') exporterExcel('boutons_flottants', entetes, lignes);
    else if (format === 'word') exporterWord('boutons_flottants', titre, sousTitre, entetes, lignes, dir);
    else exporterPdf(titre, sousTitre, entetes, lignes, dir);
  };

  if (!donnees) return <div><h2 style={{ color: 'var(--accent)' }}>🎛️ {tr('titre', 'Paramètres')}</h2>{message ? <p role="alert" style={{ color: message[0] }}>{message[1]}</p> : <p>{tr('chargement', 'Chargement…')}</p>}</div>;

  // ── aperçu : mêmes règles que les boutons flottants ──
  const espaceApercu = apercu.role === 'visiteur' ? 'public' : 'prive';
  const affiche = (b) => b.visible && (b.espace === 'public' || b.roles.includes(apercu.role))
    && (b.espace === 'public' || !b.pages.length || b.pages.includes(apercu.page))
    && !(b.appareils === 'bureau' && apercu.appareil === 'mobile') && !(b.appareils === 'mobile' && apercu.appareil === 'bureau')
    && (!b.langues?.length || b.langues.includes(apercu.langue))
    && (!['non_lus', 'non_lus_ou_alerte', 'alerte_critique'].includes(b.condition) || apercu.nonLus);
  const tailleApercu = (b, base) => Math.round(base * ({ petit: 0.85, grand: 1.15 }[b.taille] || 1));
  const menuApercu = tries.find(([e]) => e === espaceApercu)[1].filter(affiche);
  const contextuelsApercu = espaceApercu === 'prive' ? tries.find(([e]) => e === 'contextuel')[1].filter(affiche) : [];

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', margin: '0 0 6px' }}>🎛️ {tr('titre', 'Paramètres')} · {tr('sousTitre', 'Personnalisation des boutons')}</h2>
      <p style={{ color: 'var(--muted, #999)', margin: '0 0 14px' }}>{tr('intro', 'Choisissez quels boutons flottants apparaissent, pour qui, où et dans quel ordre. Masquer un bouton ne supprime pas la fonctionnalité et ne change pas les droits d’accès.')}</p>

      <div style={{ ...CARTE, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, position: 'sticky', top: 0, zIndex: 5 }}>
        <button onClick={enregistrer} disabled={!modifie} style={{ ...BOUTON('var(--accent-fond)'), opacity: modifie ? 1 : 0.6 }}>💾 {tr('enregistrer', 'Enregistrer')}</button>
        <button onClick={() => { appliquer(donnees); setMessage(null); }} disabled={!modifie} style={{ ...BOUTON('var(--neutre-fond)'), opacity: modifie ? 1 : 0.6 }}>↺ {tr('annuler', 'Annuler les modifications')}</button>
        <button onClick={reinitialiser} style={BOUTON('var(--danger-fond)')}>⟲ {tr('reinitialiser', 'Réglages d’origine')}</button>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--muted, #999)' }}>{tr('exporter', 'Exporter')} :</span>
          <button onClick={() => exporter('excel')} style={BOUTON('var(--succes-fond)')}>Excel</button>
          <button onClick={() => exporter('word')} style={BOUTON('var(--info-fond)')}>Word</button>
          <button onClick={() => exporter('pdf')} style={BOUTON('var(--danger-fond)')}>PDF</button>
        </span>
        {modifie && <span role="status" style={{ width: '100%', fontSize: 13, color: 'var(--attention)' }}>● {tr('nonEnregistre', 'Modifications non enregistrées')}</span>}
        {message && <span role="status" style={{ width: '100%', fontSize: 13, color: message[0] }}>{message[1]}</span>}
        {donnees.maj && <span style={{ width: '100%', fontSize: 12, color: 'var(--muted, #999)' }}>{tr('derniereModif', 'Dernière modification : {{date}} par {{nom}}', { date: new Date(donnees.maj).toLocaleString(i18n.language), nom: donnees.maj_par || '—' })}</span>}
      </div>

      <div className="parametres-grille">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {tries.map(([espace, liste]) => (
            <section key={espace} style={CARTE} aria-labelledby={`titre-${espace}`}>
              <h3 id={`titre-${espace}`} style={{ margin: '0 0 4px' }}>{tr('e.' + espace, espace)}</h3>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted, #999)' }}>{tr('aide.' + espace, '')}</p>
              {espace === 'prive' && (
                <button onClick={ajouterBouton} disabled={nbAjoutes >= (donnees.catalogue.max_perso || 10)} style={{ ...BOUTON('var(--info-fond)'), marginBottom: 10 }}>
                  ＋ {tr('ajouterBouton', 'Ajouter un bouton')} ({nbAjoutes}/{donnees.catalogue.max_perso || 10})
                </button>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {liste.map((b, i) => {
                  const info = infoDe(b);
                  const faible = contrasteBlanc(b.couleur) < 3;
                  return (
                    <li key={b.cle} style={{ border: '1px solid var(--border, #2a2d3e)', borderRadius: 10, padding: 10, borderStyle: b.visible ? 'solid' : 'dashed' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 18, background: b.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, opacity: b.visible ? 1 : 0.35 }}>{b.icone || info.icone}</span>
                        <strong style={{ flex: 1, minWidth: 140, textDecoration: b.visible ? 'none' : 'line-through' }}>{libelle(b.cle)}{!b.visible && <span className="fab-puce" style={{ marginInlineStart: 8, textDecoration: 'none' }}>{tr('masque', 'Masqué')}</span>}</strong>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input type="checkbox" checked={b.visible} onChange={e => changer(b.cle, { visible: e.target.checked })} style={{ width: 18, height: 18 }} />
                          {tr('visible', 'Visible')}
                        </label>
                        <button onClick={() => deplacer(b.cle, -1)} disabled={i === 0} className="fab-filtre" aria-label={tr('monter', 'Monter {{nom}}', { nom: libelle(b.cle) })}>↑</button>
                        <button onClick={() => deplacer(b.cle, 1)} disabled={i === liste.length - 1} className="fab-filtre" aria-label={tr('descendre', 'Descendre {{nom}}', { nom: libelle(b.cle) })}>↓</button>
                        <input type="color" value={b.couleur} onChange={e => changer(b.cle, { couleur: e.target.value })} aria-label={tr('couleurDe', 'Couleur de {{nom}}', { nom: libelle(b.cle) })}
                          style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                        <button onClick={() => setOuvert(ouvert === b.cle ? null : b.cle)} aria-expanded={ouvert === b.cle} className="fab-filtre">⚙ {tr('details', 'Détails')}</button>
                      </div>
                      {faible && <p role="note" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--attention)' }}>⚠️ {tr('contraste', 'Couleur trop claire : l’icône blanche sera peu visible.')}</p>}
                      {ouvert === b.cle && (
                        <div style={{ display: 'grid', gap: 10, marginTop: 10, fontSize: 13 }}>
                          {b.cle.startsWith('perso.') && (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {['fr', 'en', 'ar'].map(lg => (
                                <label key={lg} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ minWidth: 92 }}>{tr('libelleEn', 'Libellé')} {lg.toUpperCase()}{lg === 'fr' ? ' *' : ''}</span>
                                  <input value={b.libelles?.[lg] || ''} maxLength={40} dir={lg === 'ar' ? 'rtl' : 'ltr'} required={lg === 'fr'}
                                    onChange={e => changer(b.cle, { libelles: { ...b.libelles, [lg]: e.target.value } })} style={{ ...CHAMP, flex: 1 }} />
                                </label>
                              ))}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <label>{tr('cible', 'Ouvre')}{' '}
                                  <select value={b.cible_type} onChange={e => changer(b.cle, { cible_type: e.target.value, cible: e.target.value === 'page' ? 'dashboard' : 'https://' })} style={CHAMP}>
                                    <option value="page">{tr('ciblePage', 'Une page de SmartMaint')}</option>
                                    <option value="lien">{tr('cibleLien', 'Un lien externe (https)')}</option>
                                  </select>
                                </label>
                                {b.cible_type === 'page'
                                  ? <select value={b.cible} onChange={e => changer(b.cle, { cible: e.target.value })} style={CHAMP} aria-label={tr('ciblePage', 'Une page de SmartMaint')}>
                                      {donnees.catalogue.pages.map(p => <option key={p} value={p}>{t('menu.' + p, { defaultValue: p })}</option>)}
                                    </select>
                                  : <input type="url" value={b.cible} maxLength={300} dir="ltr" onChange={e => changer(b.cle, { cible: e.target.value })} style={{ ...CHAMP, flex: 1, minWidth: 220 }}
                                      aria-label={tr('cibleLien', 'Un lien externe (https)')} placeholder="https://" />}
                                <button type="button" onClick={() => retirerBouton(b.cle)} style={BOUTON('var(--danger-fond)')}>🗑 {tr('retirerBouton', 'Retirer ce bouton')}</button>
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <label>{tr('icone', 'Icône')}{' '}
                              <select value={b.icone || info.icone} onChange={e => changer(b.cle, { icone: e.target.value })} style={{ ...CHAMP, fontSize: 16 }}>
                                {donnees.catalogue.icones.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                              </select>
                            </label>
                            <label>{tr('taille', 'Taille')}{' '}
                              <select value={b.taille} onChange={e => changer(b.cle, { taille: e.target.value })} style={CHAMP}>
                                {donnees.catalogue.tailles.map(x => <option key={x} value={x}>{tr('t.' + x, x)}</option>)}
                              </select>
                            </label>
                            <label>{tr('animation', 'Animation')}{' '}
                              <select value={b.animation} onChange={e => changer(b.cle, { animation: e.target.value })} style={CHAMP}>
                                {donnees.catalogue.animations.map(x => <option key={x} value={x}>{tr('an.' + x, x)}</option>)}
                              </select>
                            </label>
                          </div>
                          <div role="group" aria-label={tr('langues', 'Langues')}>
                            <div style={{ color: 'var(--muted, #999)', marginBottom: 4 }}>{tr('langues', 'Langues')} · {b.langues.length ? '' : tr('toutes', 'Toutes')}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {donnees.catalogue.langues.map(lg => <Puce key={lg} actif={b.langues.includes(lg)} onClick={() => changer(b.cle, { langues: basculerListe(b.langues, lg) })}>{{ fr: 'Français', en: 'English', ar: 'العربية' }[lg]}</Puce>)}
                            </div>
                          </div>
                          {espace !== 'public' && (
                            <div role="group" aria-label={tr('roles', 'Rôles')}>
                              <div style={{ color: 'var(--muted, #999)', marginBottom: 4 }}>{tr('roles', 'Rôles')}</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {roles.map(r => <Puce key={r} actif={b.roles.includes(r)} onClick={() => changer(b.cle, { roles: basculerListe(b.roles, r) })}>{nomRole(r)}</Puce>)}
                              </div>
                            </div>
                          )}
                          {espace !== 'public' && (
                            <div role="group" aria-label={tr('pages', 'Pages')}>
                              <div style={{ color: 'var(--muted, #999)', marginBottom: 4 }}>{tr('pages', 'Pages')} · {b.pages.length ? '' : tr('toutes', 'Toutes')}</div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {donnees.catalogue.pages.map(p => <Puce key={p} actif={b.pages.includes(p)} onClick={() => changer(b.cle, { pages: basculerListe(b.pages, p) })}>{t('menu.' + p, { defaultValue: p })}</Puce>)}
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                            <label>{tr('appareils', 'Appareils')}{' '}
                              <select value={b.appareils} onChange={e => changer(b.cle, { appareils: e.target.value })} style={CHAMP}>
                                {donnees.catalogue.appareils.map(a => <option key={a} value={a}>{tr('ap.' + a, a)}</option>)}
                              </select>
                            </label>
                            <label>{tr('condition', 'Condition')}{' '}
                              <select value={b.condition} onChange={e => changer(b.cle, { condition: e.target.value })} style={CHAMP} disabled={info.conditions.length < 2}>
                                {info.conditions.map(c => <option key={c} value={c}>{tr('c.' + c, c)}</option>)}
                              </select>
                            </label>
                            {b.condition === 'horaires' && (
                              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <label>{tr('de', 'de')} <input type="number" min={0} max={23} value={b.heure_debut} onChange={e => changer(b.cle, { heure_debut: Number(e.target.value) })} style={{ ...CHAMP, width: 64 }} /></label>
                                <label>{tr('a', 'à')} <input type="number" min={0} max={24} value={b.heure_fin} onChange={e => changer(b.cle, { heure_fin: Number(e.target.value) })} style={{ ...CHAMP, width: 64 }} /> h</label>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {/* CONTACTS DE LA MESSAGERIE : vrai droit, appliqué par le serveur */}
          <section style={CARTE} aria-labelledby="titre-contacts">
            <h3 id="titre-contacts" style={{ margin: '0 0 4px' }}>✉️ {tr('contactsTitre', 'Contacts autorisés dans la messagerie')}</h3>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted, #999)' }}>{tr('contactsAide', 'Ce réglage est un droit vérifié par le serveur : il s’applique aussi à WhatsApp entre collègues et à la recherche. Les conversations existantes restent consultables.')}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 360 }}>
                <thead><tr><th scope="col" style={{ textAlign: 'start', padding: 6 }}>{tr('peutEcrire', 'Peut écrire à →')}</th>{roles.map(r => <th key={r} scope="col" style={{ padding: 6 }}>{nomRole(r)}</th>)}</tr></thead>
                <tbody>
                  {roles.map(source => (
                    <tr key={source}>
                      <th scope="row" style={{ textAlign: 'start', padding: 6 }}>{nomRole(source)}</th>
                      {roles.map(cible => (
                        <td key={cible} style={{ textAlign: 'center', padding: 6 }}>
                          <input type="checkbox" checked={(contacts[source] || []).includes(cible)} style={{ width: 20, height: 20 }}
                            aria-label={tr('contactCase', '{{a}} peut écrire à {{b}}', { a: nomRole(source), b: nomRole(cible) })}
                            onChange={() => { setContacts({ ...contacts, [source]: basculerListe(contacts[source] || [], cible) }); setModifie(true); }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* APERÇU */}
        <aside style={{ ...CARTE, alignSelf: 'start', position: 'sticky', top: 120 }} aria-labelledby="titre-apercu">
          <h3 id="titre-apercu" style={{ margin: '0 0 10px' }}>👁 {tr('apercu', 'Aperçu')}</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <label>{tr('vuePar', 'Vu par')}{' '}
              <select value={apercu.role} onChange={e => setApercu({ ...apercu, role: e.target.value })} style={CHAMP}>
                <option value="visiteur">{tr('visiteur', 'Visiteur (avant connexion)')}</option>
                {roles.map(r => <option key={r} value={r}>{nomRole(r)}</option>)}
              </select>
            </label>
            {espaceApercu === 'prive' && <label>{tr('surPage', 'Sur la page')}{' '}
              <select value={apercu.page} onChange={e => setApercu({ ...apercu, page: e.target.value })} style={CHAMP}>
                {donnees.catalogue.pages.map(p => <option key={p} value={p}>{t('menu.' + p, { defaultValue: p })}</option>)}
              </select>
            </label>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['fr', 'FR'], ['ar', 'ع']].map(([l, n]) => <Puce key={l} actif={apercu.langue === l} onClick={() => setApercu({ ...apercu, langue: l })}>{n}</Puce>)}
              {['bureau', 'mobile'].map(a => <Puce key={a} actif={apercu.appareil === a} onClick={() => setApercu({ ...apercu, appareil: a })}>{tr('ap.' + a, a)}</Puce>)}
            </div>
            {espaceApercu === 'prive' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={apercu.nonLus} onChange={e => setApercu({ ...apercu, nonLus: e.target.checked })} />{tr('avecNonLus', 'Avec des éléments non lus')}
            </label>}
          </div>
          <div dir={apercu.langue === 'ar' ? 'rtl' : 'ltr'} aria-label={tr('apercuEcran', 'Écran simulé')} role="img"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: apercu.appareil === 'mobile' ? 460 : 400,
              width: apercu.appareil === 'mobile' ? 220 : '100%', margin: '0 auto', boxSizing: 'border-box', padding: 12,
              background: 'var(--bg, #0f1117)', borderRadius: 12, border: '1px solid var(--border, #2a2d3e)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {menuApercu.map(b => (
                <div key={b.cle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, background: 'var(--card, #1a1d2e)', border: '1px solid var(--border, #2a2d3e)', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>{libelle(b.cle)}</span>
                  <span style={{ width: tailleApercu(b, 26), height: tailleApercu(b, 26), borderRadius: '50%', background: b.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{b.icone || infoDe(b).icone}</span>
                </div>
              ))}
              {contextuelsApercu.length > 0 && <div style={{ height: 4 }} />}
              {contextuelsApercu.map(b => <span key={b.cle} title={libelle(b.cle)} style={{ width: tailleApercu(b, 28), height: tailleApercu(b, 28), borderRadius: '50%', background: b.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{b.icone || infoDe(b).icone}</span>)}
              <span style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--accent-fond)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>+</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted, #999)', margin: '8px 0 0' }}>{tr('apercuAide', 'Menu ouvert et boutons contextuels, tels qu’ils apparaîtront. Le bouton principal + est toujours affiché.')}</p>
        </aside>
      </div>
    </div>
  );
}

export default Parametres;
