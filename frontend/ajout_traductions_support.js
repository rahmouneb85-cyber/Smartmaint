// Ajoute les traductions du support et de la recherche intelligente dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_support.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "fab": {
      "recherche": "Recherche",
      "support": "Support",
      "signaler": "Signaler un problème",
      "affichage": "Affichage",
      "mesDemandes": "Mes demandes",
      "toutesDemandes": "Toutes les demandes",
      "aucuneDemande": "Aucune demande pour le moment.",
      "pageConcernee": "page",
      "captureJointe": "Capture d’écran jointe",
      "statut": "Statut",
      "fermerDemande": "Mon problème est réglé, fermer la demande",
      "votreReponse": "Votre réponse",
      "formatImage": "Image PNG, JPEG ou WebP uniquement.",
      "imageLourde": "Image trop volumineuse (5 Mo maximum).",
      "captureImpossible": "Capture impossible : joignez une image à la place.",
      "invalideSupport": "Vérifiez le sujet (3 caractères) et la description (5 caractères).",
      "categorie": "Type de demande",
      "sujet": "Sujet",
      "description": "Que s’est-il passé ? Qu’attendiez-vous ?",
      "descriptionCourte": "Description",
      "apercu": "Aperçu de la capture",
      "retirer": "Retirer la capture",
      "capturer": "Capturer l’écran",
      "captureEnCours": "Capture…",
      "joindre": "Joindre une image",
      "aideCapture": "Vous pouvez aussi coller une image (Ctrl+V). Vérifiez que la capture ne montre aucune information confidentielle.",
      "envoiEnCours": "Envoi…",
      "supportReponses": "{{n}} réponse(s) du support",
      "supportATraiter": "{{n}} demande(s) de support à traiter",
      "rechercheAide": "Équipement, intervention, document, collègue, page…",
      "compris": "Filtres reconnus",
      "recentes": "Recherches récentes",
      "exemples": "Exemples : « pompe atelier », « #12 », « urgente en cours », « en panne ».",
      "aucunResultat": "Aucun résultat accessible pour cette recherche.",
      "resultats": "Résultats",
      "nbResultats": "{{n}} résultat(s)",
      "cat": {
        "probleme": "Problème",
        "question": "Question",
        "amelioration": "Suggestion d’amélioration"
      },
      "st": {
        "ouverte": "Ouverte",
        "en_cours": "En cours",
        "resolue": "Résolue",
        "fermee": "Fermée",
        "actif": "Actif",
        "inactif": "Inactif",
        "maintenance": "Maintenance",
        "panne": "En panne",
        "planifiee": "Planifiée",
        "terminee": "Terminée",
        "urgente": "Urgente",
        "haute": "Haute",
        "a_valider": "À valider",
        "valide": "Validé",
        "rejete": "Rejeté",
        "indexe": "Indexé",
        "erreur": "Erreur",
        "admin": "Administrateur",
        "superviseur": "Superviseur",
        "technicien": "Technicien"
      },
      "g": {
        "pages": "Pages",
        "equipements": "Équipements",
        "interventions": "Interventions",
        "documents": "Documents",
        "support": "Demandes de support",
        "workflows": "Workflows",
        "utilisateurs": "Collègues"
      },
      "n": {
        "support_nouvelle": "Nouvelle demande de support : {{sujet}}",
        "support_reponse": "Nouvelle réponse : {{sujet}}",
        "support_statut": "Demande « {{sujet}} » : {{statut}}"
      }
    }
  },
  "en": {
    "fab": {
      "recherche": "Search",
      "support": "Support",
      "signaler": "Report a problem",
      "affichage": "View",
      "mesDemandes": "My requests",
      "toutesDemandes": "All requests",
      "aucuneDemande": "No requests yet.",
      "pageConcernee": "page",
      "captureJointe": "Attached screenshot",
      "statut": "Status",
      "fermerDemande": "My issue is solved, close the request",
      "votreReponse": "Your reply",
      "formatImage": "PNG, JPEG or WebP images only.",
      "imageLourde": "Image too large (5 MB maximum).",
      "captureImpossible": "Screenshot failed: attach an image instead.",
      "invalideSupport": "Check the subject (3 characters) and the description (5 characters).",
      "categorie": "Request type",
      "sujet": "Subject",
      "description": "What happened? What did you expect?",
      "descriptionCourte": "Description",
      "apercu": "Screenshot preview",
      "retirer": "Remove screenshot",
      "capturer": "Capture the screen",
      "captureEnCours": "Capturing…",
      "joindre": "Attach an image",
      "aideCapture": "You can also paste an image (Ctrl+V). Make sure the screenshot shows no confidential information.",
      "envoiEnCours": "Sending…",
      "supportReponses": "{{n}} support reply(ies)",
      "supportATraiter": "{{n}} support request(s) to handle",
      "rechercheAide": "Equipment, work order, document, colleague, page…",
      "compris": "Recognised filters",
      "recentes": "Recent searches",
      "exemples": "Examples: “pump workshop”, “#12”, “urgent in progress”, “breakdown”.",
      "aucunResultat": "No accessible results for this search.",
      "resultats": "Results",
      "nbResultats": "{{n}} result(s)",
      "cat": {
        "probleme": "Problem",
        "question": "Question",
        "amelioration": "Improvement idea"
      },
      "st": {
        "ouverte": "Open",
        "en_cours": "In progress",
        "resolue": "Resolved",
        "fermee": "Closed",
        "actif": "Active",
        "inactif": "Inactive",
        "maintenance": "Maintenance",
        "panne": "Broken down",
        "planifiee": "Planned",
        "terminee": "Completed",
        "urgente": "Urgent",
        "haute": "High",
        "a_valider": "To validate",
        "valide": "Validated",
        "rejete": "Rejected",
        "indexe": "Indexed",
        "erreur": "Error",
        "admin": "Administrator",
        "superviseur": "Supervisor",
        "technicien": "Technician"
      },
      "g": {
        "pages": "Pages",
        "equipements": "Equipment",
        "interventions": "Work orders",
        "documents": "Documents",
        "support": "Support requests",
        "workflows": "Workflows",
        "utilisateurs": "Colleagues"
      },
      "n": {
        "support_nouvelle": "New support request: {{sujet}}",
        "support_reponse": "New reply: {{sujet}}",
        "support_statut": "Request “{{sujet}}”: {{statut}}"
      }
    }
  },
  "ar": {
    "fab": {
      "recherche": "البحث",
      "support": "الدعم",
      "signaler": "الإبلاغ عن مشكلة",
      "affichage": "العرض",
      "mesDemandes": "طلباتي",
      "toutesDemandes": "كل الطلبات",
      "aucuneDemande": "لا توجد طلبات حاليًا.",
      "pageConcernee": "الصفحة",
      "captureJointe": "لقطة الشاشة المرفقة",
      "statut": "الحالة",
      "fermerDemande": "تم حل مشكلتي، إغلاق الطلب",
      "votreReponse": "ردّك",
      "formatImage": "صور PNG أو JPEG أو WebP فقط.",
      "imageLourde": "الصورة كبيرة جدًا (5 ميغابايت كحد أقصى).",
      "captureImpossible": "تعذّر التقاط الشاشة: أرفق صورة بدلًا من ذلك.",
      "invalideSupport": "تحقق من الموضوع (3 أحرف) والوصف (5 أحرف).",
      "categorie": "نوع الطلب",
      "sujet": "الموضوع",
      "description": "ماذا حدث؟ وماذا كنت تتوقع؟",
      "descriptionCourte": "الوصف",
      "apercu": "معاينة اللقطة",
      "retirer": "إزالة اللقطة",
      "capturer": "التقاط الشاشة",
      "captureEnCours": "جارٍ الالتقاط…",
      "joindre": "إرفاق صورة",
      "aideCapture": "يمكنك أيضًا لصق صورة (Ctrl+V). تأكد من أن اللقطة لا تحتوي على معلومات سرية.",
      "envoiEnCours": "جارٍ الإرسال…",
      "supportReponses": "{{n}} رد من الدعم",
      "supportATraiter": "{{n}} طلب دعم للمعالجة",
      "rechercheAide": "معدّة، تدخّل، وثيقة، زميل، صفحة…",
      "compris": "المرشحات المفهومة",
      "recentes": "عمليات البحث الأخيرة",
      "exemples": "أمثلة: « pompe atelier »، « #12 »، « urgente en cours »، « en panne ».",
      "aucunResultat": "لا توجد نتائج متاحة لهذا البحث.",
      "resultats": "النتائج",
      "nbResultats": "{{n}} نتيجة",
      "cat": {
        "probleme": "مشكلة",
        "question": "سؤال",
        "amelioration": "اقتراح تحسين"
      },
      "st": {
        "ouverte": "مفتوح",
        "en_cours": "قيد المعالجة",
        "resolue": "تم الحل",
        "fermee": "مغلق",
        "actif": "نشط",
        "inactif": "غير نشط",
        "maintenance": "صيانة",
        "panne": "معطّل",
        "planifiee": "مخطط",
        "terminee": "منتهٍ",
        "urgente": "عاجل",
        "haute": "مرتفع",
        "a_valider": "للتحقق",
        "valide": "مُعتمد",
        "rejete": "مرفوض",
        "indexe": "مفهرس",
        "erreur": "خطأ",
        "admin": "مسؤول",
        "superviseur": "مشرف",
        "technicien": "تقني"
      },
      "g": {
        "pages": "الصفحات",
        "equipements": "المعدات",
        "interventions": "التدخلات",
        "documents": "الوثائق",
        "support": "طلبات الدعم",
        "workflows": "سير العمل",
        "utilisateurs": "الزملاء"
      },
      "n": {
        "support_nouvelle": "طلب دعم جديد: {{sujet}}",
        "support_reponse": "رد جديد: {{sujet}}",
        "support_statut": "الطلب « {{sujet}} »: {{statut}}"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_support.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
