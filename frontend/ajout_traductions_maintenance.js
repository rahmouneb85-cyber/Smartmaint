// Ajoute les traductions du rapport de maintenance dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_maintenance.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "maintenance": {
      "bouton": "Rapport de maintenance",
      "titre": "Rapport de maintenance",
      "periode": "Période",
      "du": "Du",
      "au": "Au",
      "generer": "Générer",
      "synthese": "Synthèse de la période",
      "alertes": "Alertes",
      "interventions": "Interventions",
      "interventionsMin": "interventions",
      "equipements": "équipements",
      "ouvertes": "ouvertes",
      "correctives": "Correctives",
      "preventives": "Préventives",
      "dispoMoyenne": "Disponibilité moyenne",
      "nonTraitees": "Alertes graves sans intervention",
      "analyseAlertes": "Analyse des alertes",
      "parJour": "Alertes par jour",
      "detectionSeuil": "Dépassements de seuil",
      "detectionIa": "Détections IA",
      "seuils": "seuils",
      "parSeverite": "Par sévérité",
      "parCapteur": "Par type de capteur",
      "parEquipement": "Indicateurs par équipement",
      "pannes": "Pannes réparées",
      "listeInterventions": "Interventions de la période",
      "charge": "Charge de travail par technicien",
      "recommandations": "Recommandations"
    }
  },
  "en": {
    "maintenance": {
      "bouton": "Maintenance report",
      "titre": "Maintenance report",
      "periode": "Period",
      "du": "From",
      "au": "To",
      "generer": "Generate",
      "synthese": "Period summary",
      "alertes": "Alerts",
      "interventions": "Interventions",
      "interventionsMin": "interventions",
      "equipements": "equipment",
      "ouvertes": "open",
      "correctives": "Corrective",
      "preventives": "Preventive",
      "dispoMoyenne": "Average availability",
      "nonTraitees": "Serious alerts without intervention",
      "analyseAlertes": "Alert analysis",
      "parJour": "Alerts per day",
      "detectionSeuil": "Threshold breaches",
      "detectionIa": "AI detections",
      "seuils": "thresholds",
      "parSeverite": "By severity",
      "parCapteur": "By sensor type",
      "parEquipement": "Indicators by equipment",
      "pannes": "Repaired failures",
      "listeInterventions": "Interventions in the period",
      "charge": "Workload by technician",
      "recommandations": "Recommendations"
    }
  },
  "ar": {
    "maintenance": {
      "bouton": "تقرير الصيانة",
      "titre": "تقرير الصيانة",
      "periode": "الفترة",
      "du": "من",
      "au": "إلى",
      "generer": "إنشاء",
      "synthese": "ملخص الفترة",
      "alertes": "التنبيهات",
      "interventions": "التدخلات",
      "interventionsMin": "تدخلات",
      "equipements": "معدات",
      "ouvertes": "مفتوحة",
      "correctives": "تصحيحية",
      "preventives": "وقائية",
      "dispoMoyenne": "متوسط التوفر",
      "nonTraitees": "تنبيهات خطيرة بدون تدخل",
      "analyseAlertes": "تحليل التنبيهات",
      "parJour": "التنبيهات حسب اليوم",
      "detectionSeuil": "تجاوزات العتبة",
      "detectionIa": "اكتشافات الذكاء الاصطناعي",
      "seuils": "العتبات",
      "parSeverite": "حسب الخطورة",
      "parCapteur": "حسب نوع المستشعر",
      "parEquipement": "المؤشرات حسب المعدات",
      "pannes": "الأعطال المصلحة",
      "listeInterventions": "تدخلات الفترة",
      "charge": "عبء العمل لكل فني",
      "recommandations": "التوصيات"
    }
  }
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_maintenance.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
