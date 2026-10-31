// Ajoute les traductions de la console de sécurité dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_securite.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "securite": "Sécurité"
    },
    "login": {
      "appareilBloque": "Cet appareil a été bloqué par l'administrateur."
    },
    "securite": {
      "titre": "Console de sécurité",
      "onglet": {
        "resume": "Résumé",
        "utilisateurs": "Utilisateurs",
        "sessions": "Sessions actives",
        "appareils": "Appareils",
        "journal": "Journal"
      },
      "r": {
        "utilisateurs_actifs": "Comptes actifs",
        "sessions_actives": "Sessions actives",
        "appareils": "Appareils connus",
        "connexions_24h": "Connexions (24 h)",
        "echecs_24h": "Échecs (24 h)",
        "blocages_24h": "Blocages (24 h)",
        "inhabituelles_24h": "Connexions inhabituelles (24 h)"
      },
      "bloques": "bloqués",
      "nouveauCompte": "Nouveau compte",
      "nom": "Nom",
      "motDePasse": "Mot de passe",
      "creer": "Créer",
      "annuler": "Annuler",
      "regleMdp": "8 caractères minimum, avec une majuscule, une minuscule, un chiffre et un caractère spécial.",
      "compteCree": "Compte créé",
      "fait": "Action effectuée",
      "role": {
        "technicien": "Technicien",
        "superviseur": "Superviseur",
        "admin": "Administrateur"
      },
      "roleCol": "Rôle",
      "statut": "Statut",
      "sessions": "Sessions",
      "actions": "Actions",
      "vous": "vous",
      "actif": "Actif",
      "desactive": "Désactivé",
      "desactiver": "Désactiver",
      "activer": "Activer",
      "deconnecter": "Déconnecter partout",
      "confRole": "Changer le rôle ? Les sessions de cet utilisateur seront fermées.",
      "confDesactiver": "Désactiver ce compte ? Toutes ses sessions seront fermées.",
      "confDeco": "Déconnecter cet utilisateur de tous ses appareils ?",
      "utilisateur": "Utilisateur",
      "appareil": "Appareil",
      "localisation": "Localisation",
      "debut": "Début",
      "activite": "Dernière activité",
      "fermer": "Fermer",
      "confSession": "Fermer cette session ? L'utilisateur sera déconnecté de cet appareil.",
      "derniereIp": "Dernière IP",
      "premiere": "Première connexion",
      "derniere": "Dernière connexion",
      "sessionsActives": "session(s) active(s)",
      "bloque": "Bloqué",
      "autorise": "Autorisé",
      "reactiver": "Réactiver",
      "bloquer": "Bloquer",
      "confBloquer": "Bloquer cet appareil ? Ses sessions seront fermées et il ne pourra plus se connecter.",
      "confSupprimer": "Supprimer cet appareil de la liste ?",
      "tousEvenements": "Tous les événements",
      "date": "Date",
      "evenement": "Événement",
      "details": "Détails",
      "aucun": "Aucun élément",
      "ev": {
        "connexion_reussie": "Connexion réussie",
        "deconnexion": "Déconnexion",
        "echec_connexion": "Échec de connexion",
        "connexion_bloquee": "Connexion bloquée",
        "connexion_inhabituelle": "Connexion inhabituelle",
        "reutilisation_jeton": "Jeton réutilisé",
        "compte_desactive": "Compte désactivé",
        "appareil_bloque": "Appareil bloqué refusé",
        "appareil_bloque_admin": "Appareil bloqué",
        "nouvel_appareil": "Nouvel appareil",
        "creation_compte": "Création de compte",
        "modification_compte": "Modification de compte",
        "deconnexion_distance": "Déconnexion à distance",
        "session_fermee": "Session fermée",
        "sessions_fermees": "Sessions fermées",
        "appareil_reactive": "Appareil réactivé",
        "appareil_supprime": "Appareil supprimé"
      }
    }
  },
  "en": {
    "menu": {
      "securite": "Security"
    },
    "login": {
      "appareilBloque": "This device has been blocked by the administrator."
    },
    "securite": {
      "titre": "Security console",
      "onglet": {
        "resume": "Overview",
        "utilisateurs": "Users",
        "sessions": "Active sessions",
        "appareils": "Devices",
        "journal": "Log"
      },
      "r": {
        "utilisateurs_actifs": "Active accounts",
        "sessions_actives": "Active sessions",
        "appareils": "Known devices",
        "connexions_24h": "Sign-ins (24 h)",
        "echecs_24h": "Failures (24 h)",
        "blocages_24h": "Lockouts (24 h)",
        "inhabituelles_24h": "Unusual sign-ins (24 h)"
      },
      "bloques": "blocked",
      "nouveauCompte": "New account",
      "nom": "Name",
      "motDePasse": "Password",
      "creer": "Create",
      "annuler": "Cancel",
      "regleMdp": "At least 8 characters, with an uppercase letter, a lowercase letter, a digit and a special character.",
      "compteCree": "Account created",
      "fait": "Done",
      "role": {
        "technicien": "Technician",
        "superviseur": "Supervisor",
        "admin": "Administrator"
      },
      "roleCol": "Role",
      "statut": "Status",
      "sessions": "Sessions",
      "actions": "Actions",
      "vous": "you",
      "actif": "Active",
      "desactive": "Disabled",
      "desactiver": "Disable",
      "activer": "Enable",
      "deconnecter": "Sign out everywhere",
      "confRole": "Change the role? This user's sessions will be closed.",
      "confDesactiver": "Disable this account? All its sessions will be closed.",
      "confDeco": "Sign this user out of all devices?",
      "utilisateur": "User",
      "appareil": "Device",
      "localisation": "Location",
      "debut": "Started",
      "activite": "Last activity",
      "fermer": "Close",
      "confSession": "Close this session? The user will be signed out of this device.",
      "derniereIp": "Last IP",
      "premiere": "First sign-in",
      "derniere": "Last sign-in",
      "sessionsActives": "active session(s)",
      "bloque": "Blocked",
      "autorise": "Allowed",
      "reactiver": "Re-enable",
      "bloquer": "Block",
      "confBloquer": "Block this device? Its sessions will be closed and it will no longer be able to sign in.",
      "confSupprimer": "Remove this device from the list?",
      "tousEvenements": "All events",
      "date": "Date",
      "evenement": "Event",
      "details": "Details",
      "aucun": "Nothing to show",
      "ev": {
        "connexion_reussie": "Successful sign-in",
        "deconnexion": "Sign-out",
        "echec_connexion": "Failed sign-in",
        "connexion_bloquee": "Sign-in locked",
        "connexion_inhabituelle": "Unusual sign-in",
        "reutilisation_jeton": "Token reused",
        "compte_desactive": "Disabled account",
        "appareil_bloque": "Blocked device refused",
        "appareil_bloque_admin": "Device blocked",
        "nouvel_appareil": "New device",
        "creation_compte": "Account created",
        "modification_compte": "Account changed",
        "deconnexion_distance": "Remote sign-out",
        "session_fermee": "Session closed",
        "sessions_fermees": "Sessions closed",
        "appareil_reactive": "Device re-enabled",
        "appareil_supprime": "Device removed"
      }
    }
  },
  "ar": {
    "menu": {
      "securite": "الأمان"
    },
    "login": {
      "appareilBloque": "تم حظر هذا الجهاز من طرف المسؤول."
    },
    "securite": {
      "titre": "لوحة الأمان",
      "onglet": {
        "resume": "ملخص",
        "utilisateurs": "المستخدمون",
        "sessions": "الجلسات النشطة",
        "appareils": "الأجهزة",
        "journal": "السجل"
      },
      "r": {
        "utilisateurs_actifs": "الحسابات النشطة",
        "sessions_actives": "الجلسات النشطة",
        "appareils": "الأجهزة المعروفة",
        "connexions_24h": "عمليات الدخول (24 ساعة)",
        "echecs_24h": "المحاولات الفاشلة (24 ساعة)",
        "blocages_24h": "عمليات الحظر (24 ساعة)",
        "inhabituelles_24h": "عمليات دخول غير معتادة (24 ساعة)"
      },
      "bloques": "محظورة",
      "nouveauCompte": "حساب جديد",
      "nom": "الاسم",
      "motDePasse": "كلمة المرور",
      "creer": "إنشاء",
      "annuler": "إلغاء",
      "regleMdp": "8 أحرف على الأقل، مع حرف كبير وحرف صغير ورقم ورمز خاص.",
      "compteCree": "تم إنشاء الحساب",
      "fait": "تم التنفيذ",
      "role": {
        "technicien": "تقني",
        "superviseur": "مشرف",
        "admin": "مسؤول"
      },
      "roleCol": "الدور",
      "statut": "الحالة",
      "sessions": "الجلسات",
      "actions": "الإجراءات",
      "vous": "أنت",
      "actif": "نشط",
      "desactive": "معطل",
      "desactiver": "تعطيل",
      "activer": "تفعيل",
      "deconnecter": "تسجيل الخروج من كل الأجهزة",
      "confRole": "تغيير الدور؟ سيتم إغلاق جلسات هذا المستخدم.",
      "confDesactiver": "تعطيل هذا الحساب؟ سيتم إغلاق كل جلساته.",
      "confDeco": "تسجيل خروج هذا المستخدم من كل أجهزته؟",
      "utilisateur": "المستخدم",
      "appareil": "الجهاز",
      "localisation": "الموقع",
      "debut": "البداية",
      "activite": "آخر نشاط",
      "fermer": "إغلاق",
      "confSession": "إغلاق هذه الجلسة؟ سيتم تسجيل خروج المستخدم من هذا الجهاز.",
      "derniereIp": "آخر عنوان IP",
      "premiere": "أول دخول",
      "derniere": "آخر دخول",
      "sessionsActives": "جلسة نشطة",
      "bloque": "محظور",
      "autorise": "مسموح",
      "reactiver": "إعادة التفعيل",
      "bloquer": "حظر",
      "confBloquer": "حظر هذا الجهاز؟ سيتم إغلاق جلساته ولن يتمكن من الدخول.",
      "confSupprimer": "حذف هذا الجهاز من القائمة؟",
      "tousEvenements": "كل الأحداث",
      "date": "التاريخ",
      "evenement": "الحدث",
      "details": "التفاصيل",
      "aucun": "لا توجد عناصر",
      "ev": {
        "connexion_reussie": "دخول ناجح",
        "deconnexion": "تسجيل الخروج",
        "echec_connexion": "محاولة فاشلة",
        "connexion_bloquee": "دخول محظور",
        "connexion_inhabituelle": "دخول غير معتاد",
        "reutilisation_jeton": "إعادة استخدام الرمز",
        "compte_desactive": "حساب معطل",
        "appareil_bloque": "رفض جهاز محظور",
        "appareil_bloque_admin": "حظر جهاز",
        "nouvel_appareil": "جهاز جديد",
        "creation_compte": "إنشاء حساب",
        "modification_compte": "تعديل حساب",
        "deconnexion_distance": "تسجيل خروج عن بعد",
        "session_fermee": "جلسة مغلقة",
        "sessions_fermees": "جلسات مغلقة",
        "appareil_reactive": "إعادة تفعيل جهاز",
        "appareil_supprime": "حذف جهاز"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_securite.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
