import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import RapportIncident from './RapportIncident';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const COULEURS_STATUT = { actif: '#16a34a', maintenance: '#d97706', panne: '#dc2626', planifiee: '#2563eb', en_cours: '#d97706', terminee: '#16a34a' };
const COULEURS_SEVERITE = { critique: '#dc2626', haute: '#ea580c', moyenne: '#ca8a04', faible: '#6b7280' };
const COULEURS_ETAT = { normal: '#16a34a', hors_seuil: '#dc2626', inconnu: '#6b7280', inactif: '#9ca3af' };
const COULEURS_PRIORITE = { basse: '#6b7280', normale: '#2563eb', haute: '#ea580c', urgente: '#dc2626' };

const STYLE_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  #fiche-a-imprimer, #fiche-a-imprimer * { visibility: visible !important; }
  #fiche-a-imprimer [data-html2canvas-ignore] { display: none !important; }
  #fiche-a-imprimer { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

// FICHE DE SUIVI D'ÉQUIPEMENT : identification, indicateurs de maintenance (MTTR, MTBF, disponibilité),
// état des capteurs, alertes et historique des interventions — générée à partir des données réelles
function FicheEquipement({ equipementId, token, onClose }) {
  const { i18n } = useTranslation();
  const [langueDoc, setLangueDoc] = useState(i18n.language || 'fr');
  const t = i18n.getFixedT(langueDoc);
  const tPlateforme = i18n.getFixedT(i18n.language);
  const dir = LANGUES.find(l => l.code === langueDoc)?.dir || 'ltr';
  const locale = LOCALES[langueDoc] || 'fr-FR';
  const documentRef = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [info, setInfo] = useState('');
  const [fiche, setFiche] = useState(null);
  const [erreur, setErreur] = useState('');
  const [rapportId, setRapportId] = useState(null);   // alerte dont on affiche le rapport d'incident

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/equipements/${equipementId}/fiche`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(String(res.status));
        setFiche(await res.json());
      } catch (e) {
        setErreur(tPlateforme('common.error', { code: e.message }));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  }, [equipementId, token]);

  const orange = '#FF6B00';
  const bouton = { border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' };
  const fond = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, overflowY: 'auto', padding: '20px' };

  if (!fiche) {
    return (
      <div style={fond} onClick={onClose}>
        <div style={{ maxWidth: '400px', margin: '20vh auto', background: 'white', color: '#333', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
          {erreur ? '❌ ' + erreur : '⏳ ' + tPlateforme('document.generation')}
        </div>
      </div>
    );
  }

  const { equipement: eq, capteurs, alertes_par_severite: parSev, dernieres_alertes: alertes, interventions, indicateurs: ind } = fiche;

  // ─── Mise en forme ───
  const formatDate = (d, avecHeure = true) => d
    ? new Date(d).toLocaleString(locale, avecHeure ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'long' })
    : '-';
  const formatDuree = (m) => {
    if (m === null || m === undefined) return '-';
    const h = Math.floor(m / 60), min = m % 60;
    return h > 0 ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
  };
  const nombre = (v, dec = 2) => (v === null || v === undefined) ? '-' : Number(v).toLocaleString(locale, { maximumFractionDigits: dec });
  const tr = (prefixe, v) => v ? t(prefixe + '.' + v, { defaultValue: v }) : '-';

  const annee = new Date().getFullYear();
  const numero = `FE-${annee}-${String(eq.id).padStart(4, '0')}`;
  const titre = t('fiche.titre', { defaultValue: "Fiche de suivi d'équipement" });
  const joursService = eq.date_installation ? Math.max(0, Math.floor((Date.now() - new Date(eq.date_installation)) / 86400000)) : null;
  const nbHorsSeuil = capteurs.filter(c => c.etat === 'hors_seuil').length;
  const totalSev = Object.values(parSev).reduce((a, b) => a + b, 0) || 1;

  // ─── Résumé texte (partage) ───
  const resume = [
    `${titre} ${numero}`,
    `${t('document.nom')} : ${eq.nom}`,
    `${t('document.statutEquipement')} : ${tr('statuts', eq.statut)}`,
    `${t('fiche.disponibilite', { defaultValue: 'Disponibilité' })} : ${nombre(ind.disponibilite)} %`,
    `MTTR : ${formatDuree(ind.mttr_minutes)} · MTBF : ${ind.mtbf_heures !== null ? nombre(ind.mtbf_heures, 1) + ' h' : '-'}`,
    `${t('fiche.alertes30', { defaultValue: 'Alertes (30 jours)' })} : ${ind.nb_alertes}`,
    `${t('fiche.capteursHorsSeuil', { defaultValue: 'Capteurs hors seuil' })} : ${nbHorsSeuil}`,
    '', t('document.resumeFin'),
  ].join('\n');

  const optionsPdf = {
    margin: 8,
    filename: `${numero}.pdf`,
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
  const ligne = { display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '7px 0' };
  const libelle = { width: '40%', color: '#6b7280', fontSize: '13px' };
  const valeurStyle = { width: '60%', fontWeight: 'bold', fontSize: '13px', color: '#111827' };
  const pastille = (c) => ({ background: c + '1f', color: c, border: `1px solid ${c}`, borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' });
  const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
  const thS = { background: '#1f2a44', color: 'white', padding: '7px 8px', textAlign: 'start', fontWeight: 'bold' };
  const tdS = (k) => ({ padding: '7px 8px', borderBottom: '1px solid #e5e7eb', background: k % 2 ? '#f9fafb' : 'white', verticalAlign: 'top' });
  const vide = { color: '#9ca3af', fontSize: '12px', fontStyle: 'italic', padding: '6px 0' };

  const Ligne = ({ l, v }) => (<div style={ligne}><span style={libelle}>{l}</span><span style={valeurStyle}>{v || '-'}</span></div>);

  const Kpi = ({ icone, label, valeur, detail, couleur }) => (
    <div style={{ flex: '1 1 150px', border: `1px solid ${couleur}55`, borderTop: `4px solid ${couleur}`, borderRadius: '8px', padding: '10px 12px', background: couleur + '0d' }}>
      <div style={{ fontSize: '11px', color: '#6b7280' }}>{icone} {label}</div>
      <div dir="ltr" style={{ fontSize: '22px', fontWeight: 'bold', color: couleur, margin: '4px 0', textAlign: dir === 'rtl' ? 'right' : 'left' }}>{valeur}</div>
      <div style={{ fontSize: '10px', color: '#9ca3af' }}>{detail}</div>
    </div>
  );

  const couleurDispo = ind.disponibilite >= 98 ? '#16a34a' : ind.disponibilite >= 95 ? '#d97706' : '#dc2626';

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
      <div id="fiche-a-imprimer" ref={documentRef} dir={dir}
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
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{t('document.dateEmission')} : {formatDate(new Date(), false)}</div>
            <div style={{ marginTop: '8px' }}><span style={pastille(COULEURS_STATUT[eq.statut] || '#6b7280')}>{tr('statuts', eq.statut)}</span></div>
          </div>
        </div>

        {/* 1. IDENTIFICATION */}
        <div className="bloc">
          <div style={titreSection}>🏭 {t('fiche.identification', { defaultValue: "Identification de l'équipement" })}</div>
          <Ligne l={t('document.nom')} v={eq.nom} />
          <Ligne l={t('document.type')} v={eq.type} />
          <Ligne l={t('document.localisation')} v={eq.localisation} />
          <Ligne l={t('document.statutEquipement')} v={tr('statuts', eq.statut)} />
          <Ligne l={t('fiche.dateInstallation', { defaultValue: "Date d'installation" })}
            v={eq.date_installation ? `${formatDate(eq.date_installation, false)}${joursService !== null ? ` (${joursService} ${t('fiche.jours', { defaultValue: 'jours' })})` : ''}` : '-'} />
        </div>

        {/* 2. INDICATEURS DE MAINTENANCE */}
        <div className="bloc">
          <div style={titreSection}>📊 {t('fiche.indicateurs', { defaultValue: 'Indicateurs de maintenance' })} · {ind.periode_jours} {t('fiche.jours', { defaultValue: 'jours' })}</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Kpi icone="✅" label={t('fiche.disponibilite', { defaultValue: 'Disponibilité' })} valeur={`${nombre(ind.disponibilite)} %`}
              detail={t('fiche.dispoDetail', { defaultValue: 'Temps hors réparation' })} couleur={couleurDispo} />
            <Kpi icone="⏱️" label={t('fiche.mttr', { defaultValue: 'MTTR' })} valeur={formatDuree(ind.mttr_minutes)}
              detail={t('fiche.mttrDetail', { defaultValue: 'Temps moyen de réparation' })} couleur="#2563eb" />
            <Kpi icone="🔁" label={t('fiche.mtbf', { defaultValue: 'MTBF' })} valeur={ind.mtbf_heures !== null ? `${nombre(ind.mtbf_heures, 1)} h` : '-'}
              detail={t('fiche.mtbfDetail', { defaultValue: 'Temps moyen entre deux pannes' })} couleur="#7c3aed" />
            <Kpi icone="🚨" label={t('fiche.alertes30', { defaultValue: 'Alertes (30 jours)' })} valeur={nombre(ind.nb_alertes, 0)}
              detail={`${ind.nb_pannes} ${t('fiche.pannes', { defaultValue: 'panne(s) réparée(s)' })}`} couleur="#dc2626" />
          </div>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: '#374151', marginTop: '10px' }}>
            <span>🔧 {t('fiche.nbInterventions', { defaultValue: 'Interventions' })} : <strong>{ind.nb_interventions}</strong></span>
            <span>✔️ {t('fiche.terminees', { defaultValue: 'Terminées' })} : <strong>{ind.nb_terminees}</strong></span>
            <span>⏳ {t('fiche.ouvertes', { defaultValue: 'En attente / en cours' })} : <strong>{ind.nb_ouvertes}</strong></span>
            <span>🕒 {t('fiche.tempsTotal', { defaultValue: "Temps total d'intervention" })} : <strong>{formatDuree(ind.temps_intervention_minutes)}</strong></span>
          </div>
        </div>

        {/* 3. CAPTEURS */}
        <div className="bloc">
          <div style={titreSection}>📡 {t('fiche.capteurs', { defaultValue: 'État des capteurs' })}</div>
          {capteurs.length === 0 ? <div style={vide}>{t('fiche.aucunCapteur', { defaultValue: 'Aucun capteur' })}</div> : (
            <table style={table}>
              <thead><tr>
                <th style={thS}>{t('fiche.capteur', { defaultValue: 'Capteur' })}</th>
                <th style={thS}>{t('fiche.seuils', { defaultValue: 'Seuils (min → max)' })}</th>
                <th style={thS}>{t('fiche.derniereMesure', { defaultValue: 'Dernière mesure' })}</th>
                <th style={thS}>{t('fiche.etat', { defaultValue: 'État' })}</th>
              </tr></thead>
              <tbody>
                {capteurs.map((c, k) => (
                  <tr key={c.id}>
                    <td style={tdS(k)}><strong>#{c.id}</strong> {tr('types', c.type)}</td>
                    <td style={tdS(k)} dir="ltr">{c.seuil_min ?? '—'} → {c.seuil_max ?? '—'} {c.unite}</td>
                    <td style={tdS(k)}>
                      <strong dir="ltr" style={{ color: COULEURS_ETAT[c.etat] }}>{c.derniere_valeur !== null ? `${nombre(c.derniere_valeur)} ${c.unite}` : '-'}</strong>
                      <div style={{ fontSize: '10px', color: '#9ca3af' }}>{formatDate(c.derniere_date)}</div>
                    </td>
                    <td style={tdS(k)}><span style={pastille(COULEURS_ETAT[c.etat] || '#6b7280')}>{t('fiche.etats.' + c.etat, { defaultValue: c.etat })}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 4. ALERTES */}
        <div className="bloc">
          <div style={titreSection}>🚨 {t('fiche.alertes', { defaultValue: 'Alertes' })}</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>{t('fiche.repartition', { defaultValue: 'Répartition par sévérité (30 jours)' })}</div>
          {['critique', 'haute', 'moyenne', 'faible'].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '12px' }}>
              <span style={{ width: '80px' }}>{tr('severites', s)}</span>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: '4px', height: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${(parSev[s] || 0) / totalSev * 100}%`, minWidth: parSev[s] ? '3px' : 0, height: '100%', background: COULEURS_SEVERITE[s] }} />
              </div>
              <strong style={{ width: '45px', textAlign: 'end' }}>{parSev[s] || 0}</strong>
            </div>
          ))}
          <div style={{ fontSize: '12px', color: '#6b7280', margin: '12px 0 6px' }}>{t('fiche.dernieresAlertes', { defaultValue: '10 dernières alertes' })}</div>
          {alertes.length === 0 ? <div style={vide}>{t('fiche.aucuneAlerte', { defaultValue: 'Aucune alerte' })}</div> : (
            <table style={table}>
              <thead><tr>
                <th style={thS}>{t('fiche.date', { defaultValue: 'Date' })}</th>
                <th style={thS}>{t('document.alerteType', { defaultValue: "Type d'alerte" })}</th>
                <th style={thS}>{t('document.severite', { defaultValue: 'Sévérité' })}</th>
                <th style={thS}>{t('document.mesure', { defaultValue: 'Mesure constatée' })}</th>
                <th style={thS} data-html2canvas-ignore="true"></th>
              </tr></thead>
              <tbody>
                {alertes.map((a, k) => (
                  <tr key={a.id}>
                    <td style={{ ...tdS(k), whiteSpace: 'nowrap' }}>{formatDate(a.created_at)}</td>
                    <td style={tdS(k)}>{a.type}</td>
                    <td style={tdS(k)}><span style={pastille(COULEURS_SEVERITE[a.severite] || '#6b7280')}>{tr('severites', a.severite)}</span></td>
                    <td style={tdS(k)}>{a.message}</td>
                    <td style={tdS(k)} data-html2canvas-ignore="true">
                      <button onClick={() => setRapportId(a.id)} title={t('incident.titre', { defaultValue: "Rapport d'incident" })}
                        style={{ border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', background: '#fde7d6', color: '#c2410c', fontWeight: 'bold', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        📄 {t('incident.bouton', { defaultValue: 'Rapport' })}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. HISTORIQUE DES INTERVENTIONS */}
        <div className="bloc">
          <div style={titreSection}>🔧 {t('fiche.historique', { defaultValue: 'Historique des interventions' })}</div>
          {interventions.length === 0 ? <div style={vide}>{t('fiche.aucuneIntervention', { defaultValue: 'Aucune intervention' })}</div> : (
            <table style={table}>
              <thead><tr>
                <th style={thS}>N°</th>
                <th style={thS}>{t('fiche.date', { defaultValue: 'Date' })}</th>
                <th style={thS}>{t('document.typeIntervention', { defaultValue: 'Type' })}</th>
                <th style={thS}>{t('document.technicien')}</th>
                <th style={thS}>{t('document.statut')}</th>
                <th style={thS}>{t('document.duree', { defaultValue: 'Durée' })}</th>
              </tr></thead>
              <tbody>
                {interventions.map((i, k) => (
                  <tr key={i.id}>
                    <td style={tdS(k)} dir="ltr"><strong>{i.statut === 'terminee' ? 'FI' : 'OI'}-{String(i.id).padStart(4, '0')}</strong></td>
                    <td style={{ ...tdS(k), whiteSpace: 'nowrap' }}>{formatDate(i.date)}</td>
                    <td style={tdS(k)}>
                      {tr('interventions.types', i.type_intervention)}
                      <div style={{ marginTop: '3px' }}><span style={pastille(COULEURS_PRIORITE[i.priorite] || '#6b7280')}>{tr('interventions.priorites', i.priorite)}</span></div>
                    </td>
                    <td style={tdS(k)}>{i.technicien || t('common.notAssigned')}</td>
                    <td style={tdS(k)}><span style={pastille(COULEURS_STATUT[i.statut] || '#6b7280')}>{tr('statuts', i.statut)}</span></td>
                    <td style={tdS(k)} dir="ltr">{formatDuree(i.duree_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* VISA */}
        <div className="bloc" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '22px' }}>
          <div style={{ width: '45%', border: '1px dashed #9ca3af', borderRadius: '6px', height: '80px', padding: '8px', fontSize: '12px', color: '#6b7280' }}>
            {t('fiche.visa', { defaultValue: 'Visa du responsable maintenance' })}
          </div>
        </div>
      </div>
      {rapportId && <RapportIncident alerteId={rapportId} token={token} onClose={() => setRapportId(null)} />}
    </div>
  );
}

export default FicheEquipement;
