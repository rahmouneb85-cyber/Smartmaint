// Ajoute les traductions de la phase 3 (Mon compte, 2FA, sauvegardes, indicateurs) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_phase3.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "compte": "Mon compte"
    },
    "login": {
      "mfaConsigne": "Saisissez le code à 6 chiffres affiché dans votre application d'authentification, ou un code de secours.",
      "verifier": "Vérifier",
      "retour": "Retour",
      "codeFaux": "Code incorrect.",
      "mfaExpire": "Délai dépassé. Reconnectez-vous."
    },
    "compte": {
      "titre": "Mon compte",
      "profil": "Profil",
      "nom": "Nom",
      "role": "Rôle",
      "mfaTitre": "Double authentification (2FA)",
      "mfaActive": "Activée",
      "codesRestants": "{{n}} code(s) de secours restant(s)",
      "regenerer": "Nouveaux codes de secours",
      "desactiver": "Désactiver la 2FA",
      "motDePasse": "Mot de passe",
      "code": "Code à 6 chiffres",
      "confirmer": "Confirmer",
      "annuler": "Annuler",
      "mfaExplication": "Protégez votre compte : en plus du mot de passe, un code à 6 chiffres généré par votre téléphone sera demandé à chaque connexion.",
      "activer": "Activer la 2FA",
      "etape1": "Installez Google Authenticator ou Microsoft Authenticator sur votre téléphone.",
      "etape2": "Scannez le QR code avec l'application.",
      "etape3": "Saisissez le code à 6 chiffres affiché pour confirmer.",
      "cleManuelle": "Clé à saisir manuellement :",
      "codesTitre": "Codes de secours",
      "codesConsigne": "Conservez ces codes en lieu sûr : chacun permet une connexion si vous perdez votre téléphone. Ils ne seront plus affichés.",
      "telecharger": "Télécharger",
      "jaiNote": "J'ai noté mes codes",
      "mdpTitre": "Changer le mot de passe",
      "ancien": "Mot de passe actuel",
      "nouveau": "Nouveau mot de passe",
      "confirmation": "Confirmation",
      "modifier": "Modifier",
      "autresFermees": "Vos autres sessions seront fermées.",
      "sessionsTitre": "Mes sessions actives",
      "fermerAutres": "Fermer les autres sessions",
      "cetAppareil": "cet appareil",
      "seDeconnecter": "Se déconnecter",
      "fermer": "Fermer",
      "mfaActivee": "Double authentification activée",
      "mfaDesactivee": "Double authentification désactivée",
      "demanderCode": "Code à 6 chiffres de votre application :",
      "mdpDifferents": "Les deux nouveaux mots de passe sont différents",
      "mdpModifie": "Mot de passe modifié ({{n}} autre(s) session(s) fermée(s))"
    },
    "indicateurs": {
      "titre": "Indicateurs de maintenance (30 jours)",
      "mttr": "MTTR (temps moyen de réparation)",
      "dispo": "Disponibilité moyenne",
      "interventions": "Interventions terminées / ouvertes",
      "graves": "Alertes graves sans intervention",
      "equipement": "Équipement",
      "pannes": "Pannes",
      "disponibilite": "Disponibilité"
    },
    "securite": {
      "onglet": {
        "sauvegardes": "Sauvegardes"
      },
      "active": "Activée",
      "inactive": "Non activée",
      "reset2fa": "Réinitialiser 2FA",
      "conf2fa": "Réinitialiser la double authentification de cet utilisateur (téléphone perdu) ?",
      "sauvegardesInfo": "Sauvegarde automatique toutes les 24 h. Chaque fichier est compressé, chiffré et protégé par une empreinte SHA-256. Le test restaure la sauvegarde dans une base temporaire, compare les tables puis la supprime.",
      "enCours": "En cours...",
      "sauvegarderMaintenant": "Sauvegarder maintenant",
      "fichier": "Fichier",
      "origine": "Origine",
      "taille": "Taille",
      "dernierTest": "Dernier test",
      "tester": "Tester la restauration",
      "resultatTest": "Résultat du test",
      "table": "Table",
      "lignesSauvegarde": "Lignes dans la sauvegarde",
      "lignesActuelles": "Lignes actuelles",
      "restaurationOk": "Restauration testée avec succès",
      "restaurationKo": "Le test de restauration a échoué",
      "origineType": {
        "manuelle": "Manuelle",
        "automatique": "Automatique"
      },
      "ev": {
        "mfa_demande": "Code 2FA demandé",
        "mfa_activee": "2FA activée",
        "mfa_desactivee": "2FA désactivée",
        "mfa_reinitialisee": "2FA réinitialisée",
        "code_secours_utilise": "Code de secours utilisé",
        "codes_secours_regeneres": "Codes de secours renouvelés",
        "changement_mdp": "Mot de passe changé",
        "echec_changement_mdp": "Échec du changement de mot de passe",
        "sauvegarde_creee": "Sauvegarde créée",
        "sauvegarde_echec": "Échec de sauvegarde",
        "restauration_testee": "Restauration testée",
        "restauration_echec": "Échec de restauration"
      }
    }
  },
  "en": {
    "menu": {
      "compte": "My account"
    },
    "login": {
      "mfaConsigne": "Enter the 6-digit code shown in your authenticator app, or a backup code.",
      "verifier": "Verify",
      "retour": "Back",
      "codeFaux": "Incorrect code.",
      "mfaExpire": "Time expired. Please sign in again."
    },
    "compte": {
      "titre": "My account",
      "profil": "Profile",
      "nom": "Name",
      "role": "Role",
      "mfaTitre": "Two-factor authentication (2FA)",
      "mfaActive": "Enabled",
      "codesRestants": "{{n}} backup code(s) left",
      "regenerer": "New backup codes",
      "desactiver": "Disable 2FA",
      "motDePasse": "Password",
      "code": "6-digit code",
      "confirmer": "Confirm",
      "annuler": "Cancel",
      "mfaExplication": "Protect your account: in addition to your password, a 6-digit code generated by your phone will be required at each sign-in.",
      "activer": "Enable 2FA",
      "etape1": "Install Google Authenticator or Microsoft Authenticator on your phone.",
      "etape2": "Scan the QR code with the app.",
      "etape3": "Enter the 6-digit code shown to confirm.",
      "cleManuelle": "Key for manual entry:",
      "codesTitre": "Backup codes",
      "codesConsigne": "Keep these codes somewhere safe: each one lets you sign in once if you lose your phone. They will not be shown again.",
      "telecharger": "Download",
      "jaiNote": "I have saved my codes",
      "mdpTitre": "Change password",
      "ancien": "Current password",
      "nouveau": "New password",
      "confirmation": "Confirmation",
      "modifier": "Change",
      "autresFermees": "Your other sessions will be closed.",
      "sessionsTitre": "My active sessions",
      "fermerAutres": "Close other sessions",
      "cetAppareil": "this device",
      "seDeconnecter": "Sign out",
      "fermer": "Close",
      "mfaActivee": "Two-factor authentication enabled",
      "mfaDesactivee": "Two-factor authentication disabled",
      "demanderCode": "6-digit code from your app:",
      "mdpDifferents": "The two new passwords do not match",
      "mdpModifie": "Password changed ({{n}} other session(s) closed)"
    },
    "indicateurs": {
      "titre": "Maintenance indicators (30 days)",
      "mttr": "MTTR (mean time to repair)",
      "dispo": "Average availability",
      "interventions": "Completed / open interventions",
      "graves": "Serious alerts without intervention",
      "equipement": "Equipment",
      "pannes": "Failures",
      "disponibilite": "Availability"
    },
    "securite": {
      "onglet": {
        "sauvegardes": "Backups"
      },
      "active": "Enabled",
      "inactive": "Not enabled",
      "reset2fa": "Reset 2FA",
      "conf2fa": "Reset this user's two-factor authentication (lost phone)?",
      "sauvegardesInfo": "Automatic backup every 24 h. Each file is compressed, encrypted and protected by a SHA-256 checksum. The test restores the backup into a temporary database, compares the tables, then deletes it.",
      "enCours": "In progress...",
      "sauvegarderMaintenant": "Back up now",
      "fichier": "File",
      "origine": "Origin",
      "taille": "Size",
      "dernierTest": "Last test",
      "tester": "Test restore",
      "resultatTest": "Test result",
      "table": "Table",
      "lignesSauvegarde": "Rows in backup",
      "lignesActuelles": "Current rows",
      "restaurationOk": "Restore tested successfully",
      "restaurationKo": "The restore test failed",
      "origineType": {
        "manuelle": "Manual",
        "automatique": "Automatic"
      },
      "ev": {
        "mfa_demande": "2FA code requested",
        "mfa_activee": "2FA enabled",
        "mfa_desactivee": "2FA disabled",
        "mfa_reinitialisee": "2FA reset",
        "code_secours_utilise": "Backup code used",
        "codes_secours_regeneres": "Backup codes renewed",
        "changement_mdp": "Password changed",
        "echec_changement_mdp": "Password change failed",
        "sauvegarde_creee": "Backup created",
        "sauvegarde_echec": "Backup failed",
        "restauration_testee": "Restore tested",
        "restauration_echec": "Restore failed"
      }
    }
  },
  "ar": {
    "menu": {
      "compte": "حسابي"
    },
    "login": {
      "mfaConsigne": "أدخل الرمز المكون من 6 أرقام الظاهر في تطبيق المصادقة، أو رمزاً احتياطياً.",
      "verifier": "تحقق",
      "retour": "رجوع",
      "codeFaux": "رمز غير صحيح.",
      "mfaExpire": "انتهت المهلة. يرجى تسجيل الدخول من جديد."
    },
    "compte": {
      "titre": "حسابي",
      "profil": "الملف الشخصي",
      "nom": "الاسم",
      "role": "الدور",
      "mfaTitre": "المصادقة الثنائية",
      "mfaActive": "مفعلة",
      "codesRestants": "{{n}} رمز احتياطي متبقٍ",
      "regenerer": "رموز احتياطية جديدة",
      "desactiver": "تعطيل المصادقة الثنائية",
      "motDePasse": "كلمة المرور",
      "code": "رمز من 6 أرقام",
      "confirmer": "تأكيد",
      "annuler": "إلغاء",
      "mfaExplication": "احمِ حسابك: بالإضافة إلى كلمة المرور، سيُطلب رمز من 6 أرقام يولده هاتفك عند كل تسجيل دخول.",
      "activer": "تفعيل المصادقة الثنائية",
      "etape1": "ثبّت Google Authenticator أو Microsoft Authenticator على هاتفك.",
      "etape2": "امسح رمز QR بالتطبيق.",
      "etape3": "أدخل الرمز المكون من 6 أرقام للتأكيد.",
      "cleManuelle": "مفتاح للإدخال اليدوي:",
      "codesTitre": "الرموز الاحتياطية",
      "codesConsigne": "احفظ هذه الرموز في مكان آمن: كل رمز يسمح بتسجيل دخول واحد إذا فقدت هاتفك. لن تُعرض مرة أخرى.",
      "telecharger": "تنزيل",
      "jaiNote": "لقد حفظت رموزي",
      "mdpTitre": "تغيير كلمة المرور",
      "ancien": "كلمة المرور الحالية",
      "nouveau": "كلمة المرور الجديدة",
      "confirmation": "التأكيد",
      "modifier": "تغيير",
      "autresFermees": "سيتم إغلاق جلساتك الأخرى.",
      "sessionsTitre": "جلساتي النشطة",
      "fermerAutres": "إغلاق الجلسات الأخرى",
      "cetAppareil": "هذا الجهاز",
      "seDeconnecter": "تسجيل الخروج",
      "fermer": "إغلاق",
      "mfaActivee": "تم تفعيل المصادقة الثنائية",
      "mfaDesactivee": "تم تعطيل المصادقة الثنائية",
      "demanderCode": "الرمز المكون من 6 أرقام من تطبيقك:",
      "mdpDifferents": "كلمتا المرور الجديدتان غير متطابقتين",
      "mdpModifie": "تم تغيير كلمة المرور (أُغلقت {{n}} جلسة أخرى)"
    },
    "indicateurs": {
      "titre": "مؤشرات الصيانة (30 يوماً)",
      "mttr": "متوسط وقت الإصلاح (MTTR)",
      "dispo": "متوسط التوفر",
      "interventions": "التدخلات المنتهية / المفتوحة",
      "graves": "تنبيهات خطيرة بدون تدخل",
      "equipement": "المعدات",
      "pannes": "الأعطال",
      "disponibilite": "التوفر"
    },
    "securite": {
      "onglet": {
        "sauvegardes": "النسخ الاحتياطية"
      },
      "active": "مفعلة",
      "inactive": "غير مفعلة",
      "reset2fa": "إعادة تعيين المصادقة الثنائية",
      "conf2fa": "إعادة تعيين المصادقة الثنائية لهذا المستخدم (هاتف مفقود)؟",
      "sauvegardesInfo": "نسخ احتياطي تلقائي كل 24 ساعة. كل ملف مضغوط ومشفر ومحمي ببصمة SHA-256. يقوم الاختبار باستعادة النسخة في قاعدة مؤقتة ومقارنة الجداول ثم حذفها.",
      "enCours": "جارٍ التنفيذ...",
      "sauvegarderMaintenant": "نسخ احتياطي الآن",
      "fichier": "الملف",
      "origine": "المصدر",
      "taille": "الحجم",
      "dernierTest": "آخر اختبار",
      "tester": "اختبار الاستعادة",
      "resultatTest": "نتيجة الاختبار",
      "table": "الجدول",
      "lignesSauvegarde": "الأسطر في النسخة",
      "lignesActuelles": "الأسطر الحالية",
      "restaurationOk": "تم اختبار الاستعادة بنجاح",
      "restaurationKo": "فشل اختبار الاستعادة",
      "origineType": {
        "manuelle": "يدوية",
        "automatique": "تلقائية"
      },
      "ev": {
        "mfa_demande": "طلب رمز المصادقة",
        "mfa_activee": "تفعيل المصادقة الثنائية",
        "mfa_desactivee": "تعطيل المصادقة الثنائية",
        "mfa_reinitialisee": "إعادة تعيين المصادقة الثنائية",
        "code_secours_utilise": "استخدام رمز احتياطي",
        "codes_secours_regeneres": "تجديد الرموز الاحتياطية",
        "changement_mdp": "تغيير كلمة المرور",
        "echec_changement_mdp": "فشل تغيير كلمة المرور",
        "sauvegarde_creee": "إنشاء نسخة احتياطية",
        "sauvegarde_echec": "فشل النسخ الاحتياطي",
        "restauration_testee": "اختبار الاستعادة",
        "restauration_echec": "فشل الاستعادة"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_phase3.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
