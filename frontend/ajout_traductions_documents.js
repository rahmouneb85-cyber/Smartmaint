// Ajoute les traductions de la page « Documents intelligents » dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_documents.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "documents": "Documents"
    },
    "documents": {
      "lu": "lu",
      "erreur": "Une erreur est survenue",
      "tropGros": "Fichier trop volumineux (15 Mo maximum)",
      "etape1": "Lecture du document…",
      "etape2": "Extraction des informations…",
      "etape3": "Contrôle des incohérences…",
      "erreurReseau": "Serveur injoignable",
      "creation": "Création de l'intervention…",
      "verification": "Vérification…",
      "st": {
        "a_valider": "À valider",
        "valide": "Validé",
        "indexe": "Indexé",
        "rejete": "Rejeté",
        "erreur": "Erreur"
      },
      "titre": "Documents intelligents",
      "intro": "Déposez un bon d'intervention (photo, scan, PDF, Word…) : SmartMaint le lit, contrôle les incohérences et prépare l'intervention.",
      "typeBon": "Bon d'intervention",
      "typeManuel": "Manuel ou fiche technique",
      "deposer": "Glissez un fichier ici ou cliquez pour le choisir",
      "images": "photos et scans",
      "photo": "Prendre une photo",
      "luPar": "Lu par",
      "controles": "Contrôles",
      "choisir": "— Choisir —",
      "aucun": "Aucun technicien",
      "corrective": "Corrective",
      "preventive": "Préventive",
      "reverifier": "Revérifier",
      "corrigerDabord": "Corrigez d'abord les erreurs",
      "valider": "Valider et créer l'intervention",
      "rejeter": "Rejeter",
      "corrigerPuis": "Corrigez les champs en rouge puis cliquez sur « Revérifier ».",
      "texteLu": "Texte lu dans le document",
      "manuelOk": "Le copilote peut maintenant répondre à partir de ce document. Essayez par exemple :",
      "exempleQuestion": "Tous les combien faut-il graisser les roulements de la pompe P01 ?",
      "historique": "Documents récents",
      "aucunDoc": "Aucun document pour le moment",
      "colFichier": "Fichier",
      "colType": "Type",
      "colDate": "Date",
      "colStatut": "Statut",
      "colResultat": "Résultat",
      "prio": {
        "basse": "Basse",
        "normale": "Normale",
        "haute": "Haute",
        "urgente": "Urgente"
      },
      "champ": {
        "equipement": "Équipement",
        "technicien": "Technicien",
        "type_intervention": "Type d'intervention",
        "priorite": "Priorité",
        "date_debut": "Début",
        "date_fin": "Fin",
        "duree_minutes": "Durée (minutes)",
        "alerte_id": "Alerte d'origine (n°)",
        "description": "Description de la demande",
        "diagnostic": "Diagnostic",
        "actions_realisees": "Actions réalisées",
        "pieces_remplacees": "Pièces remplacées",
        "observations": "Observations"
      }
    }
  },
  "en": {
    "menu": {
      "documents": "Documents"
    },
    "documents": {
      "lu": "read",
      "erreur": "An error occurred",
      "tropGros": "File too large (15 MB maximum)",
      "etape1": "Reading the document…",
      "etape2": "Extracting the information…",
      "etape3": "Checking for inconsistencies…",
      "erreurReseau": "Server unreachable",
      "creation": "Creating the intervention…",
      "verification": "Checking…",
      "st": {
        "a_valider": "To validate",
        "valide": "Validated",
        "indexe": "Indexed",
        "rejete": "Rejected",
        "erreur": "Error"
      },
      "titre": "Smart documents",
      "intro": "Drop a work order (photo, scan, PDF, Word…): SmartMaint reads it, checks for inconsistencies and prepares the intervention.",
      "typeBon": "Work order",
      "typeManuel": "Manual or data sheet",
      "deposer": "Drag a file here or click to choose it",
      "images": "photos and scans",
      "photo": "Take a photo",
      "luPar": "Read by",
      "controles": "Checks",
      "choisir": "— Choose —",
      "aucun": "No technician",
      "corrective": "Corrective",
      "preventive": "Preventive",
      "reverifier": "Check again",
      "corrigerDabord": "Fix the errors first",
      "valider": "Validate and create the intervention",
      "rejeter": "Reject",
      "corrigerPuis": "Fix the fields in red, then click « Check again ».",
      "texteLu": "Text read in the document",
      "manuelOk": "The copilot can now answer from this document. Try for example:",
      "exempleQuestion": "How often should the bearings of pump P01 be greased?",
      "historique": "Recent documents",
      "aucunDoc": "No documents yet",
      "colFichier": "File",
      "colType": "Type",
      "colDate": "Date",
      "colStatut": "Status",
      "colResultat": "Result",
      "prio": {
        "basse": "Low",
        "normale": "Normal",
        "haute": "High",
        "urgente": "Urgent"
      },
      "champ": {
        "equipement": "Equipment",
        "technicien": "Technician",
        "type_intervention": "Intervention type",
        "priorite": "Priority",
        "date_debut": "Start",
        "date_fin": "End",
        "duree_minutes": "Duration (minutes)",
        "alerte_id": "Source alert (no.)",
        "description": "Request description",
        "diagnostic": "Diagnosis",
        "actions_realisees": "Actions performed",
        "pieces_remplacees": "Replaced parts",
        "observations": "Observations"
      }
    }
  },
  "ar": {
    "menu": {
      "documents": "الوثائق"
    },
    "documents": {
      "lu": "المقروء",
      "erreur": "حدث خطأ",
      "tropGros": "الملف كبير جدًا (15 ميغابايت كحد أقصى)",
      "etape1": "قراءة الوثيقة…",
      "etape2": "استخراج المعلومات…",
      "etape3": "فحص التناقضات…",
      "erreurReseau": "تعذر الوصول إلى الخادم",
      "creation": "إنشاء التدخل…",
      "verification": "جارٍ التحقق…",
      "st": {
        "a_valider": "للمصادقة",
        "valide": "مصادق عليه",
        "indexe": "مفهرس",
        "rejete": "مرفوض",
        "erreur": "خطأ"
      },
      "titre": "الوثائق الذكية",
      "intro": "أودِع أمر تدخل (صورة، مسح ضوئي، PDF، Word…): يقرؤه SmartMaint ويفحص التناقضات ويحضّر التدخل.",
      "typeBon": "أمر تدخل",
      "typeManuel": "دليل أو بطاقة تقنية",
      "deposer": "اسحب ملفًا هنا أو انقر لاختياره",
      "images": "صور ومسوح ضوئية",
      "photo": "التقاط صورة",
      "luPar": "قرأه",
      "controles": "الفحوصات",
      "choisir": "— اختر —",
      "aucun": "بدون تقني",
      "corrective": "تصحيحي",
      "preventive": "وقائي",
      "reverifier": "إعادة الفحص",
      "corrigerDabord": "صحّح الأخطاء أولًا",
      "valider": "المصادقة وإنشاء التدخل",
      "rejeter": "رفض",
      "corrigerPuis": "صحّح الحقول باللون الأحمر ثم انقر على « إعادة الفحص ».",
      "texteLu": "النص المقروء في الوثيقة",
      "manuelOk": "يمكن للمساعد الآن الإجابة انطلاقًا من هذه الوثيقة. جرّب مثلًا:",
      "exempleQuestion": "كل كم ساعة يجب تشحيم محامل المضخة P01؟",
      "historique": "الوثائق الأخيرة",
      "aucunDoc": "لا توجد وثائق حاليًا",
      "colFichier": "الملف",
      "colType": "النوع",
      "colDate": "التاريخ",
      "colStatut": "الحالة",
      "colResultat": "النتيجة",
      "prio": {
        "basse": "منخفضة",
        "normale": "عادية",
        "haute": "مرتفعة",
        "urgente": "عاجلة"
      },
      "champ": {
        "equipement": "المعدات",
        "technicien": "التقني",
        "type_intervention": "نوع التدخل",
        "priorite": "الأولوية",
        "date_debut": "البداية",
        "date_fin": "النهاية",
        "duree_minutes": "المدة (بالدقائق)",
        "alerte_id": "رقم التنبيه الأصلي",
        "description": "وصف الطلب",
        "diagnostic": "التشخيص",
        "actions_realisees": "الأعمال المنجزة",
        "pieces_remplacees": "القطع المستبدلة",
        "observations": "ملاحظات"
      }
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_documents.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
