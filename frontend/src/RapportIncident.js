import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const COULEURS_SEVERITE = { critique: '#dc2626', haute: '#ea580c', moyenne: '#ca8a04', faible: '#6b7280' };
const COULEURS_STATUT = { planifiee: '#2563eb', en_cours: '#d97706', terminee: '#16a34a' };

const STYLE_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  #incident-a-imprimer, #incident-a-imprimer * { visibility: visible !important; }
  #incident-a-imprimer .pas-imprimer, #incident-a-imprimer [data-html2canvas-ignore] { display: none !important; }
  #incident-a-imprimer { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

// RAPPORT D'INCIDENT : alerte, mesures avant et après, analyse automatique et suite donnée,
// généré à partir des données réelles de l'alerte (route GET /alertes/{id}/rapport)
function RapportIncident({ alerteId, token, onClose }) {
  const { i18n } = useTranslation();
  const [langueDoc, setLangueDoc] = useState(i18n.language || 'fr');
  const t = i18n.getFixedT(langueDoc);
  const tPlateforme = i18n.getFixedT(i18n.language);
  const dir = LANGUES.find(l => l.code === langueDoc)?.dir || 'ltr';
  const locale = LOCALES[langueDoc] || 'fr-FR';
  const documentRef = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [info, setInfo] = useState('');
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState('');
  const [techniciens, setTechniciens] = useState([]);
  const [techId, setTechId] = useState('');
  const [datePrevue, setDatePrevue] = useState('');
  const [creation, setCreation] = useState(false);
  const [msgCreation, setMsgCreation] = useState('');

  const chargerRapport = async () => {
    try {
      const res = await fetch(`${API}/alertes/${alerteId}/rapport`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(String(res.status));
      setRapport(await res.json());
    } catch (e) {
      setErreur(tPlateforme('common.error', { code: e.message }));
    }
  };

  useEffect(() => {
    chargerRapport();
    (async () => {
      try {
        const res = await fetch(`${API}/interventions/techniciens`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setTechniciens(await res.json());
      } catch { setTechniciens([]); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  }, [alerteId, token]);

  // Création de l'ordre d'intervention en un clic, à partir de l'alerte
  const creerIntervention = async () => {
    setCreation(true); setMsgCreation('');
    try {
      const res = await fetch(`${API}/alertes/${alerteId}/intervention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ technicien_id: techId ? Number(techId) : null, date_intervention: datePrevue || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : String(res.status));
      setMsgCreation('✅ ' + tPlateforme('incident.interventionCreee', { defaultValue: "Ordre d'intervention {{numero}} créé", numero: `OI-${new Date().getFullYear()}-${String(data.id).padStart(4, '0')}` }));
      await chargerRapport();
    } catch (e) {
      setMsgCreation('❌ ' + e.message);
    } finally { setCreation(false); }
  };

  const orange = '#FF6B00';
  const bouton = { border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' };
  const fond = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2200, overflowY: 'auto', padding: '20px' };

  if (!rapport) {
    return (
      <div style={fond} onClick={onClose}>
        <div style={{ maxWidth: '400px', margin: '20vh auto', background: 'white', color: '#333', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
          {erreur ? '❌ ' + erreur : '⏳ ' + tPlateforme('document.generation')}
        </div>
      </div>
    );
  }

  const { alerte, equipement: eq, capteur, mesures, analyse: an, alertes_associees: associees, interventions, fenetre_minutes } = rapport;
  const unite = capteur?.unite || '';

  // ─── Mise en forme ───
  const formatDate = (d, opts = { dateStyle: 'long', timeStyle: 'medium' }) => d ? new Date(d).toLocaleString(locale, opts) : '-';
  const heure = (d) => d ? new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
  const nombre = (v, dec = 2) => (v === null || v === undefined) ? '-' : Number(v).toLocaleString(locale, { maximumFractionDigits: dec });
  const tr = (prefixe, v) => v ? t(prefixe + '.' + v, { defaultValue: v }) : '-';
  const formatDuree = (s) => {
    if (s === null || s === undefined) return '-';
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
  };

  const annee = alerte.created_at ? new Date(alerte.created_at).getFullYear() : new Date().getFullYear();
  const numero = `RI-${annee}-${String(alerte.id).padStart(5, '0')}`;
  const titre = t('incident.titre', { defaultValue: "Rapport d'incident" });
  const origineTxt = alerte.origine === 'ia'
    ? t('incident.origineIa', { defaultValue: 'Détection par intelligence artificielle (Isolation Forest)' })
    : t('incident.origineSeuil', { defaultValue: 'Dépassement de seuil configuré' });
  const plage = (capteur && capteur.seuil_min != null && capteur.seuil_max != null) ? capteur.seuil_max - capteur.seuil_min : null;
  const ecartPct = (an?.ecart_max != null && plage) ? Math.round(an.ecart_max / plage * 100) : null;

  // ─── Conclusion rédigée automatiquement à partir de l'analyse ───
  let conclusion = '';
  if (an && an.hors_seuil) {
    const sensTxt = an.sens === 'haut'
      ? t('incident.auDessus', { defaultValue: 'au-dessus du seuil max' })
      : t('incident.enDessous', { defaultValue: 'en dessous du seuil min' });
    conclusion = t('incident.conclusionSeuil', {
      defaultValue: "La mesure de {{capteur}} est passée {{sens}} ({{seuil}} {{unite}}) pendant {{duree}} ({{nb}} mesures consécutives), avec une valeur extrême de {{extreme}} {{unite}}, soit un écart de {{ecart}} {{unite}} au seuil.",
      capteur: tr('types', capteur?.type), sens: sensTxt, seuil: nombre(an.seuil_depasse), unite,
      duree: an.duree_anomalie_secondes != null ? formatDuree(an.duree_anomalie_secondes) : t('incident.dureeInconnue', { defaultValue: 'une durée indéterminée' }),
      nb: an.nb_mesures_hors_seuil, extreme: nombre(an.valeur_extreme), ecart: nombre(an.ecart_max),
    });
    conclusion += ' ' + (an.retour_normale
      ? t('incident.conclusionRetour', { defaultValue: 'Retour à la normale à {{heure}} ({{valeur}} {{unite}}).', heure: heure(an.retour_normale), valeur: nombre(an.valeur_retour), unite })
      : t('incident.conclusionPasRetour', { defaultValue: "Aucun retour à la normale n'a été observé dans la fenêtre analysée." }));
  } else if (an) {
    conclusion = t('incident.conclusionIa', {
      defaultValue: "La mesure ({{valeur}} {{unite}}) est restée dans les seuils configurés : l'anomalie a été détectée uniquement par l'IA, qui a repéré un comportement inhabituel par rapport au fonctionnement normal appris. Il s'agit d'un signal précoce à surveiller.",
      valeur: nombre(an.valeur_declenchante), unite,
    });
  } else {
    conclusion = t('incident.pasDeMesures', { defaultValue: 'Aucune mesure du capteur n\'est disponible autour de cet incident.' });
  }
  if (associees.length > 0) {
    conclusion += ' ' + t('incident.conclusionAssociees', { defaultValue: '{{n}} autre(s) alerte(s) ont été enregistrées sur le même équipement dans les 5 minutes autour de l\'incident.', n: associees.length });
  }

  // ─── Résumé texte (partage) ───
  const resume = [
    `${titre} ${numero}`,
    `${t('document.nom')} : ${eq?.nom || '-'}`,
    `${t('document.alerteType', { defaultValue: "Type d'alerte" })} : ${alerte.type}`,
    `${t('document.severite', { defaultValue: 'Sévérité' })} : ${tr('severites', alerte.severite)}`,
    `${t('document.mesure', { defaultValue: 'Mesure constatée' })} : ${alerte.message}`,
    `${t('incident.dateIncident', { defaultValue: "Date de l'incident" })} : ${formatDate(alerte.created_at)}`,
    '', conclusion, '', t('document.resumeFin'),
  ].join('\n');

  const optionsPdf = {
    margin: 8, filename: `${numero}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.bloc', 'tr'] },
  };
  const telechargerPdf = async () => {
    setEnCours(true); setInfo('');
    try { await html2pdf().set(optionsPdf).from(documentRef.current).save(); }
    finally { setEnCours(false); }
  };
  const partagerPdf = async () => {
    setEnCours(true); setInfo('');
    try {
      const blob = await html2pdf().set(optionsPdf).from(documentRef.current).outputPdf('blob');
      const fichier = new File([blob], `${numero}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: `${titre} ${numero}`, text: resume });
      } else {
        await html2pdf().set(optionsPdf).from(documentRef.current).save();
        setInfo(tPlateforme('document.partageIndisponible'));
      }
    } catch (e) {
      if (e.name !== 'AbortError') setInfo(tPlateforme('document.partageIndisponible'));
    } finally { setEnCours(false); }
  };
  const texteUrl = encodeURIComponent(resume);
  const liens = [
    { nom: 'WhatsApp', icone: '🟢', url: `https://wa.me/?text=${texteUrl}` },
    { nom: 'Telegram', icone: '✈️', url: `https://t.me/share/url?url=${encodeURIComponent(numero)}&text=${texteUrl}` },
    { nom: tPlateforme('document.email'), icone: '✉️', url: `mailto:?subject=${encodeURIComponent(titre + ' ' + numero)}&body=${texteUrl}` },
  ];

  // ─── Graphique SVG des mesures (sans bibliothèque) ───
  const Graphique = () => {
    if (!mesures.length) return <div style={vide}>{t('incident.pasDeMesures', { defaultValue: "Aucune mesure du capteur n'est disponible autour de cet incident." })}</div>;
    const W = 714, H = 250, g = { l: 52, r: 16, t: 14, b: 34 };
    const temps = mesures.map(m => new Date(m.t).getTime());
    const valeurs = mesures.map(m => m.v);
    const tA = new Date(alerte.created_at).getTime();
    const t0 = Math.min(...temps, tA), t1 = Math.max(...temps, tA);
    const bornes = [...valeurs];
    if (capteur?.seuil_min != null) bornes.push(capteur.seuil_min);
    if (capteur?.seuil_max != null) bornes.push(capteur.seuil_max);
    let vMin = Math.min(...bornes), vMax = Math.max(...bornes);
    const marge = (vMax - vMin) * 0.08 || 1;
    vMin = Math.max(0, vMin - marge); vMax += marge;
    const x = (ts) => g.l + (ts - t0) / ((t1 - t0) || 1) * (W - g.l - g.r);
    const y = (v) => g.t + (1 - (v - vMin) / ((vMax - vMin) || 1)) * (H - g.t - g.b);
    const hors = (v) => (capteur?.seuil_max != null && v > capteur.seuil_max) || (capteur?.seuil_min != null && v < capteur.seuil_min);
    const ligne = mesures.map((m, k) => `${x(temps[k]).toFixed(1)},${y(m.v).toFixed(1)}`).join(' ');
    const ticksV = [0, 1, 2, 3, 4].map(k => vMin + (vMax - vMin) * k / 4);
    const ticksT = [0, 1, 2, 3, 4].map(k => t0 + (t1 - t0) * k / 4);
    const hhmm = (ts) => new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const Seuil = ({ v, label }) => (v == null ? null : (
      <g>
        <line x1={g.l} x2={W - g.r} y1={y(v)} y2={y(v)} stroke="#dc2626" strokeDasharray="6 4" strokeWidth="1.2" />
        <text x={W - g.r - 4} y={y(v) - 4} textAnchor="end" fontSize="10" fill="#dc2626">{label} {nombre(v)} {unite}</text>
      </g>
    ));
    return (
      <svg dir="ltr" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', fontFamily: 'Arial, sans-serif' }}>
        {ticksV.map((v, k) => (
          <g key={'v' + k}>
            <line x1={g.l} x2={W - g.r} y1={y(v)} y2={y(v)} stroke="#eef0f3" />
            <text x={g.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#6b7280">{nombre(v, 1)}</text>
          </g>
        ))}
        {ticksT.map((ts, k) => (
          <text key={'t' + k} x={x(ts)} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b7280">{hhmm(ts)}</text>
        ))}
        <line x1={g.l} x2={g.l} y1={g.t} y2={H - g.b} stroke="#cbd5e1" />
        <line x1={g.l} x2={W - g.r} y1={H - g.b} y2={H - g.b} stroke="#cbd5e1" />
        <Seuil v={capteur?.seuil_max} label="max" />
        <Seuil v={capteur?.seuil_min} label="min" />
        <line x1={x(tA)} x2={x(tA)} y1={g.t} y2={H - g.b} stroke={orange} strokeWidth="1.5" />
        <text x={x(tA) + 4} y={g.t + 10} fontSize="10" fill={orange} fontWeight="bold">{t('incident.alerte', { defaultValue: 'Alerte' })}</text>
        <polyline points={ligne} fill="none" stroke="#2563eb" strokeWidth="1.4" />
        {mesures.map((m, k) => hors(m.v) && (
          <circle key={k} cx={x(temps[k])} cy={y(m.v)} r="3.5" fill="#dc2626" stroke="white" strokeWidth="1" />
        ))}
        <text x={14} y={g.t + (H - g.t - g.b) / 2} fontSize="10" fill="#6b7280" textAnchor="middle" transform={`rotate(-90 14 ${g.t + (H - g.t - g.b) / 2})`}>{unite}</text>
      </svg>
    );
  };

  // ─── Styles du document ───
  const titreSection = { background: orange, color: 'white', padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px', margin: '20px 0 10px' };
  const ligneS = { display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '7px 0' };
  const libelle = { width: '40%', color: '#6b7280', fontSize: '13px' };
  const valeurStyle = { width: '60%', fontWeight: 'bold', fontSize: '13px', color: '#111827' };
  const pastille = (c) => ({ background: c + '1f', color: c, border: `1px solid ${c}`, borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' });
  const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
  const thS = { background: '#1f2a44', color: 'white', padding: '7px 8px', textAlign: 'start', fontWeight: 'bold' };
  const tdS = (k) => ({ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', background: k % 2 ? '#f9fafb' : 'white', verticalAlign: 'top' });
  const vide = { color: '#9ca3af', fontSize: '12px', fontStyle: 'italic', padding: '6px 0' };
  const couleurSev = COULEURS_SEVERITE[alerte.severite] || '#dc2626';

  const Ligne = ({ l, v }) => (<div style={ligneS}><span style={libelle}>{l}</span><span style={valeurStyle}>{v ?? '-'}</span></div>);
  const Kpi = ({ label, valeur, detail, couleur }) => (
    <div style={{ flex: '1 1 120px', border: `1px solid ${couleur}55`, borderTop: `4px solid ${couleur}`, borderRadius: '8px', padding: '9px 11px', background: couleur + '0d' }}>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>{label}</div>
      <div dir="ltr" style={{ fontSize: '19px', fontWeight: 'bold', color: couleur, margin: '3px 0', textAlign: dir === 'rtl' ? 'right' : 'left' }}>{valeur}</div>
      {detail && <div style={{ fontSize: '10px', color: '#9ca3af' }}>{detail}</div>}
    </div>
  );

  return (
    <div style={fond}>
      <style>{STYLE_IMPRESSION}</style>

      {/* BARRE D'OUTILS */}
      <div style={{ maxWidth: '794px', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '13px' }}>
          🌐 {tPlateforme('document.langue')} :
          {LANGUES.map(l => (
            <button key={l.code} onClick={() => setLangueDoc(l.code)}
              style={{ ...bouton, padding: '5px 11px', background: langueDoc === l.code ? orange : 'white', color: langueDoc === l.code ? 'white' : '#333' }}>
              {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={telechargerPdf} disabled={enCours} style={{ ...bouton, background: '#16a34a', color: 'white', opacity: enCours ? 0.6 : 1 }}>⬇️ {tPlateforme('document.telecharger')}</button>
          <button onClick={partagerPdf} disabled={enCours} style={{ ...bouton, background: '#2563eb', color: 'white', opacity: enCours ? 0.6 : 1 }}>📤 {tPlateforme('document.partager')}</button>
          <button onClick={() => window.print()} style={{ ...bouton, background: orange, color: 'white' }}>🖨️ {tPlateforme('document.imprimer')}</button>
          <button onClick={onClose} style={{ ...bouton, background: 'white', color: '#333' }}>✕ {tPlateforme('document.fermer')}</button>
        </div>
      </div>
      <div style={{ maxWidth: '794px', margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: 'white', fontSize: '13px' }}>
        {tPlateforme('document.envoyerVia')} :
        {liens.map(l => (
          <a key={l.nom} href={l.url} target="_blank" rel="noreferrer"
            style={{ background: 'white', color: '#333', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', fontWeight: 'bold' }}>{l.icone} {l.nom}</a>
        ))}
        {enCours && <span>⏳ {tPlateforme('document.generation')}</span>}
      </div>
      {info && <div style={{ maxWidth: '794px', margin: '0 auto 12px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>ℹ️ {info}</div>}

      {/* DOCUMENT A4 */}
      <div id="incident-a-imprimer" ref={documentRef} dir={dir}
        style={{ maxWidth: '794px', margin: '0 auto', background: 'white', color: '#111827', padding: '36px 40px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', borderRadius: '4px' }}>

        {/* EN-TÊTE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `3px solid ${orange}`, paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <SmartMaintLogo size={52} />
            <div>
              <div dir="ltr" style={{ fontSize: '24px', fontWeight: 'bold' }}>
                <span style={{ color: '#111827' }}>SMART</span><span style={{ color: orange, fontWeight: 300, fontStyle: 'italic' }}>maint</span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{t('app.subtitle')}</div>
            </div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: orange }}>{titre}</div>
            <div style={{ fontSize: '13px', marginTop: '6px' }}>{t('document.numero')} : <strong dir="ltr">{numero}</strong></div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{t('document.dateEmission')} : {formatDate(new Date(), { dateStyle: 'long' })}</div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span style={pastille(couleurSev)}>{tr('severites', alerte.severite)}</span>
              <span style={pastille(alerte.origine === 'ia' ? '#7c3aed' : '#0d9488')}>{alerte.origine === 'ia' ? 'IA' : t('incident.seuil', { defaultValue: 'Seuil' })}</span>
            </div>
          </div>
        </div>

        {/* 1. ALERTE */}
        <div className="bloc">
          <div style={{ ...titreSection, background: couleurSev }}>🚨 {t('incident.sectionAlerte', { defaultValue: "Description de l'incident" })}</div>
          <Ligne l={t('document.alerteNumero', { defaultValue: "N° d'alerte" })} v={`#${alerte.id}`} />
          <Ligne l={t('document.alerteType', { defaultValue: "Type d'alerte" })} v={alerte.type} />
          <Ligne l={t('incident.origine', { defaultValue: 'Mode de détection' })} v={origineTxt} />
          <Ligne l={t('document.severite', { defaultValue: 'Sévérité' })} v={tr('severites', alerte.severite)} />
          <Ligne l={t('document.mesure', { defaultValue: 'Mesure constatée' })} v={alerte.message} />
          <Ligne l={t('incident.dateIncident', { defaultValue: "Date de l'incident" })} v={formatDate(alerte.created_at)} />
        </div>

        {/* 2. ÉQUIPEMENT ET CAPTEUR */}
        <div className="bloc">
          <div style={titreSection}>🏭 {t('incident.sectionEquipement', { defaultValue: 'Équipement et capteur concernés' })}</div>
          <Ligne l={t('document.nom')} v={eq?.nom} />
          <Ligne l={t('document.localisation')} v={eq?.localisation} />
          <Ligne l={t('fiche.capteur', { defaultValue: 'Capteur' })} v={capteur ? `#${capteur.id} ${tr('types', capteur.type)}` : '-'} />
          <Ligne l={t('fiche.seuils', { defaultValue: 'Seuils (min → max)' })} v={capteur ? <span dir="ltr">{capteur.seuil_min ?? '—'} → {capteur.seuil_max ?? '—'} {unite}</span> : '-'} />
        </div>

        {/* 3. GRAPHIQUE */}
        <div className="bloc">
          <div style={titreSection}>📈 {t('incident.sectionMesures', { defaultValue: 'Évolution des mesures' })} · ± {fenetre_minutes} min</div>
          <Graphique />
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
            <span><span style={{ color: '#2563eb', fontWeight: 'bold' }}>━</span> {t('incident.legendeMesures', { defaultValue: 'Mesures du capteur' })}</span>
            <span><span style={{ color: '#dc2626', fontWeight: 'bold' }}>┅</span> {t('incident.legendeSeuils', { defaultValue: 'Seuils configurés' })}</span>
            <span><span style={{ color: '#dc2626' }}>●</span> {t('incident.legendeHors', { defaultValue: 'Mesure hors seuil' })}</span>
            <span><span style={{ color: orange, fontWeight: 'bold' }}>│</span> {t('incident.legendeAlerte', { defaultValue: "Instant de l'alerte" })}</span>
          </div>
        </div>

        {/* 4. ANALYSE */}
        {an && (
          <div className="bloc">
            <div style={titreSection}>📊 {t('incident.sectionAnalyse', { defaultValue: "Analyse de l'incident" })}</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Kpi label={t('incident.valeurDeclenchante', { defaultValue: 'Valeur déclenchante' })} valeur={`${nombre(an.valeur_declenchante)} ${unite}`} couleur={couleurSev} />
              {an.hors_seuil && <Kpi label={t('incident.valeurExtreme', { defaultValue: 'Valeur extrême' })} valeur={`${nombre(an.valeur_extreme)} ${unite}`}
                detail={`${t('incident.ecart', { defaultValue: 'Écart au seuil' })} : ${nombre(an.ecart_max)} ${unite}${ecartPct != null ? ` (${ecartPct} %)` : ''}`} couleur="#dc2626" />}
              {an.hors_seuil && <Kpi label={t('incident.duree', { defaultValue: "Durée de l'anomalie" })} valeur={formatDuree(an.duree_anomalie_secondes)}
                detail={`${an.nb_mesures_hors_seuil} ${t('incident.mesuresHors', { defaultValue: 'mesure(s) hors seuil' })}`} couleur="#7c3aed" />}
              <Kpi label={t('incident.moyenneAvant', { defaultValue: "Moyenne avant l'incident" })} valeur={`${nombre(an.moyenne_avant)} ${unite}`}
                detail={t('incident.fonctionnementNormal', { defaultValue: 'Fonctionnement normal' })} couleur="#16a34a" />
            </div>
            {an.hors_seuil && (
              <div style={{ marginTop: '10px' }}>
                <Ligne l={t('incident.debutAnomalie', { defaultValue: "Début de l'anomalie" })} v={heure(an.debut_anomalie)} />
                <Ligne l={t('incident.finAnomalie', { defaultValue: 'Dernière mesure hors seuil' })} v={heure(an.fin_anomalie)} />
                <Ligne l={t('incident.retourNormale', { defaultValue: 'Retour à la normale' })}
                  v={an.retour_normale ? `${heure(an.retour_normale)} (${nombre(an.valeur_retour)} ${unite})` : t('incident.nonObserve', { defaultValue: 'Non observé' })} />
              </div>
            )}
            <div style={{ marginTop: '12px', background: '#f8fafc', borderInlineStart: `4px solid ${orange}`, borderRadius: '4px', padding: '10px 12px', fontSize: '13px', lineHeight: 1.5 }}>
              <strong>{t('incident.conclusion', { defaultValue: 'Conclusion' })} : </strong>{conclusion}
            </div>
          </div>
        )}

        {/* 5. ALERTES ASSOCIÉES */}
        <div className="bloc">
          <div style={titreSection}>🔗 {t('incident.sectionAssociees', { defaultValue: 'Alertes associées (± 5 min)' })}</div>
          {associees.length === 0 ? <div style={vide}>{t('fiche.aucuneAlerte', { defaultValue: 'Aucune alerte' })}</div> : (
            <table style={table}>
              <thead><tr>
                <th style={thS}>{t('fiche.date', { defaultValue: 'Date' })}</th>
                <th style={thS}>{t('document.alerteType', { defaultValue: "Type d'alerte" })}</th>
                <th style={thS}>{t('document.severite', { defaultValue: 'Sévérité' })}</th>
                <th style={thS}>{t('document.mesure', { defaultValue: 'Mesure constatée' })}</th>
              </tr></thead>
              <tbody>
                {associees.map((a, k) => (
                  <tr key={a.id}>
                    <td style={{ ...tdS(k), whiteSpace: 'nowrap' }}>{heure(a.created_at)}</td>
                    <td style={tdS(k)}>{a.type}</td>
                    <td style={tdS(k)}><span style={pastille(COULEURS_SEVERITE[a.severite] || '#6b7280')}>{tr('severites', a.severite)}</span></td>
                    <td style={tdS(k)}>{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 6. SUITE DONNÉE */}
        <div className="bloc">
          <div style={{ ...titreSection, background: '#16a34a' }}>🔧 {t('incident.sectionSuite', { defaultValue: "Suite donnée à l'incident" })}</div>
          {msgCreation && (
            <div data-html2canvas-ignore="true" style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 'bold', color: msgCreation.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{msgCreation}</div>
          )}
          {interventions.length === 0 ? (
            <>
              <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: '6px', padding: '10px 12px', fontSize: '13px' }}>
                ⚠️ {t('incident.aucuneIntervention', { defaultValue: "Aucune intervention n'a encore été créée pour cet incident." })}
              </div>
              {/* Création en un clic (visible à l'écran uniquement, jamais dans le PDF ni à l'impression) */}
              <div data-html2canvas-ignore="true" className="pas-imprimer"
                style={{ marginTop: '10px', border: '1px dashed #16a34a', borderRadius: '8px', padding: '12px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f0fdf4' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{tPlateforme('interventions.technicien')}</div>
                  <select value={techId} onChange={e => setTechId(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'inherit' }}>
                    <option value="">{tPlateforme('interventions.choisirTechnicien')}</option>
                    {techniciens.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{tPlateforme('interventions.datePrevue')}</div>
                  <input type="datetime-local" value={datePrevue} onChange={e => setDatePrevue(e.target.value)}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <button onClick={creerIntervention} disabled={creation}
                  style={{ ...bouton, background: '#16a34a', color: 'white', opacity: creation ? 0.6 : 1 }}>
                  🛠️ {tPlateforme('incident.creerIntervention', { defaultValue: "Créer l'ordre d'intervention" })}
                </button>
                <div style={{ flexBasis: '100%', fontSize: '11px', color: '#6b7280' }}>
                  {tPlateforme('incident.creerAide', { defaultValue: 'Intervention corrective liée à cette alerte, avec une priorité déduite de la sévérité et une description pré-remplie.' })}
                </div>
              </div>
            </>
          ) : interventions.map(i => (
            <div key={i.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <strong dir="ltr">{i.statut === 'terminee' ? 'FI' : 'OI'}-{String(i.id).padStart(4, '0')}</strong>
                <span style={pastille(COULEURS_STATUT[i.statut] || '#6b7280')}>{tr('statuts', i.statut)}</span>
              </div>
              <Ligne l={t('document.technicien')} v={i.technicien || t('common.notAssigned')} />
              <Ligne l={t('document.priorite', { defaultValue: 'Priorité' })} v={tr('interventions.priorites', i.priorite)} />
              {i.description && <Ligne l={t('document.description')} v={i.description} />}
              {i.diagnostic && <Ligne l={t('document.diagnostic', { defaultValue: 'Diagnostic' })} v={i.diagnostic} />}
              {i.actions_realisees && <Ligne l={t('document.actions', { defaultValue: 'Actions réalisées' })} v={i.actions_realisees} />}
              {i.duree_minutes != null && <Ligne l={t('document.duree', { defaultValue: 'Durée' })} v={`${i.duree_minutes} min`} />}
            </div>
          ))}
        </div>

        {/* VISA */}
        <div className="bloc" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '22px' }}>
          <div style={{ width: '45%', border: '1px dashed #9ca3af', borderRadius: '6px', height: '80px', padding: '8px', fontSize: '12px', color: '#6b7280' }}>
            {t('fiche.visa', { defaultValue: 'Visa du responsable maintenance' })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RapportIncident;
