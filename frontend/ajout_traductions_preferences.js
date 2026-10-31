// Ajoute les traductions des boutons ajoutés, des préférences personnelles et des nouvelles options de personnalisation.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_preferences.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "fab": {
      "mesBoutons": "Personnaliser mes boutons",
      "mesBoutonsAide": "Ces choix ne concernent que votre compte et ne changent pas vos droits.",
      "afficherPourMoi": "Boutons affichés pour moi",
      "mesActions": "Mes actions rapides (dans l’ordre)",
      "monterAction": "Monter {{nom}}",
      "descendreAction": "Descendre {{nom}}",
      "confort": "Confort",
      "animationsReduites": "Réduire les animations",
      "prefsOk": "Préférences enregistrées.",
      "enregistrerPrefs": "Enregistrer",
      "prefsDefaut": "Revenir aux réglages par défaut",
      "choisirActions": "Choisir mes actions rapides",
      "supportAlerte": "Alerte critique : contacter le support",
      "a": {
        "capteurs": "Consulter les capteurs",
        "tableau": "Tableau de bord",
        "support": "Signaler un problème",
        "securite": "Sécurité des comptes",
        "parametres": "Paramètres des boutons"
      }
    },
    "parametres": {
      "nouveauBouton": "Nouveau bouton",
      "icone": "Icône",
      "taille": "Taille",
      "animation": "Animation",
      "langues": "Langues",
      "t": {
        "petit": "Petit",
        "normal": "Normal",
        "grand": "Grand"
      },
      "an": {
        "aucune": "Aucune",
        "discrete": "Discrète",
        "marquee": "Marquée"
      },
      "libelleEn": "Libellé",
      "cible": "Ouvre",
      "ciblePage": "Une page de SmartMaint",
      "cibleLien": "Un lien externe (https)",
      "retirerBouton": "Retirer ce bouton",
      "ajouterBouton": "Ajouter un bouton",
      "c": {
        "alerte_critique": "Seulement lors d’une alerte critique",
        "non_lus_ou_alerte": "Éléments non lus ou alerte critique"
      }
    }
  },
  "en": {
    "fab": {
      "mesBoutons": "Customise my buttons",
      "mesBoutonsAide": "These choices only apply to your account and do not change your rights.",
      "afficherPourMoi": "Buttons shown for me",
      "mesActions": "My quick actions (in order)",
      "monterAction": "Move {{nom}} up",
      "descendreAction": "Move {{nom}} down",
      "confort": "Comfort",
      "animationsReduites": "Reduce animations",
      "prefsOk": "Preferences saved.",
      "enregistrerPrefs": "Save",
      "prefsDefaut": "Back to default settings",
      "choisirActions": "Choose my quick actions",
      "supportAlerte": "Critical alert: contact support",
      "a": {
        "capteurs": "View sensors",
        "tableau": "Dashboard",
        "support": "Report a problem",
        "securite": "Account security",
        "parametres": "Button settings"
      }
    },
    "parametres": {
      "nouveauBouton": "New button",
      "icone": "Icon",
      "taille": "Size",
      "animation": "Animation",
      "langues": "Languages",
      "t": {
        "petit": "Small",
        "normal": "Normal",
        "grand": "Large"
      },
      "an": {
        "aucune": "None",
        "discrete": "Subtle",
        "marquee": "Strong"
      },
      "libelleEn": "Label",
      "cible": "Opens",
      "ciblePage": "A SmartMaint page",
      "cibleLien": "An external link (https)",
      "retirerBouton": "Remove this button",
      "ajouterBouton": "Add a button",
      "c": {
        "alerte_critique": "Only during a critical alert",
        "non_lus_ou_alerte": "Unread items or critical alert"
      }
    }
  },
  "ar": {
    "fab": {
      "mesBoutons": "تخصيص أزراري",
      "mesBoutonsAide": "هذه الاختيارات تخص حسابك فقط ولا تغيّر صلاحياتك.",
      "afficherPourMoi": "الأزرار الظاهرة لي",
      "mesActions": "إجراءاتي السريعة (بالترتيب)",
      "monterAction": "رفع {{nom}}",
      "descendreAction": "خفض {{nom}}",
      "confort": "الراحة",
      "animationsReduites": "تقليل الحركات",
      "prefsOk": "تم حفظ التفضيلات.",
      "enregistrerPrefs": "حفظ",
      "prefsDefaut": "العودة إلى الإعدادات الافتراضية",
      "choisirActions": "اختيار إجراءاتي السريعة",
      "supportAlerte": "تنبيه حرج: تواصل مع الدعم",
      "a": {
        "capteurs": "عرض المستشعرات",
        "tableau": "لوحة التحكم",
        "support": "الإبلاغ عن مشكلة",
        "securite": "أمان الحسابات",
        "parametres": "إعدادات الأزرار"
      }
    },
    "parametres": {
      "nouveauBouton": "زر جديد",
      "icone": "الأيقونة",
      "taille": "الحجم",
      "animation": "الحركة",
      "langues": "اللغات",
      "t": {
        "petit": "صغير",
        "normal": "عادي",
        "grand": "كبير"
      },
      "an": {
        "aucune": "بدون",
        "discrete": "خفيفة",
        "marquee": "واضحة"
      },
      "libelleEn": "التسمية",
      "cible": "يفتح",
      "ciblePage": "صفحة من SmartMaint",
      "cibleLien": "رابط خارجي (https)",
      "retirerBouton": "حذف هذا الزر",
      "ajouterBouton": "إضافة زر",
      "c": {
        "alerte_critique": "فقط عند تنبيه حرج",
        "non_lus_ou_alerte": "عناصر غير مقروءة أو تنبيه حرج"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_preferences.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
