// Ajoute les traductions de la page « Workflows automatiques » dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_workflows.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "menu": {
      "workflows": "Workflows"
    }
  },
  "en": {
    "menu": {
      "workflows": "Workflows"
    },
    "workflows": {
      "titre": "Automated workflows",
      "intro": "“WHEN… THEN…” rules that SmartMaint applies on its own, with a history of every run.",
      "moteurActif": "Engine running",
      "moteurArrete": "Engine stopped",
      "verif": "checks every {{n}} s",
      "regleActives": "Active rules",
      "execJour": "Runs today",
      "dernierTour": "Last check",
      "telegramAbsent": "Telegram not configured: messages will fail",
      "regles": "Rules",
      "modeles": "Ready-made templates",
      "historique": "Run history",
      "nouveau": "New rule",
      "vide": "No rules yet. Start from a ready-made template.",
      "activer": "Enable / disable",
      "executions": "run(s)",
      "reussite": "success rate",
      "derniere": "last",
      "prochaine": "next",
      "simuler": "Simulate over 7 days",
      "executer": "Run now",
      "modifier": "Edit",
      "voirHistorique": "History",
      "utiliser": "Use this template",
      "toutes": "All rules",
      "actualiser": "Refresh",
      "aucuneExec": "No runs yet.",
      "alerte": "alert",
      "tentatives": "attempts",
      "relancer": "Retry",
      "simulation": "Simulation",
      "simResume": "Over the last {{j}} days, this rule would have triggered {{n}} times. Nothing was changed or sent.",
      "fermer": "Close",
      "modifierRegle": "Edit rule",
      "nom": "Rule name",
      "maxHeure": "Maximum per hour",
      "quand": "WHEN",
      "alors": "THEN",
      "enCasErreur": "On error",
      "continuer": "continue with the next actions",
      "arreter": "stop the workflow",
      "essais": "Attempts",
      "ajouterAction": "Add an action",
      "variables": "Variables usable in texts",
      "enregistrer": "Save",
      "annuler": "Cancel",
      "enregistre": "Workflow saved",
      "confirmerSuppression": "Delete this workflow and its history?",
      "confirmerExecution": "Really run this workflow now (on the latest matching event)?",
      "executionLancee": "Run started: result in the history in a few seconds",
      "relanceLancee": "Retry started",
      "erreur": "Error",
      "chargement": "Loading…",
      "tous": "— All —",
      "auto": "Automatic (best suited)",
      "aucun": "None",
      "oui": "Yes",
      "st": {
        "succes": "Succeeded",
        "partiel": "Partial",
        "echec": "Failed",
        "en_cours": "Running",
        "limite": "Limit reached"
      },
      "sev": {
        "critique": "critical",
        "haute": "high",
        "moyenne": "medium",
        "faible": "low"
      },
      "opt": {
        "corrective": "corrective",
        "preventive": "preventive",
        "quotidien": "daily",
        "hebdomadaire": "weekly",
        "mensuel": "monthly",
        "intervalle": "interval",
        "maintenance": "maintenance",
        "actif": "active",
        "temperature": "temperature",
        "pression": "pressure",
        "vibration": "vibration",
        "courant": "current",
        "seuil": "threshold",
        "ia": "AI",
        "auto": "auto",
        "basse": "low",
        "normale": "normal",
        "haute": "high",
        "urgente": "urgent"
      },
      "d": {
        "alerte": "New alert",
        "recidive": "Repeated alerts on one equipment",
        "alerte_non_traitee": "Alert without intervention",
        "intervention_terminee": "Intervention completed",
        "document_valide": "Document validated",
        "planifie": "Schedule"
      },
      "a": {
        "creer_intervention": "Create an intervention",
        "notifier_telegram": "Send a Telegram message",
        "analyse_copilote": "Analysis by the AI copilot",
        "changer_statut_equipement": "Change equipment status",
        "acquitter_alerte": "Acknowledge the alert",
        "reindexer_connaissances": "Update the copilot knowledge",
        "webhook": "Call an external service (webhook)",
        "journaliser": "Write to the log"
      },
      "o": {
        "manuelle": "manual",
        "relance": "retry"
      }
    }
  },
  "ar": {
    "menu": {
      "workflows": "سير العمل"
    },
    "workflows": {
      "titre": "سير العمل الآلي",
      "intro": "قواعد « عندما… إذن… » يطبقها SmartMaint تلقائيًا، مع سجل لكل تنفيذ.",
      "moteurActif": "المحرك يعمل",
      "moteurArrete": "المحرك متوقف",
      "verif": "فحص كل {{n}} ثانية",
      "regleActives": "القواعد النشطة",
      "execJour": "عمليات التنفيذ اليوم",
      "dernierTour": "آخر فحص",
      "telegramAbsent": "تيليغرام غير مهيأ: ستفشل الرسائل",
      "regles": "القواعد",
      "modeles": "نماذج جاهزة",
      "historique": "سجل التنفيذ",
      "nouveau": "قاعدة جديدة",
      "vide": "لا توجد قواعد. ابدأ بنموذج جاهز.",
      "activer": "تفعيل / تعطيل",
      "executions": "تنفيذ",
      "reussite": "نسبة النجاح",
      "derniere": "الأخير",
      "prochaine": "القادم",
      "simuler": "محاكاة على 7 أيام",
      "executer": "تنفيذ الآن",
      "modifier": "تعديل",
      "voirHistorique": "السجل",
      "utiliser": "استخدام هذا النموذج",
      "toutes": "كل القواعد",
      "actualiser": "تحديث",
      "aucuneExec": "لا يوجد تنفيذ حاليًا.",
      "alerte": "تنبيه",
      "tentatives": "محاولات",
      "relancer": "إعادة المحاولة",
      "simulation": "محاكاة",
      "simResume": "خلال آخر {{j}} أيام، كانت هذه القاعدة ستنطلق {{n}} مرة. لم يتم تعديل أو إرسال أي شيء.",
      "fermer": "إغلاق",
      "modifierRegle": "تعديل القاعدة",
      "nom": "اسم القاعدة",
      "maxHeure": "الحد الأقصى في الساعة",
      "quand": "عندما",
      "alors": "إذن",
      "enCasErreur": "عند حدوث خطأ",
      "continuer": "متابعة الإجراءات التالية",
      "arreter": "إيقاف سير العمل",
      "essais": "المحاولات",
      "ajouterAction": "إضافة إجراء",
      "variables": "المتغيرات القابلة للاستعمال في النصوص",
      "enregistrer": "حفظ",
      "annuler": "إلغاء",
      "enregistre": "تم حفظ سير العمل",
      "confirmerSuppression": "حذف سير العمل هذا وسجله؟",
      "confirmerExecution": "تنفيذ سير العمل هذا فعليًا الآن (على آخر حدث مطابق)؟",
      "executionLancee": "بدأ التنفيذ: النتيجة في السجل بعد ثوانٍ",
      "relanceLancee": "بدأت إعادة المحاولة",
      "erreur": "خطأ",
      "chargement": "جارٍ التحميل…",
      "tous": "— الكل —",
      "auto": "تلقائي (الأنسب)",
      "aucun": "لا أحد",
      "oui": "نعم",
      "st": {
        "succes": "ناجح",
        "partiel": "جزئي",
        "echec": "فشل",
        "en_cours": "قيد التنفيذ",
        "limite": "تم بلوغ الحد"
      },
      "sev": {
        "critique": "حرجة",
        "haute": "مرتفعة",
        "moyenne": "متوسطة",
        "faible": "منخفضة"
      },
      "opt": {
        "corrective": "تصحيحي",
        "preventive": "وقائي",
        "quotidien": "يومي",
        "hebdomadaire": "أسبوعي",
        "mensuel": "شهري",
        "intervalle": "فاصل زمني",
        "maintenance": "صيانة",
        "actif": "نشط",
        "temperature": "الحرارة",
        "pression": "الضغط",
        "vibration": "الاهتزاز",
        "courant": "التيار",
        "seuil": "عتبة",
        "ia": "ذكاء اصطناعي",
        "auto": "تلقائي",
        "basse": "منخفضة",
        "normale": "عادية",
        "haute": "مرتفعة",
        "urgente": "عاجلة"
      },
      "d": {
        "alerte": "تنبيه جديد",
        "recidive": "تنبيهات متكررة على نفس المعدات",
        "alerte_non_traitee": "تنبيه بدون تدخل",
        "intervention_terminee": "تدخل منتهٍ",
        "document_valide": "وثيقة مصادق عليها",
        "planifie": "برمجة زمنية"
      },
      "a": {
        "creer_intervention": "إنشاء تدخل",
        "notifier_telegram": "إرسال رسالة تيليغرام",
        "analyse_copilote": "تحليل من المساعد الذكي",
        "changer_statut_equipement": "تغيير حالة المعدات",
        "acquitter_alerte": "الإقرار بالتنبيه",
        "reindexer_connaissances": "تحديث معارف المساعد",
        "webhook": "استدعاء خدمة خارجية (webhook)",
        "journaliser": "الكتابة في السجل"
      },
      "o": {
        "manuelle": "يدوي",
        "relance": "إعادة"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_workflows.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
