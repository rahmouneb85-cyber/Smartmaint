"""Vocabulaire de maintenance industrielle en français, anglais et arabe.
Il complète l'historique de SmartMaint : les suggestions sont proposées dans la langue de l'utilisateur,
et un terme saisi dans une autre langue est reconnu (« bearing » ou « محمل » retrouvent « roulement »)."""

# Chaque entrée : (fr, en, ar). Classées par champ du formulaire.
TERMES = {
    "description": [
        ("Vibrations anormales", "Abnormal vibrations", "اهتزازات غير طبيعية"),
        ("Bruit anormal au palier", "Abnormal bearing noise", "ضجيج غير طبيعي في المحمل"),
        ("Échauffement anormal", "Abnormal overheating", "ارتفاع غير طبيعي في الحرارة"),
        ("Température au-dessus du seuil", "Temperature above threshold", "درجة الحرارة فوق العتبة"),
        ("Pression trop basse", "Pressure too low", "ضغط منخفض جدا"),
        ("Pression trop élevée", "Pressure too high", "ضغط مرتفع جدا"),
        ("Fuite d'huile", "Oil leak", "تسرب الزيت"),
        ("Fuite à la garniture mécanique", "Mechanical seal leak", "تسرب من الحشوة الميكانيكية"),
        ("Fuite d'air", "Air leak", "تسرب الهواء"),
        ("Surintensité moteur", "Motor overcurrent", "تيار زائد في المحرك"),
        ("Arrêt intempestif", "Unexpected shutdown", "توقف مفاجئ"),
        ("Démarrage impossible", "Fails to start", "تعذر التشغيل"),
        ("Débit insuffisant", "Insufficient flow", "تدفق غير كاف"),
        ("Odeur de brûlé", "Burning smell", "رائحة احتراق"),
        ("Courroie qui patine", "Slipping belt", "انزلاق السير"),
        ("Alarme du capteur", "Sensor alarm", "إنذار الحساس"),
        ("Entretien préventif périodique", "Periodic preventive maintenance", "صيانة وقائية دورية"),
        ("Graissage périodique des roulements", "Periodic bearing lubrication", "تشحيم دوري للمحامل"),
        ("Contrôle suite à l'alerte", "Inspection following the alert", "فحص بعد التنبيه"),
    ],
    "diagnostic": [
        ("Roulement usé", "Worn bearing", "محمل متآكل"),
        ("Roulement côté accouplement endommagé", "Coupling-side bearing damaged", "تلف المحمل من جهة الوصلة"),
        ("Désalignement moteur / pompe", "Motor / pump misalignment", "عدم محاذاة المحرك والمضخة"),
        ("Balourd de la roue", "Impeller imbalance", "عدم توازن الدوار"),
        ("Desserrage des fixations du socle", "Loose base fixings", "ارتخاء مثبتات القاعدة"),
        ("Manque de graisse", "Lack of grease", "نقص في الشحم"),
        ("Excès de graisse", "Excess grease", "إفراط في الشحم"),
        ("Garniture mécanique usée", "Worn mechanical seal", "حشوة ميكانيكية متآكلة"),
        ("Filtre colmaté", "Clogged filter", "مرشح مسدود"),
        ("Ventilateur de refroidissement encrassé", "Clogged cooling fan", "مروحة التبريد متسخة"),
        ("Courroie détendue", "Slack belt", "سير مرتخي"),
        ("Capteur défectueux", "Faulty sensor", "حساس معطل"),
        ("Câble du capteur endommagé", "Damaged sensor cable", "كابل الحساس تالف"),
        ("Fuite au joint", "Gasket leak", "تسرب من الحشية"),
        ("Bobinage moteur endommagé", "Damaged motor winding", "تلف لف المحرك"),
        ("Clapet anti-retour bloqué", "Stuck check valve", "صمام عدم الرجوع عالق"),
    ],
    "actions_realisees": [
        ("Remplacement du roulement", "Bearing replacement", "استبدال المحمل"),
        ("Lignage laser moteur-pompe", "Laser alignment of motor and pump", "محاذاة بالليزر للمحرك والمضخة"),
        ("Resserrage des fixations du socle", "Retightening of base fixings", "إعادة شد مثبتات القاعدة"),
        ("Graissage des roulements", "Bearing lubrication", "تشحيم المحامل"),
        ("Remplacement du filtre", "Filter replacement", "استبدال المرشح"),
        ("Nettoyage du ventilateur", "Fan cleaning", "تنظيف المروحة"),
        ("Remplacement de la garniture mécanique", "Mechanical seal replacement", "استبدال الحشوة الميكانيكية"),
        ("Retension de la courroie", "Belt retensioning", "إعادة شد السير"),
        ("Remplacement du capteur", "Sensor replacement", "استبدال الحساس"),
        ("Contrôle des serrages", "Torque check", "فحص عزم الشد"),
        ("Mesure des vibrations après intervention", "Vibration measurement after intervention", "قياس الاهتزازات بعد التدخل"),
        ("Purge du réservoir", "Tank drain", "تفريغ الخزان"),
        ("Essai de fonctionnement", "Functional test", "اختبار التشغيل"),
        ("Remise en service", "Return to service", "إعادة التشغيل"),
    ],
    "pieces_remplacees": [
        ("Roulement 6205-2RS", "Bearing 6205-2RS", "محمل 6205-2RS"),
        ("Garniture mécanique", "Mechanical seal", "حشوة ميكانيكية"),
        ("Filtre à air", "Air filter", "مرشح الهواء"),
        ("Filtre à huile", "Oil filter", "مرشح الزيت"),
        ("Courroie", "Belt", "سير"),
        ("Joint torique", "O-ring", "حلقة دائرية"),
        ("Ventilateur", "Fan", "مروحة"),
        ("Capteur de vibration", "Vibration sensor", "حساس الاهتزاز"),
        ("Capteur de température", "Temperature sensor", "حساس الحرارة"),
        ("Accouplement élastique", "Flexible coupling", "وصلة مرنة"),
        ("Graisse EP2", "EP2 grease", "شحم EP2"),
    ],
    "observations": [
        ("Fonctionnement normal après intervention", "Normal operation after intervention", "تشغيل عادي بعد التدخل"),
        ("Contrôle conseillé dans 15 jours", "Inspection recommended in 15 days", "يُنصح بالفحص بعد 15 يوما"),
        ("Surveiller les vibrations", "Monitor vibrations", "مراقبة الاهتزازات"),
        ("Surveiller la température", "Monitor temperature", "مراقبة درجة الحرارة"),
        ("Pièce à commander", "Part to be ordered", "قطعة يجب طلبها"),
        ("Prévoir un remplacement lors du prochain arrêt", "Plan a replacement at the next shutdown", "التخطيط للاستبدال في التوقف القادم"),
        ("Récidive : analyser la cause racine", "Recurrence: analyse the root cause", "تكرار العطل: تحليل السبب الجذري"),
    ],
}
LANGUES = {"fr": 0, "en": 1, "ar": 2}


def termes(champ: str, langue: str = "fr") -> list:
    """Liste des termes du champ dans la langue demandée, avec leurs équivalents (pour reconnaître toutes les langues)."""
    i = LANGUES.get(langue, 0)
    return [{"texte": t[i], "variantes": list(t)} for t in TERMES.get(champ, [])]


def traduire_vers_francais(texte: str) -> str:
    """Remplace les termes connus en anglais ou en arabe par leur équivalent français (sans modèle de langage)."""
    resultat = texte
    for liste in TERMES.values():
        for fr, en, ar in liste:
            for autre in (en, ar):
                if autre.lower() in resultat.lower():
                    debut = resultat.lower().index(autre.lower())
                    resultat = resultat[:debut] + fr + resultat[debut + len(autre):]
    return resultat
