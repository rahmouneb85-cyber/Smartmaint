// Ajoute les traductions de la fiche de suivi d'équipement dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_fiche.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  fr: { fiche: {
    bouton: 'Fiche', titre: "Fiche de suivi d'équipement", identification: "Identification de l'équipement",
    dateInstallation: "Date d'installation", jours: 'jours', indicateurs: 'Indicateurs de maintenance',
    disponibilite: 'Disponibilité', dispoDetail: 'Temps hors réparation', mttr: 'MTTR', mttrDetail: 'Temps moyen de réparation',
    mtbf: 'MTBF', mtbfDetail: 'Temps moyen entre deux pannes', alertes30: 'Alertes (30 jours)', pannes: 'panne(s) réparée(s)',
    nbInterventions: 'Interventions', terminees: 'Terminées', ouvertes: 'En attente / en cours', tempsTotal: "Temps total d'intervention",
    capteurs: 'État des capteurs', aucunCapteur: 'Aucun capteur', capteur: 'Capteur', seuils: 'Seuils (min → max)',
    derniereMesure: 'Dernière mesure', etat: 'État', etats: { normal: 'Normal', hors_seuil: 'Hors seuil', inconnu: 'Aucune mesure', inactif: 'Inactif' },
    alertes: 'Alertes', repartition: 'Répartition par sévérité (30 jours)', dernieresAlertes: '10 dernières alertes', aucuneAlerte: 'Aucune alerte',
    date: 'Date', historique: 'Historique des interventions', aucuneIntervention: 'Aucune intervention',
    capteursHorsSeuil: 'Capteurs hors seuil', visa: 'Visa du responsable maintenance',
  } },
  en: { fiche: {
    bouton: 'Sheet', titre: 'Equipment tracking sheet', identification: 'Equipment identification',
    dateInstallation: 'Installation date', jours: 'days', indicateurs: 'Maintenance indicators',
    disponibilite: 'Availability', dispoDetail: 'Time not under repair', mttr: 'MTTR', mttrDetail: 'Mean time to repair',
    mtbf: 'MTBF', mtbfDetail: 'Mean time between failures', alertes30: 'Alerts (30 days)', pannes: 'failure(s) repaired',
    nbInterventions: 'Interventions', terminees: 'Completed', ouvertes: 'Pending / in progress', tempsTotal: 'Total intervention time',
    capteurs: 'Sensor status', aucunCapteur: 'No sensor', capteur: 'Sensor', seuils: 'Thresholds (min → max)',
    derniereMesure: 'Last reading', etat: 'Status', etats: { normal: 'Normal', hors_seuil: 'Out of range', inconnu: 'No reading', inactif: 'Inactive' },
    alertes: 'Alerts', repartition: 'Breakdown by severity (30 days)', dernieresAlertes: 'Last 10 alerts', aucuneAlerte: 'No alert',
    date: 'Date', historique: 'Intervention history', aucuneIntervention: 'No intervention',
    capteursHorsSeuil: 'Sensors out of range', visa: 'Maintenance manager approval',
  } },
  ar: { fiche: {
    bouton: 'البطاقة', titre: 'بطاقة متابعة المعدة', identification: 'تعريف المعدة',
    dateInstallation: 'تاريخ التركيب', jours: 'يوم', indicateurs: 'مؤشرات الصيانة',
    disponibilite: 'نسبة التوفر', dispoDetail: 'الوقت خارج الإصلاح', mttr: 'MTTR', mttrDetail: 'متوسط وقت الإصلاح',
    mtbf: 'MTBF', mtbfDetail: 'متوسط الوقت بين عطلين', alertes30: 'التنبيهات (30 يومًا)', pannes: 'عطل تم إصلاحه',
    nbInterventions: 'التدخلات', terminees: 'المنجزة', ouvertes: 'قيد الانتظار / قيد التنفيذ', tempsTotal: 'إجمالي وقت التدخل',
    capteurs: 'حالة المستشعرات', aucunCapteur: 'لا يوجد مستشعر', capteur: 'المستشعر', seuils: 'الحدود (الأدنى – الأقصى)',
    derniereMesure: 'آخر قياس', etat: 'الحالة', etats: { normal: 'عادي', hors_seuil: 'خارج الحدود', inconnu: 'لا يوجد قياس', inactif: 'غير نشط' },
    alertes: 'التنبيهات', repartition: 'التوزيع حسب الخطورة (30 يومًا)', dernieresAlertes: 'آخر 10 تنبيهات', aucuneAlerte: 'لا توجد تنبيهات',
    date: 'التاريخ', historique: 'سجل التدخلات', aucuneIntervention: 'لا توجد تدخلات',
    capteursHorsSeuil: 'مستشعرات خارج الحدود', visa: 'تأشيرة مسؤول الصيانة',
  } },
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_fiche.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
