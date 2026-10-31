import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const COULEURS_SEVERITE = { critique: '#dc2626', haute: '#ea580c', moyenne: '#ca8a04', faible: '#6b7280' };
const COULEURS_STATUT = { planifiee: '#2563eb', en_cours: '#d97706', terminee: '#16a34a', actif: '#16a34a', maintenance: '#d97706', panne: '#dc2626' };
const COULEURS_PRIORITE = { basse: '#6b7280', normale: '#2563eb', haute: '#ea580c', urgente: '#dc2626' };
const COULEUR_SEUIL = '#0d9488';
const COULEUR_IA = '#7c3aed';

const STYLE_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  #maintenance-a-imprimer, #maintenance-a-imprimer * { visibility: visible !important; }
  #maintenance-a-imprimer { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

const isoJour = (d) => d.toISOString().slice(0, 10);

// RAPPORT DE MAINTENANCE SUR UNE PÉRIODE : synthèse, alertes, indicateurs par équipement,
// interventions, charge des techniciens et recommandations (route GET /rapports/maintenance)
function RapportMaintenance({ token, onClose }) {
  const { i18n } = useTranslation();
  const [langueDoc, setLangueDoc] = useState(i18n.language || 'fr');
  const t = i18n.getFixedT(langueDoc);
  const tPlateforme = i18n.getFixedT(i18n.language);
  const dir = LANGUES.find(l => l.code === langueDoc)?.dir || 'ltr';
  const locale = LOCALES[langueDoc] || 'fr-FR';
  const documentRef = useRef(null);
  const aujourdhui = new Date();
  const [debut, setDebut] = useState(isoJour(new Date(aujourdhui.getTime() - 6 * 86400000)));
  const [fin, setFin] = useState(isoJour(aujourdhui));
  const [rapport, setRapport] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [info, setInfo] = useState('');

  const generer = async () => {
    setChargement(true); setErreur('');
    try {
      const res = await fetch(`${API}/rapports/maintenance?debut=${debut}&fin=${fin}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : String(res.status));
      setRapport(data);
    } catch (e) {
      setErreur(e.message);
    } finally { setChargement(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  useEffect(() => { generer(); }, []);

  const orange = '#FF6B00';
  const bouton = { border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' };
  const champ = { padding: '7px', borderRadius: '6px', border: 'none', fontFamily: 'inherit' };

  // ─── Mise en forme ───
  const formatDate = (d, opts = { dateStyle: 'long' }) => d ? new Date(d).toLocaleString(locale, opts) : '-';
  const nombre = (v, dec = 2) => (v === null || v === undefined) ? '-' : Number(v).toLocaleString(locale, { maximumFractionDigits: dec });
  const tr = (prefixe, v) => v ? t(prefixe + '.' + v, { defaultValue: v }) : '-';
  const formatDuree = (m) => {
    if (m === null || m === undefined) return '-';
    const h = Math.floor(m / 60), min = m % 60;
    return h > 0 ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
  };

  const titre = t('maintenance.titre', { defaultValue: 'Rapport de maintenance' });
  const numero = rapport ? `RM-${rapport.periode.debut.replace(/-/g, '')}-${rapport.periode.fin.replace(/-/g, '').slice(4)}` : '';

  const resume = rapport ? [
    `${titre} ${numero}`,
    `${t('maintenance.periode', { defaultValue: 'Période' })} : ${formatDate(rapport.periode.debut)} → ${formatDate(rapport.periode.fin)}`,
    `${t('maintenance.alertes', { defaultValue: 'Alertes' })} : ${rapport.synthese.nb_alertes}`,
    `${t('maintenance.interventions', { defaultValue: 'Interventions' })} : ${rapport.synthese.nb_interventions}`,
    `MTTR : ${formatDuree(rapport.synthese.mttr_minutes)} · ${t('fiche.disponibilite', { defaultValue: 'Disponibilité' })} : ${nombre(rapport.synthese.disponibilite_moyenne)} %`,
    '', ...rapport.recommandations.map(r => '• ' + r), '', t('document.resumeFin'),
  ].join('\n') : '';

  const optionsPdf = {
    margin: 8, filename: `${numero || 'rapport-maintenance'}.pdf`,
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

  // ─── Styles du document ───
  const titreSection = { background: orange, color: 'white', padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px', margin: '20px 0 10px' };
  const pastille = (c) => ({ background: c + '1f', color: c, border: `1px solid ${c}`, borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' });
  const table = { width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' };
  const thS = { background: '#1f2a44', color: 'white', padding: '7px 6px', textAlign: 'start', fontWeight: 'bold' };
  const tdS = (k) => ({ padding: '6px', borderBottom: '1px solid #e5e7eb', background: k % 2 ? '#f9fafb' : 'white', verticalAlign: 'top' });
  const vide = { color: '#9ca3af', fontSize: '12px', fontStyle: 'italic', padding: '6px 0' };

  const Kpi = ({ icone, label, valeur, detail, couleur }) => (
    <div style={{ flex: '1 1 140px', border: `1px solid ${couleur}55`, borderTop: `4px solid ${couleur}`, borderRadius: '8px', padding: '9px 11px', background: couleur + '0d' }}>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>{icone} {label}</div>
      <div dir="ltr" style={{ fontSize: '20px', fontWeight: 'bold', color: couleur, margin: '3px 0', textAlign: dir === 'rtl' ? 'right' : 'left' }}>{valeur}</div>
      {detail && <div style={{ fontSize: '10px', color: '#9ca3af' }}>{detail}</div>}
    </div>
  );

  const Barres = ({ donnees, couleurs, libelle }) => {
    const total = Object.values(donnees).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(donnees).map(([cle, n]) => (
      <div key={cle} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
        <span style={{ width: '90px' }}>{libelle(cle)}</span>
        <div style={{ flex: 1, background: '#f3f4f6', borderRadius: '4px', height: '12px', overflow: 'hidden' }}>
          <div style={{ width: `${n / total * 100}%`, minWidth: n ? '3px' : 0, height: '100%', background: couleurs[cle] || '#64748b' }} />
        </div>
        <strong style={{ width: '40px', textAlign: 'end' }}>{n}</strong>
      </div>
    ));
  };

  // Histogramme empilé des alertes par jour (seuils / IA), dessiné en SVG
  const Histogramme = ({ jours }) => {
    const W = 714, H = 200, g = { l: 34, r: 8, t: 10, b: 30 };
    const max = Math.max(1, ...jours.map(j => j.seuil + j.ia));
    const larg = (W - g.l - g.r) / jours.length;
    const y = (v) => g.t + (1 - v / max) * (H - g.t - g.b);
    const etiquette = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    const pas = Math.ceil(jours.length / 10);
    return (
      <svg dir="ltr" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', fontFamily: 'Arial, sans-serif' }}>
        {[0, 0.5, 1].map(k => (
          <g key={k}>
            <line x1={g.l} x2={W - g.r} y1={y(max * k)} y2={y(max * k)} stroke="#eef0f3" />
            <text x={g.l - 5} y={y(max * k) + 3} textAnchor="end" fontSize="10" fill="#6b7280">{Math.round(max * k)}</text>
          </g>
        ))}
        {jours.map((j, k) => {
          const x = g.l + k * larg + larg * 0.18, w = larg * 0.64;
          return (
            <g key={j.jour}>
              <rect x={x} y={y(j.seuil)} width={w} height={H - g.b - y(j.seuil)} fill={COULEUR_SEUIL} rx="2" />
              <rect x={x} y={y(j.seuil + j.ia)} width={w} height={y(j.seuil) - y(j.seuil + j.ia)} fill={COULEUR_IA} rx="2" />
              {(j.seuil + j.ia) > 0 && <text x={x + w / 2} y={y(j.seuil + j.ia) - 3} textAnchor="middle" fontSize="9" fill="#374151">{j.seuil + j.ia}</text>}
              {k % pas === 0 && <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize="10" fill="#6b7280">{etiquette(j.jour)}</text>}
            </g>
          );
        })}
        <line x1={g.l} x2={W - g.r} y1={H - g.b} y2={H - g.b} stroke="#cbd5e1" />
      </svg>
    );
  };

  const s = rapport?.synthese;
  const couleurDispo = (v) => v == null ? '#6b7280' : v >= 98 ? '#16a34a' : v >= 95 ? '#d97706' : '#dc2626';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, overflowY: 'auto', padding: '20px' }}>
      <style>{STYLE_IMPRESSION}</style>

      {/* CHOIX DE LA PÉRIODE ET BARRE D'OUTILS */}
      <div style={{ maxWidth: '794px', margin: '0 auto 12px', display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', color: 'white', fontSize: '12px' }}>
        <label>{tPlateforme('maintenance.du', { defaultValue: 'Du' })}<br />
          <input type="date" value={debut} max={fin} onChange={e => setDebut(e.target.value)} style={champ} /></label>
        <label>{tPlateforme('maintenance.au', { defaultValue: 'Au' })}<br />
          <input type="date" value={fin} min={debut} onChange={e => setFin(e.target.value)} style={champ} /></label>
        <button onClick={generer} disabled={chargement} style={{ ...bouton, background: orange, color: 'white', opacity: chargement ? 0.6 : 1 }}>
          🔄 {tPlateforme('maintenance.generer', { defaultValue: 'Générer' })}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginInlineStart: 'auto' }}>
          🌐 {LANGUES.map(l => (
            <button key={l.code} onClick={() => setLangueDoc(l.code)}
              style={{ ...bouton, padding: '5px 11px', background: langueDoc === l.code ? orange : 'white', color: langueDoc === l.code ? 'white' : '#333' }}>
              {l.code === 'ar' ? 'ع' : l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: '794px', margin: '0 auto 12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', color: 'white', fontSize: '13px' }}>
        <button onClick={telechargerPdf} disabled={enCours || !rapport} style={{ ...bouton, background: '#16a34a', color: 'white', opacity: enCours ? 0.6 : 1 }}>⬇️ {tPlateforme('document.telecharger')}</button>
        <button onClick={partagerPdf} disabled={enCours || !rapport} style={{ ...bouton, background: '#2563eb', color: 'white', opacity: enCours ? 0.6 : 1 }}>📤 {tPlateforme('document.partager')}</button>
        <button onClick={() => window.print()} disabled={!rapport} style={{ ...bouton, background: orange, color: 'white' }}>🖨️ {tPlateforme('document.imprimer')}</button>
        <button onClick={onClose} style={{ ...bouton, background: 'white', color: '#333' }}>✕ {tPlateforme('document.fermer')}</button>
        {rapport && liens.map(l => (
          <a key={l.nom} href={l.url} target="_blank" rel="noreferrer"
            style={{ background: 'white', color: '#333', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', fontWeight: 'bold' }}>{l.icone} {l.nom}</a>
        ))}
        {(enCours || chargement) && <span>⏳ {tPlateforme('document.generation')}</span>}
      </div>
      {info && <div style={{ maxWidth: '794px', margin: '0 auto 12px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>ℹ️ {info}</div>}
      {erreur && <div style={{ maxWidth: '794px', margin: '0 auto 12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>❌ {erreur}</div>}

      {rapport && (
        <div id="maintenance-a-imprimer" ref={documentRef} dir={dir}
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
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
                {t('maintenance.periode', { defaultValue: 'Période' })} : {formatDate(rapport.periode.debut)} → {formatDate(rapport.periode.fin)} ({rapport.periode.nb_jours} {t('fiche.jours', { defaultValue: 'jours' })})
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{t('document.dateEmission')} : {formatDate(new Date())}</div>
            </div>
          </div>

          {/* 1. SYNTHÈSE */}
          <div className="bloc">
            <div style={titreSection}>📊 {t('maintenance.synthese', { defaultValue: 'Synthèse de la période' })}</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Kpi icone="🚨" label={t('maintenance.alertes', { defaultValue: 'Alertes' })} valeur={nombre(s.nb_alertes, 0)}
                detail={`${rapport.alertes_par_origine.seuil} ${t('maintenance.seuils', { defaultValue: 'seuils' })} · ${rapport.alertes_par_origine.ia} IA`} couleur="#dc2626" />
              <Kpi icone="🔧" label={t('maintenance.interventions', { defaultValue: 'Interventions' })} valeur={nombre(s.nb_interventions, 0)}
                detail={`${s.nb_terminees} ${t('fiche.terminees', { defaultValue: 'terminées' }).toLowerCase()} · ${s.nb_ouvertes} ${t('maintenance.ouvertes', { defaultValue: 'ouvertes' })}`} couleur="#2563eb" />
              <Kpi icone="⏱️" label="MTTR" valeur={formatDuree(s.mttr_minutes)} detail={t('fiche.mttrDetail', { defaultValue: 'Temps moyen de réparation' })} couleur="#7c3aed" />
              <Kpi icone="✅" label={t('maintenance.dispoMoyenne', { defaultValue: 'Disponibilité moyenne' })} valeur={`${nombre(s.disponibilite_moyenne)} %`}
                detail={`${s.nb_equipements} ${t('maintenance.equipements', { defaultValue: 'équipements' })}`} couleur={couleurDispo(s.disponibilite_moyenne)} />
            </div>
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: '#374151', marginTop: '10px' }}>
              <span>🛠️ {t('maintenance.correctives', { defaultValue: 'Correctives' })} : <strong>{s.nb_correctives}</strong></span>
              <span>🗓️ {t('maintenance.preventives', { defaultValue: 'Préventives' })} : <strong>{s.nb_preventives}</strong></span>
              <span>🕒 {t('fiche.tempsTotal', { defaultValue: "Temps total d'intervention" })} : <strong>{formatDuree(s.temps_intervention_minutes)}</strong></span>
              <span style={{ color: s.graves_non_traitees ? '#b91c1c' : '#374151' }}>⚠️ {t('maintenance.nonTraitees', { defaultValue: 'Alertes graves sans intervention' })} : <strong>{s.graves_non_traitees}</strong></span>
            </div>
          </div>

          {/* 2. ALERTES */}
          <div className="bloc">
            <div style={titreSection}>🚨 {t('maintenance.analyseAlertes', { defaultValue: 'Analyse des alertes' })}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{t('maintenance.parJour', { defaultValue: 'Alertes par jour' })}</div>
            <Histogramme jours={rapport.alertes_par_jour} />
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#6b7280', margin: '2px 0 12px' }}>
              <span><span style={{ color: COULEUR_SEUIL }}>■</span> {t('maintenance.detectionSeuil', { defaultValue: 'Dépassements de seuil' })}</span>
              <span><span style={{ color: COULEUR_IA }}>■</span> {t('maintenance.detectionIa', { defaultValue: 'Détections IA' })}</span>
            </div>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>{t('maintenance.parSeverite', { defaultValue: 'Par sévérité' })}</div>
                <Barres donnees={rapport.alertes_par_severite} couleurs={COULEURS_SEVERITE} libelle={(c) => tr('severites', c)} />
              </div>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>{t('maintenance.parCapteur', { defaultValue: 'Par type de capteur' })}</div>
                <Barres donnees={rapport.alertes_par_capteur} couleurs={{ temperature: '#ef4444', pression: '#3b82f6', vibration: '#a855f7', courant: '#f59e0b' }} libelle={(c) => tr('types', c)} />
              </div>
            </div>
          </div>

          {/* 3. INDICATEURS PAR ÉQUIPEMENT */}
          <div className="bloc">
            <div style={titreSection}>🏭 {t('maintenance.parEquipement', { defaultValue: 'Indicateurs par équipement' })}</div>
            <table style={table}>
              <thead><tr>
                <th style={thS}>{t('document.nom')}</th>
                <th style={thS}>{t('document.statutEquipement')}</th>
                <th style={thS}>{t('maintenance.alertes', { defaultValue: 'Alertes' })}</th>
                <th style={thS}>{t('maintenance.pannes', { defaultValue: 'Pannes réparées' })}</th>
                <th style={thS}>MTTR</th>
                <th style={thS}>MTBF</th>
                <th style={thS}>{t('fiche.disponibilite', { defaultValue: 'Disponibilité' })}</th>
              </tr></thead>
              <tbody>
                {rapport.equipements.map((e, k) => (
                  <tr key={e.id}>
                    <td style={tdS(k)}><strong>{e.nom}</strong><div style={{ fontSize: '10px', color: '#9ca3af' }}>{e.localisation}</div></td>
                    <td style={tdS(k)}><span style={pastille(COULEURS_STATUT[e.statut] || '#6b7280')}>{tr('statuts', e.statut)}</span></td>
                    <td style={tdS(k)}>{e.nb_alertes}{e.nb_critiques > 0 && <span style={{ color: '#dc2626', fontSize: '10px' }}> ({e.nb_critiques} {tr('severites', 'critique').toLowerCase()})</span>}</td>
                    <td style={tdS(k)}>{e.nb_pannes}</td>
                    <td style={tdS(k)} dir="ltr">{formatDuree(e.mttr_minutes)}</td>
                    <td style={tdS(k)} dir="ltr">{e.mtbf_heures != null ? `${nombre(e.mtbf_heures, 1)} h` : '-'}</td>
                    <td style={{ ...tdS(k), fontWeight: 'bold', color: couleurDispo(e.disponibilite) }} dir="ltr">{nombre(e.disponibilite)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. INTERVENTIONS */}
          <div className="bloc">
            <div style={titreSection}>🔧 {t('maintenance.listeInterventions', { defaultValue: 'Interventions de la période' })}</div>
            {rapport.interventions.length === 0 ? <div style={vide}>{t('fiche.aucuneIntervention', { defaultValue: 'Aucune intervention' })}</div> : (
              <table style={table}>
                <thead><tr>
                  <th style={thS}>N°</th>
                  <th style={thS}>{t('fiche.date', { defaultValue: 'Date' })}</th>
                  <th style={thS}>{t('document.nom')}</th>
                  <th style={thS}>{t('document.typeIntervention', { defaultValue: 'Type' })}</th>
                  <th style={thS}>{t('document.technicien')}</th>
                  <th style={thS}>{t('document.statut')}</th>
                  <th style={thS}>{t('document.duree', { defaultValue: 'Durée' })}</th>
                </tr></thead>
                <tbody>
                  {rapport.interventions.map((i, k) => (
                    <tr key={i.id}>
                      <td style={tdS(k)} dir="ltr"><strong>{i.statut === 'terminee' ? 'FI' : 'OI'}-{String(i.id).padStart(4, '0')}</strong>
                        {i.alerte_id && <div style={{ fontSize: '10px', color: '#9ca3af' }}>🚨 #{i.alerte_id}</div>}</td>
                      <td style={{ ...tdS(k), whiteSpace: 'nowrap' }}>{formatDate(i.date, { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={tdS(k)}>{i.equipement}</td>
                      <td style={tdS(k)}>{tr('interventions.types', i.type_intervention)}
                        <div style={{ marginTop: '3px' }}><span style={pastille(COULEURS_PRIORITE[i.priorite] || '#6b7280')}>{tr('interventions.priorites', i.priorite)}</span></div></td>
                      <td style={tdS(k)}>{i.technicien || t('common.notAssigned')}</td>
                      <td style={tdS(k)}><span style={pastille(COULEURS_STATUT[i.statut] || '#6b7280')}>{tr('statuts', i.statut)}</span></td>
                      <td style={tdS(k)} dir="ltr">{formatDuree(i.duree_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rapport.techniciens.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '12px' }}>
                <div style={{ color: '#6b7280', marginBottom: '6px' }}>👷 {t('maintenance.charge', { defaultValue: 'Charge de travail par technicien' })}</div>
                {rapport.techniciens.map(c => (
                  <div key={c.technicien} style={{ display: 'flex', gap: '16px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <strong style={{ minWidth: '160px' }}>{c.technicien}</strong>
                    <span>{c.nb} {t('maintenance.interventionsMin', { defaultValue: 'interventions' }).toLowerCase()}</span>
                    <span>{c.terminees} {t('fiche.terminees', { defaultValue: 'terminées' }).toLowerCase()}</span>
                    <span>{formatDuree(c.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. RECOMMANDATIONS */}
          <div className="bloc">
            <div style={{ ...titreSection, background: '#16a34a' }}>💡 {t('maintenance.recommandations', { defaultValue: 'Recommandations' })}</div>
            <ol style={{ margin: 0, paddingInlineStart: '20px', fontSize: '13px', lineHeight: 1.6 }}>
              {rapport.recommandations.map((r, k) => <li key={k} style={{ marginBottom: '4px' }}>{r}</li>)}
            </ol>
          </div>

          {/* VISA */}
          <div className="bloc" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '22px' }}>
            <div style={{ width: '45%', border: '1px dashed #9ca3af', borderRadius: '6px', height: '80px', padding: '8px', fontSize: '12px', color: '#6b7280' }}>
              {t('fiche.visa', { defaultValue: 'Visa du responsable maintenance' })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RapportMaintenance;
