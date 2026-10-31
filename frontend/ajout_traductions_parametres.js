// Ajoute les traductions de la page Paramètres (personnalisation des boutons) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_parametres.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "parametres": {
      "titre": "Paramètres",
      "sousTitre": "Personnalisation des boutons",
      "chargement": "Chargement…",
      "erreurChargement": "Impossible de charger les réglages.",
      "intro": "Choisissez quels boutons flottants apparaissent, pour qui, où et dans quel ordre. Masquer un bouton ne supprime pas la fonctionnalité et ne change pas les droits d’accès.",
      "theme": "Mode sombre ou clair",
      "contextuel": "Bouton contextuel : {{nom}}",
      "invalide": "Réglage invalide.",
      "enregistre": "Réglages enregistrés : ils s’appliquent immédiatement.",
      "confirmReinit": "Rétablir les réglages d’origine de tous les boutons et des contacts de la messagerie ?",
      "reinitialise": "Réglages d’origine rétablis.",
      "bouton": "Bouton",
      "espace": "Espace",
      "visible": "Visible",
      "ordre": "Ordre",
      "couleur": "Couleur",
      "roles": "Rôles",
      "pages": "Pages",
      "appareils": "Appareils",
      "condition": "Condition",
      "e": {
        "prive": "Menu après connexion",
        "contextuel": "Boutons contextuels",
        "public": "Menu avant connexion"
      },
      "aide": {
        "prive": "Boutons du menu ouvert par le bouton principal +, une fois connecté.",
        "contextuel": "Boutons qui apparaissent seuls au-dessus du bouton principal lorsqu’un élément n’est pas lu.",
        "public": "Boutons de la page de connexion, visibles par tous les visiteurs."
      },
      "oui": "Oui",
      "non": "Non",
      "toutes": "Toutes",
      "ap": {
        "tous": "Tous les appareils",
        "bureau": "Ordinateur",
        "mobile": "Téléphone"
      },
      "c": {
        "toujours": "Toujours",
        "non_lus": "Seulement s’il y a des éléments non lus",
        "horaires": "Seulement pendant une plage horaire"
      },
      "titreExport": "SmartMaint · Personnalisation des boutons flottants",
      "enregistrer": "Enregistrer",
      "annuler": "Annuler les modifications",
      "reinitialiser": "Réglages d’origine",
      "exporter": "Exporter",
      "nonEnregistre": "Modifications non enregistrées",
      "derniereModif": "Dernière modification : {{date}} par {{nom}}",
      "monter": "Monter {{nom}}",
      "descendre": "Descendre {{nom}}",
      "couleurDe": "Couleur de {{nom}}",
      "details": "Détails",
      "masque": "Masqué",
      "retablir": "Rétablir",
      "contraste": "Couleur trop claire : l’icône blanche sera peu visible.",
      "de": "de",
      "a": "à",
      "contactsTitre": "Contacts autorisés dans la messagerie",
      "contactsAide": "Ce réglage est un droit vérifié par le serveur : il s’applique aussi à WhatsApp entre collègues et à la recherche. Les conversations existantes restent consultables.",
      "peutEcrire": "Peut écrire à →",
      "contactCase": "{{a}} peut écrire à {{b}}",
      "apercu": "Aperçu",
      "vuePar": "Vu par",
      "visiteur": "Visiteur (avant connexion)",
      "surPage": "Sur la page",
      "avecNonLus": "Avec des éléments non lus",
      "apercuEcran": "Écran simulé",
      "apercuAide": "Menu ouvert et boutons contextuels, tels qu’ils apparaîtront. Le bouton principal + est toujours affiché."
    },
    "menu": {
      "parametres": "Paramètres"
    }
  },
  "en": {
    "parametres": {
      "titre": "Settings",
      "sousTitre": "Button customisation",
      "chargement": "Loading…",
      "erreurChargement": "Unable to load the settings.",
      "intro": "Choose which floating buttons appear, for whom, where and in which order. Hiding a button does not remove the feature and does not change access rights.",
      "theme": "Dark or light mode",
      "contextuel": "Contextual button: {{nom}}",
      "invalide": "Invalid setting.",
      "enregistre": "Settings saved: they apply immediately.",
      "confirmReinit": "Restore the default settings for all buttons and messaging contacts?",
      "reinitialise": "Default settings restored.",
      "bouton": "Button",
      "espace": "Area",
      "visible": "Visible",
      "ordre": "Order",
      "couleur": "Colour",
      "roles": "Roles",
      "pages": "Pages",
      "appareils": "Devices",
      "condition": "Condition",
      "e": {
        "prive": "Menu after sign-in",
        "contextuel": "Contextual buttons",
        "public": "Menu before sign-in"
      },
      "aide": {
        "prive": "Buttons in the menu opened by the main + button, once signed in.",
        "contextuel": "Buttons that appear on their own above the main button when something is unread.",
        "public": "Buttons on the sign-in page, visible to every visitor."
      },
      "oui": "Yes",
      "non": "No",
      "toutes": "All",
      "ap": {
        "tous": "All devices",
        "bureau": "Computer",
        "mobile": "Phone"
      },
      "c": {
        "toujours": "Always",
        "non_lus": "Only when something is unread",
        "horaires": "Only during a time range"
      },
      "titreExport": "SmartMaint · Floating button customisation",
      "enregistrer": "Save",
      "annuler": "Discard changes",
      "reinitialiser": "Default settings",
      "exporter": "Export",
      "nonEnregistre": "Unsaved changes",
      "derniereModif": "Last change: {{date}} by {{nom}}",
      "monter": "Move {{nom}} up",
      "descendre": "Move {{nom}} down",
      "couleurDe": "Colour of {{nom}}",
      "details": "Details",
      "masque": "Hidden",
      "retablir": "Restore",
      "contraste": "Colour too light: the white icon will be hard to see.",
      "de": "from",
      "a": "to",
      "contactsTitre": "Allowed messaging contacts",
      "contactsAide": "This setting is a right checked by the server: it also applies to WhatsApp between colleagues and to search. Existing conversations remain readable.",
      "peutEcrire": "Can write to →",
      "contactCase": "{{a}} can write to {{b}}",
      "apercu": "Preview",
      "vuePar": "Seen by",
      "visiteur": "Visitor (before sign-in)",
      "surPage": "On page",
      "avecNonLus": "With unread items",
      "apercuEcran": "Simulated screen",
      "apercuAide": "Open menu and contextual buttons as they will appear. The main + button is always shown."
    },
    "menu": {
      "parametres": "Settings"
    }
  },
  "ar": {
    "parametres": {
      "titre": "الإعدادات",
      "sousTitre": "تخصيص الأزرار",
      "chargement": "جارٍ التحميل…",
      "erreurChargement": "تعذّر تحميل الإعدادات.",
      "intro": "اختر الأزرار العائمة التي تظهر، ولمن، وأين، وبأي ترتيب. إخفاء زر لا يحذف الوظيفة ولا يغيّر صلاحيات الوصول.",
      "theme": "الوضع الداكن أو الفاتح",
      "contextuel": "زر سياقي: {{nom}}",
      "invalide": "إعداد غير صالح.",
      "enregistre": "تم حفظ الإعدادات: تُطبّق فورًا.",
      "confirmReinit": "استعادة الإعدادات الأصلية لكل الأزرار وجهات اتصال المراسلة؟",
      "reinitialise": "تمت استعادة الإعدادات الأصلية.",
      "bouton": "الزر",
      "espace": "المجال",
      "visible": "ظاهر",
      "ordre": "الترتيب",
      "couleur": "اللون",
      "roles": "الأدوار",
      "pages": "الصفحات",
      "appareils": "الأجهزة",
      "condition": "الشرط",
      "e": {
        "prive": "القائمة بعد تسجيل الدخول",
        "contextuel": "الأزرار السياقية",
        "public": "القائمة قبل تسجيل الدخول"
      },
      "aide": {
        "prive": "أزرار القائمة التي يفتحها الزر الرئيسي + بعد تسجيل الدخول.",
        "contextuel": "أزرار تظهر وحدها فوق الزر الرئيسي عند وجود عنصر غير مقروء.",
        "public": "أزرار صفحة تسجيل الدخول، يراها كل الزوار."
      },
      "oui": "نعم",
      "non": "لا",
      "toutes": "الكل",
      "ap": {
        "tous": "كل الأجهزة",
        "bureau": "حاسوب",
        "mobile": "هاتف"
      },
      "c": {
        "toujours": "دائمًا",
        "non_lus": "فقط عند وجود عناصر غير مقروءة",
        "horaires": "فقط خلال فترة زمنية"
      },
      "titreExport": "SmartMaint · تخصيص الأزرار العائمة",
      "enregistrer": "حفظ",
      "annuler": "إلغاء التعديلات",
      "reinitialiser": "الإعدادات الأصلية",
      "exporter": "تصدير",
      "nonEnregistre": "تعديلات غير محفوظة",
      "derniereModif": "آخر تعديل: {{date}} بواسطة {{nom}}",
      "monter": "رفع {{nom}}",
      "descendre": "خفض {{nom}}",
      "couleurDe": "لون {{nom}}",
      "details": "التفاصيل",
      "masque": "مخفي",
      "retablir": "استعادة",
      "contraste": "لون فاتح جدًا: ستكون الأيقونة البيضاء صعبة الرؤية.",
      "de": "من",
      "a": "إلى",
      "contactsTitre": "جهات الاتصال المسموح بها في المراسلة",
      "contactsAide": "هذا الإعداد صلاحية يتحقق منها الخادم: يُطبّق أيضًا على واتساب بين الزملاء وعلى البحث. تبقى المحادثات الحالية قابلة للاطلاع.",
      "peutEcrire": "يمكنه مراسلة ←",
      "contactCase": "{{a}} يمكنه مراسلة {{b}}",
      "apercu": "معاينة",
      "vuePar": "كما يراه",
      "visiteur": "زائر (قبل تسجيل الدخول)",
      "surPage": "في صفحة",
      "avecNonLus": "مع عناصر غير مقروءة",
      "apercuEcran": "شاشة محاكاة",
      "apercuAide": "القائمة المفتوحة والأزرار السياقية كما ستظهر. الزر الرئيسي + ظاهر دائمًا."
    },
    "menu": {
      "parametres": "الإعدادات"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_parametres.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
