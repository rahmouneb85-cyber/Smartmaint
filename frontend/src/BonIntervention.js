import React, { useState, useRef, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { useTranslation } from 'react-i18next';
import SmartMaintLogo from './SmartMaintLogo';
import { LANGUES } from './i18n';

const API = 'http://localhost:8001/api/v1';
const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const COULEURS_PRIORITE = { basse: '#6b7280', normale: '#2563eb', haute: '#ea580c', urgente: '#dc2626' };
const COULEURS_SEVERITE = { faible: '#6b7280', moyenne: '#ca8a04', haute: '#ea580c', critique: '#dc2626' };

// Styles appliqués uniquement à l'impression : seul le document est imprimé
const STYLE_IMPRESSION = `
@media print {
  body * { visibility: hidden !important; }
  #bon-a-imprimer, #bon-a-imprimer * { visibility: visible !important; }
  #bon-a-imprimer { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; }
  @page { size: A4; margin: 12mm; }
}
`;

// Document généré à partir des données réelles de l'intervention :
//  - planifiée ou en cours → ORDRE D'INTERVENTION (OI-année-numéro)
//  - terminée              → FICHE D'INTERVENTION (FI-année-numéro), avec le compte rendu
function BonIntervention({ interventionId, token, onClose }) {
  const { i18n } = useTranslation();

  // Langue du document : par défaut celle de la plateforme, modifiable
  const [langueDoc, setLangueDoc] = useState(i18n.language || 'fr');
  const t = i18n.getFixedT(langueDoc);
  const tPlateforme = i18n.getFixedT(i18n.language);
  const dir = LANGUES.find(l => l.code === langueDoc)?.dir || 'ltr';
  const locale = LOCALES[langueDoc] || 'fr-FR';
  const documentRef = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [info, setInfo] = useState('');
  const [doc, setDoc] = useState(null);
  const [erreur, setErreur] = useState('');

  // Chargement de toutes les données du document en un seul appel
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/interventions/${interventionId}/document`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(String(res.status));
        setDoc(await res.json());
      } catch (e) {
        setErreur(tPlateforme('common.error', { code: e.message }));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement voulu au montage uniquement
  }, [interventionId, token]);

  const orange = '#FF6B00';
  const bouton = { border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit' };
  const fond = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, overflowY: 'auto', padding: '20px' };

  if (!doc) {
    return (
      <div style={fond} onClick={onClose}>
        <div style={{ maxWidth: '400px', margin: '20vh auto', background: 'white', color: '#333', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
          {erreur ? '❌ ' + erreur : '⏳ ' + tPlateforme('document.generation')}
        </div>
      </div>
    );
  }

  const { intervention, equipement, technicien, alerte, duree_minutes } = doc;
  const estFiche = intervention.statut === 'terminee';

  const formatDate = (d, avecHeure = true) => d
    ? new Date(d).toLocaleString(locale, avecHeure ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' })
    : '-';
  const formatDuree = (m) => {
    if (m === null || m === undefined) return '-';
    const h = Math.floor(m / 60), min = m % 60;
    return h > 0 ? `${h} h ${String(min).padStart(2, '0')} min` : `${min} min`;
  };

  // Numéro unique : OI (ordre) ou FI (fiche) - année - numéro de l'intervention sur 4 chiffres
  const annee = intervention.created_at ? new Date(intervention.created_at).getFullYear() : new Date().getFullYear();
  const numero = `${estFiche ? 'FI' : 'OI'}-${annee}-${String(intervention.id).padStart(4, '0')}`;
  const titre = estFiche
    ? t('document.titreFiche', { defaultValue: "Fiche d'intervention" })
    : t('document.titreOrdre', { defaultValue: "Ordre d'intervention" });

  const nomType = t('interventions.types.' + intervention.type_intervention, { defaultValue: intervention.type_intervention === 'preventive' ? 'Préventive' : 'Corrective' });
  const nomPriorite = t('interventions.priorites.' + intervention.priorite, { defaultValue: intervention.priorite });
  const nomStatut = t('statuts.' + intervention.statut, { defaultValue: intervention.statut });

  // Résumé texte, dans la langue du document (pour WhatsApp, Telegram, e-mail)
  const resume = [
    `${titre} ${numero}`,
    `${t('document.nom')} : ${equipement?.nom || '-'}`,
    `${t('document.typeIntervention', { defaultValue: 'Type' })} : ${nomType} · ${t('document.priorite', { defaultValue: 'Priorité' })} : ${nomPriorite}`,
    `${t('document.technicien')} : ${technicien?.nom || t('common.notAssigned')}`,
    `${t('document.datePrevue')} : ${formatDate(intervention.date_intervention)}`,
    `${t('document.statut')} : ${nomStatut}`,
    `${t('document.description')} : ${intervention.description || '-'}`,
    ...(estFiche ? [
      `${t('document.duree', { defaultValue: 'Durée' })} : ${formatDuree(duree_minutes)}`,
      `${t('document.actions', { defaultValue: 'Actions réalisées' })} : ${intervention.actions_realisees || '-'}`,
    ] : []),
    '',
    t('document.resumeFin'),
  ].join('\n');

  const optionsPdf = {
    margin: 8,
    filename: `${numero}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: '.bloc' },
  };

  const telechargerPdf = async () => {
    setEnCours(true); setInfo('');
    try { await html2pdf().set(optionsPdf).from(documentRef.current).save(); }
    finally { setEnCours(false); }
  };

  // Partage du fichier PDF via la fenêtre de partage du système (Mail, WhatsApp, Telegram...)
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

  const ligne = { display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '8px 0' };
  const libelle = { width: '40%', color: '#6b7280', fontSize: '13px' };
  const valeurStyle = { width: '60%', fontWeight: 'bold', fontSize: '13px', color: '#111827' };
  const titreSection = { background: orange, color: 'white', padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px', margin: '20px 0 8px' };
  const pastille = (c) => ({ background: c + '1f', color: c, border: `1px solid ${c}`, borderRadius: '10px', padding: '2px 10px', fontSize: '12px', fontWeight: 'bold' });
  const cadreTexte = { border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', minHeight: '40px', whiteSpace: 'pre-wrap', background: '#fafafa' };

  const Ligne = ({ l, v }) => (
    <div style={ligne}><span style={libelle}>{l}</span><span style={valeurStyle}>{v || '-'}</span></div>
  );
  const Texte = ({ l, v, vide = '-' }) => (
    <div className="bloc" style={{ padding: '8px 0' }}>
      <div style={{ ...libelle, width: '100%', marginBottom: '6px' }}>{l}</div>
      <div style={cadreTexte}>{v || vide}</div>
    </div>
  );

  return (
    <div style={fond}>
      <style>{STYLE_IMPRESSION}</style>

      {/* BARRE D'OUTILS (non imprimée), dans la langue de la plateforme */}
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
          <button onClick={telechargerPdf} disabled={enCours} style={{ ...bouton, background: '#16a34a', color: 'white', opacity: enCours ? 0.6 : 1 }}>
            ⬇️ {tPlateforme('document.telecharger')}
          </button>
          <button onClick={partagerPdf} disabled={enCours} style={{ ...bouton, background: '#2563eb', color: 'white', opacity: enCours ? 0.6 : 1 }}>
            📤 {tPlateforme('document.partager')}
          </button>
          <button onClick={() => window.print()} style={{ ...bouton, background: orange, color: 'white' }}>
            🖨️ {tPlateforme('document.imprimer')}
          </button>
          <button onClick={onClose} style={{ ...bouton, background: 'white', color: '#333' }}>
            ✕ {tPlateforme('document.fermer')}
          </button>
        </div>
      </div>

      {/* ENVOI RAPIDE : résumé via WhatsApp, Telegram ou e-mail */}
      <div style={{ maxWidth: '794px', margin: '0 auto 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: 'white', fontSize: '13px' }}>
        {tPlateforme('document.envoyerVia')} :
        {liens.map(l => (
          <a key={l.nom} href={l.url} target="_blank" rel="noreferrer"
            style={{ background: 'white', color: '#333', borderRadius: '8px', padding: '6px 12px', textDecoration: 'none', fontWeight: 'bold' }}>
            {l.icone} {l.nom}
          </a>
        ))}
        {enCours && <span>⏳ {tPlateforme('document.generation')}</span>}
      </div>
      {info && (
        <div style={{ maxWidth: '794px', margin: '0 auto 12px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
          ℹ️ {info}
        </div>
      )}

      {/* DOCUMENT A4 (imprimé), dans la langue du document */}
      <div id="bon-a-imprimer" ref={documentRef} dir={dir}
        style={{ maxWidth: '794px', margin: '0 auto', background: 'white', color: '#111827', padding: '36px 40px', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', borderRadius: '4px', letterSpacing: dir === 'rtl' ? 'normal' : '0.01px' }}>

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
            <div style={{ fontSize: '13px', marginTop: '6px' }}>
              {t('document.numero')} : <strong dir="ltr">{numero}</strong>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
              {t('document.dateEmission')} : {formatDate(new Date(), false)}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span style={pastille(intervention.type_intervention === 'preventive' ? '#0d9488' : '#7c3aed')}>{nomType}</span>
              <span style={pastille(COULEURS_PRIORITE[intervention.priorite] || '#6b7280')}>{nomPriorite}</span>
            </div>
          </div>
        </div>

        {/* ÉQUIPEMENT */}
        <div className="bloc">
          <div style={titreSection}>🏭 {t('document.sectionEquipement')}</div>
          <Ligne l={t('document.nom')} v={equipement?.nom} />
          <Ligne l={t('document.type')} v={equipement?.type} />
          <Ligne l={t('document.localisation')} v={equipement?.localisation} />
          <Ligne l={t('document.statutEquipement')} v={equipement ? t('statuts.' + equipement.statut, { defaultValue: equipement.statut }) : '-'} />
        </div>

        {/* ALERTE D'ORIGINE (si l'intervention a été déclenchée par une alerte) */}
        {alerte && (
          <div className="bloc">
            <div style={{ ...titreSection, background: COULEURS_SEVERITE[alerte.severite] || '#dc2626' }}>🚨 {t('document.sectionAlerte', { defaultValue: "Alerte à l'origine de l'intervention" })}</div>
            <Ligne l={t('document.alerteNumero', { defaultValue: "N° d'alerte" })} v={`#${alerte.id}`} />
            <Ligne l={t('document.alerteType', { defaultValue: "Type d'alerte" })} v={alerte.type} />
            <Ligne l={t('document.severite', { defaultValue: 'Sévérité' })} v={t('severites.' + alerte.severite, { defaultValue: alerte.severite })} />
            <Ligne l={t('document.mesure', { defaultValue: 'Mesure constatée' })} v={alerte.message} />
            <Ligne l={t('document.alerteDate', { defaultValue: 'Détectée le' })} v={formatDate(alerte.created_at)} />
          </div>
        )}

        {/* INTERVENTION */}
        <div className="bloc">
          <div style={titreSection}>🔧 {t('document.sectionIntervention')}</div>
          <Ligne l={t('document.typeIntervention', { defaultValue: 'Type' })} v={nomType} />
          <Ligne l={t('document.priorite', { defaultValue: 'Priorité' })} v={nomPriorite} />
          <Ligne l={t('document.technicien')} v={technicien?.nom || t('common.notAssigned')} />
          <Ligne l={t('document.datePrevue')} v={formatDate(intervention.date_intervention)} />
          <Ligne l={t('document.statut')} v={nomStatut} />
          <Ligne l={t('document.creeLe')} v={formatDate(intervention.created_at)} />
          <Texte l={t('document.description')} v={intervention.description} />
        </div>

        {/* COMPTE RENDU (fiche d'intervention uniquement) */}
        {estFiche ? (
          <div className="bloc">
            <div style={{ ...titreSection, background: '#16a34a' }}>📝 {t('document.sectionCompteRendu', { defaultValue: "Compte rendu d'intervention" })}</div>
            <Ligne l={t('document.dateDebut', { defaultValue: 'Début des travaux' })} v={formatDate(intervention.date_debut)} />
            <Ligne l={t('document.dateFin', { defaultValue: 'Fin des travaux' })} v={formatDate(intervention.date_fin)} />
            <Ligne l={t('document.duree', { defaultValue: 'Durée' })} v={formatDuree(duree_minutes)} />
            <Texte l={t('document.diagnostic', { defaultValue: 'Diagnostic' })} v={intervention.diagnostic} />
            <Texte l={t('document.actions', { defaultValue: 'Actions réalisées' })} v={intervention.actions_realisees} />
            <Texte l={t('document.pieces', { defaultValue: 'Pièces remplacées' })} v={intervention.pieces_remplacees} vide={t('document.aucunePiece', { defaultValue: 'Aucune' })} />
            <Texte l={t('document.observations')} v={intervention.observations} />
          </div>
        ) : (
          /* Ordre d'intervention : zone à remplir à la main par le technicien sur place */
          <div className="bloc">
            <div style={{ ...libelle, width: '100%', margin: '14px 0 6px' }}>{t('document.observations')}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', height: '80px' }} />
          </div>
        )}

        {/* SIGNATURES */}
        <div className="bloc">
          <div style={titreSection}>✍️ {t('document.sectionSignatures')}</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['signatureTechnicien', 'signatureResponsable'].map(s => (
              <div key={s} style={{ flex: 1, border: '1px dashed #9ca3af', borderRadius: '6px', height: '90px', padding: '8px', fontSize: '12px', color: '#6b7280' }}>
                {t('document.' + s)}
              </div>
            ))}
          </div>
        </div>

        {/* PIED DE PAGE */}
        
      </div>
    </div>
  );
}

export default BonIntervention;
