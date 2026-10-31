// Ajoute les nouvelles traductions (interventions, documents, sévérités) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  fr: {
    interventions: {
      typeLabel: "Type d'intervention", prioriteLabel: 'Priorité',
      types: { corrective: 'Corrective', preventive: 'Préventive' },
      priorites: { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' },
      alerteOrigine: "Alerte d'origine (facultatif)", aucuneAlerte: 'Aucune alerte liée',
      compteRendu: 'Compte rendu', rapportModifie: 'Compte rendu modifié', cloturer: "Clôturer l'intervention",
      diagnostic: 'Diagnostic (cause trouvée)', actions: 'Actions réalisées', pieces: 'Pièces remplacées',
      observationsLabel: 'Observations et recommandations',
      alerteIntrouvable: 'Alerte introuvable',
      rapportObligatoire: 'Compte rendu obligatoire : indiquez les actions réalisées',
    },
    document: {
      titreOrdre: "Ordre d'intervention", titreFiche: "Fiche d'intervention",
      typeIntervention: 'Type', priorite: 'Priorité', duree: 'Durée',
      sectionAlerte: "Alerte à l'origine de l'intervention", alerteNumero: "N° d'alerte", alerteType: "Type d'alerte",
      severite: 'Sévérité', mesure: 'Mesure constatée', alerteDate: 'Détectée le',
      sectionCompteRendu: "Compte rendu d'intervention", dateDebut: 'Début des travaux', dateFin: 'Fin des travaux',
      diagnostic: 'Diagnostic', actions: 'Actions réalisées', pieces: 'Pièces remplacées', aucunePiece: 'Aucune',
    },
    severites: { faible: 'Faible', moyenne: 'Moyenne', haute: 'Haute', critique: 'Critique' },
  },
  en: {
    interventions: {
      typeLabel: 'Intervention type', prioriteLabel: 'Priority',
      types: { corrective: 'Corrective', preventive: 'Preventive' },
      priorites: { basse: 'Low', normale: 'Normal', haute: 'High', urgente: 'Urgent' },
      alerteOrigine: 'Originating alert (optional)', aucuneAlerte: 'No linked alert',
      compteRendu: 'Work report', rapportModifie: 'Work report updated', cloturer: 'Close intervention',
      diagnostic: 'Diagnosis (root cause)', actions: 'Work performed', pieces: 'Replaced parts',
      observationsLabel: 'Observations and recommendations',
      alerteIntrouvable: 'Alert not found',
      rapportObligatoire: 'Work report required: describe the work performed',
    },
    document: {
      titreOrdre: 'Work order', titreFiche: 'Intervention report',
      typeIntervention: 'Type', priorite: 'Priority', duree: 'Duration',
      sectionAlerte: 'Alert that triggered the intervention', alerteNumero: 'Alert no.', alerteType: 'Alert type',
      severite: 'Severity', mesure: 'Measured value', alerteDate: 'Detected on',
      sectionCompteRendu: 'Work report', dateDebut: 'Work started', dateFin: 'Work finished',
      diagnostic: 'Diagnosis', actions: 'Work performed', pieces: 'Replaced parts', aucunePiece: 'None',
    },
    severites: { faible: 'Low', moyenne: 'Medium', haute: 'High', critique: 'Critical' },
  },
  ar: {
    interventions: {
      typeLabel: 'نوع التدخل', prioriteLabel: 'الأولوية',
      types: { corrective: 'تصحيحية', preventive: 'وقائية' },
      priorites: { basse: 'منخفضة', normale: 'عادية', haute: 'عالية', urgente: 'عاجلة' },
      alerteOrigine: 'التنبيه المسبب (اختياري)', aucuneAlerte: 'لا يوجد تنبيه مرتبط',
      compteRendu: 'تقرير التدخل', rapportModifie: 'تم تعديل التقرير', cloturer: 'إغلاق التدخل',
      diagnostic: 'التشخيص (السبب المكتشف)', actions: 'الأعمال المنجزة', pieces: 'القطع المستبدلة',
      observationsLabel: 'الملاحظات والتوصيات',
      alerteIntrouvable: 'التنبيه غير موجود',
      rapportObligatoire: 'التقرير إلزامي: يرجى ذكر الأعمال المنجزة',
    },
    document: {
      titreOrdre: 'أمر التدخل', titreFiche: 'بطاقة التدخل',
      typeIntervention: 'النوع', priorite: 'الأولوية', duree: 'المدة',
      sectionAlerte: 'التنبيه المسبب للتدخل', alerteNumero: 'رقم التنبيه', alerteType: 'نوع التنبيه',
      severite: 'الخطورة', mesure: 'القياس المسجل', alerteDate: 'تاريخ الرصد',
      sectionCompteRendu: 'تقرير التدخل', dateDebut: 'بداية الأشغال', dateFin: 'نهاية الأشغال',
      diagnostic: 'التشخيص', actions: 'الأعمال المنجزة', pieces: 'القطع المستبدلة', aucunePiece: 'لا شيء',
    },
    severites: { faible: 'منخفضة', moyenne: 'متوسطة', haute: 'عالية', critique: 'حرجة' },
  },
};

// Ajoute seulement ce qui manque, sans jamais écraser une traduction existante
function fusionner(cible, ajout, chemin, compteur) {
  for (const [cle, valeur] of Object.entries(ajout)) {
    if (valeur && typeof valeur === 'object') {
      if (typeof cible[cle] !== 'object' || cible[cle] === null) {
        if (cible[cle] === undefined) cible[cle] = {};
        else continue; // une valeur texte existe déjà sous ce nom : on n'y touche pas
      }
      fusionner(cible[cle], valeur, chemin + cle + '.', compteur);
    } else if (cible[cle] === undefined) {
      cible[cle] = valeur;
      compteur.n++;
    }
  }
}

for (const langue of ['fr', 'en', 'ar']) {
  const fichier = path.join(__dirname, 'src', 'i18n', `${langue}.json`);
  if (!fs.existsSync(fichier)) { console.log(`❌ Introuvable : ${fichier}`); continue; }
  const texte = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '');
  let donnees;
  try { donnees = JSON.parse(texte); }
  catch (e) { console.log(`❌ ${langue}.json n'est pas un JSON valide : ${e.message}`); continue; }
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
