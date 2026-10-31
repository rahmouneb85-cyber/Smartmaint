// Ajoute les traductions du rapport d'incident dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_incident.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "incident": {
      "bouton": "Rapport",
      "titre": "Rapport d'incident",
      "origineIa": "Détection par intelligence artificielle (Isolation Forest)",
      "origineSeuil": "Dépassement de seuil configuré",
      "auDessus": "au-dessus du seuil max",
      "enDessous": "en dessous du seuil min",
      "conclusionSeuil": "La mesure de {{capteur}} est passée {{sens}} ({{seuil}} {{unite}}) pendant {{duree}} ({{nb}} mesures consécutives), avec une valeur extrême de {{extreme}} {{unite}}, soit un écart de {{ecart}} {{unite}} au seuil.",
      "dureeInconnue": "une durée indéterminée",
      "conclusionRetour": "Retour à la normale à {{heure}} ({{valeur}} {{unite}}).",
      "conclusionPasRetour": "Aucun retour à la normale n'a été observé dans la fenêtre analysée.",
      "conclusionIa": "La mesure ({{valeur}} {{unite}}) est restée dans les seuils configurés : l'anomalie a été détectée uniquement par l'IA, qui a repéré un comportement inhabituel par rapport au fonctionnement normal appris. Il s'agit d'un signal précoce à surveiller.",
      "pasDeMesures": "Aucune mesure du capteur n'est disponible autour de cet incident.",
      "conclusionAssociees": "{{n}} autre(s) alerte(s) ont été enregistrées sur le même équipement dans les 5 minutes autour de l'incident.",
      "dateIncident": "Date de l'incident",
      "alerte": "Alerte",
      "seuil": "Seuil",
      "sectionAlerte": "Description de l'incident",
      "origine": "Mode de détection",
      "sectionEquipement": "Équipement et capteur concernés",
      "sectionMesures": "Évolution des mesures",
      "legendeMesures": "Mesures du capteur",
      "legendeSeuils": "Seuils configurés",
      "legendeHors": "Mesure hors seuil",
      "legendeAlerte": "Instant de l'alerte",
      "sectionAnalyse": "Analyse de l'incident",
      "valeurDeclenchante": "Valeur déclenchante",
      "valeurExtreme": "Valeur extrême",
      "ecart": "Écart au seuil",
      "duree": "Durée de l'anomalie",
      "mesuresHors": "mesure(s) hors seuil",
      "moyenneAvant": "Moyenne avant l'incident",
      "fonctionnementNormal": "Fonctionnement normal",
      "debutAnomalie": "Début de l'anomalie",
      "finAnomalie": "Dernière mesure hors seuil",
      "retourNormale": "Retour à la normale",
      "nonObserve": "Non observé",
      "conclusion": "Conclusion",
      "sectionAssociees": "Alertes associées (± 5 min)",
      "sectionSuite": "Suite donnée à l'incident",
      "aucuneIntervention": "Aucune intervention n'a encore été créée pour cet incident."
    }
  },
  "en": {
    "incident": {
      "bouton": "Report",
      "titre": "Incident report",
      "origineIa": "Artificial intelligence detection (Isolation Forest)",
      "origineSeuil": "Configured threshold exceeded",
      "auDessus": "above the max threshold",
      "enDessous": "below the min threshold",
      "conclusionSeuil": "The {{capteur}} reading went {{sens}} ({{seuil}} {{unite}}) for {{duree}} ({{nb}} consecutive readings), with an extreme value of {{extreme}} {{unite}}, i.e. {{ecart}} {{unite}} beyond the threshold.",
      "dureeInconnue": "an undetermined time",
      "conclusionRetour": "Back to normal at {{heure}} ({{valeur}} {{unite}}).",
      "conclusionPasRetour": "No return to normal was observed in the analysed window.",
      "conclusionIa": "The reading ({{valeur}} {{unite}}) stayed within the configured thresholds: the anomaly was detected by the AI only, which spotted unusual behaviour compared with the learned normal operation. This is an early warning to monitor.",
      "pasDeMesures": "No sensor readings are available around this incident.",
      "conclusionAssociees": "{{n}} other alert(s) were recorded on the same equipment within 5 minutes of the incident.",
      "dateIncident": "Incident date",
      "alerte": "Alert",
      "seuil": "Threshold",
      "sectionAlerte": "Incident description",
      "origine": "Detection mode",
      "sectionEquipement": "Equipment and sensor involved",
      "sectionMesures": "Readings over time",
      "legendeMesures": "Sensor readings",
      "legendeSeuils": "Configured thresholds",
      "legendeHors": "Out-of-range reading",
      "legendeAlerte": "Alert time",
      "sectionAnalyse": "Incident analysis",
      "valeurDeclenchante": "Triggering value",
      "valeurExtreme": "Extreme value",
      "ecart": "Deviation from threshold",
      "duree": "Anomaly duration",
      "mesuresHors": "out-of-range reading(s)",
      "moyenneAvant": "Average before incident",
      "fonctionnementNormal": "Normal operation",
      "debutAnomalie": "Anomaly start",
      "finAnomalie": "Last out-of-range reading",
      "retourNormale": "Back to normal",
      "nonObserve": "Not observed",
      "conclusion": "Conclusion",
      "sectionAssociees": "Related alerts (± 5 min)",
      "sectionSuite": "Follow-up",
      "aucuneIntervention": "No intervention has been created for this incident yet."
    }
  },
  "ar": {
    "incident": {
      "bouton": "التقرير",
      "titre": "تقرير الحادث",
      "origineIa": "كشف بالذكاء الاصطناعي (Isolation Forest)",
      "origineSeuil": "تجاوز حد مُعدّ",
      "auDessus": "فوق الحد الأقصى",
      "enDessous": "تحت الحد الأدنى",
      "conclusionSeuil": "أصبح قياس {{capteur}} {{sens}} ({{seuil}} {{unite}}) لمدة {{duree}} ({{nb}} قياسات متتالية)، بقيمة قصوى بلغت {{extreme}} {{unite}}، أي بفارق {{ecart}} {{unite}} عن الحد.",
      "dureeInconnue": "مدة غير محددة",
      "conclusionRetour": "العودة إلى الوضع الطبيعي على الساعة {{heure}} ({{valeur}} {{unite}}).",
      "conclusionPasRetour": "لم تُلاحظ أي عودة إلى الوضع الطبيعي خلال الفترة المحللة.",
      "conclusionIa": "بقي القياس ({{valeur}} {{unite}}) ضمن الحدود المعدّة: تم كشف الشذوذ بواسطة الذكاء الاصطناعي فقط، الذي رصد سلوكًا غير معتاد مقارنة بالتشغيل الطبيعي المتعلَّم. إنها إشارة مبكرة يجب متابعتها.",
      "pasDeMesures": "لا توجد قياسات للمستشعر حول هذا الحادث.",
      "conclusionAssociees": "تم تسجيل {{n}} تنبيه(ات) أخرى على نفس المعدة خلال 5 دقائق حول الحادث.",
      "dateIncident": "تاريخ الحادث",
      "alerte": "تنبيه",
      "seuil": "حد",
      "sectionAlerte": "وصف الحادث",
      "origine": "طريقة الكشف",
      "sectionEquipement": "المعدة والمستشعر المعنيان",
      "sectionMesures": "تطور القياسات",
      "legendeMesures": "قياسات المستشعر",
      "legendeSeuils": "الحدود المعدّة",
      "legendeHors": "قياس خارج الحدود",
      "legendeAlerte": "لحظة التنبيه",
      "sectionAnalyse": "تحليل الحادث",
      "valeurDeclenchante": "القيمة المسببة",
      "valeurExtreme": "القيمة القصوى",
      "ecart": "الفارق عن الحد",
      "duree": "مدة الشذوذ",
      "mesuresHors": "قياس(ات) خارج الحدود",
      "moyenneAvant": "المتوسط قبل الحادث",
      "fonctionnementNormal": "تشغيل طبيعي",
      "debutAnomalie": "بداية الشذوذ",
      "finAnomalie": "آخر قياس خارج الحدود",
      "retourNormale": "العودة إلى الوضع الطبيعي",
      "nonObserve": "لم تُلاحظ",
      "conclusion": "الخلاصة",
      "sectionAssociees": "التنبيهات المرتبطة (± 5 دقائق)",
      "sectionSuite": "الإجراءات المتخذة",
      "aucuneIntervention": "لم يتم إنشاء أي تدخل لهذا الحادث بعد."
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_incident.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
