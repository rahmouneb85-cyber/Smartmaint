"""Catalogue des déclencheurs et des actions disponibles, et modèles de workflows prêts à l'emploi.
Le frontend construit son éditeur à partir de ce catalogue : ajouter une action ici suffit à la proposer dans l'interface."""

SEVERITES = ["critique", "haute", "moyenne", "faible"]

# Paramètres communs de filtrage d'une alerte
FILTRES_ALERTE = [
    {"nom": "severites", "type": "multi", "options": SEVERITES, "libelle": "Sévérités concernées", "defaut": ["critique"]},
    {"nom": "equipements", "type": "equipements", "libelle": "Équipements (vide = tous)", "defaut": []},
    {"nom": "type_capteur", "type": "choix", "options": ["", "temperature", "pression", "vibration", "courant"], "libelle": "Type de capteur (vide = tous)", "defaut": ""},
    {"nom": "origine", "type": "choix", "options": ["", "seuil", "ia"], "libelle": "Origine (vide = toutes)", "defaut": ""},
]

DECLENCHEURS = [
    {"type": "alerte", "libelle": "Nouvelle alerte", "icone": "🚨",
     "description": "Dès qu'une alerte correspondant aux filtres est enregistrée.", "params": FILTRES_ALERTE},
    {"type": "recidive", "libelle": "Alertes répétées sur un équipement", "icone": "🔁",
     "description": "Quand un même équipement cumule plusieurs alertes en peu de temps.",
     "params": [{"nom": "nb", "type": "nombre", "libelle": "Nombre d'alertes", "defaut": 3},
                {"nom": "heures", "type": "nombre", "libelle": "Sur une période de (heures)", "defaut": 24}] + FILTRES_ALERTE},
    {"type": "alerte_non_traitee", "libelle": "Alerte sans intervention", "icone": "⏰",
     "description": "Quand une alerte reste sans intervention et sans acquittement après un délai (escalade).",
     "params": [{"nom": "minutes", "type": "nombre", "libelle": "Délai (minutes)", "defaut": 30}] + FILTRES_ALERTE},
    {"type": "intervention_terminee", "libelle": "Intervention terminée", "icone": "✅",
     "description": "Quand une intervention passe au statut terminée.",
     "params": [{"nom": "equipements", "type": "equipements", "libelle": "Équipements (vide = tous)", "defaut": []},
                {"nom": "type_intervention", "type": "choix", "options": ["", "corrective", "preventive"], "libelle": "Type (vide = tous)", "defaut": ""}]},
    {"type": "document_valide", "libelle": "Document validé", "icone": "📄",
     "description": "Quand un bon d'intervention déposé dans « Documents » est validé.", "params": []},
    {"type": "planifie", "libelle": "Planification", "icone": "🗓️",
     "description": "À intervalle régulier (maintenance préventive, rapport périodique).",
     "params": [{"nom": "frequence", "type": "choix", "options": ["quotidien", "hebdomadaire", "mensuel", "intervalle"], "libelle": "Fréquence", "defaut": "hebdomadaire"},
                {"nom": "heure", "type": "heure", "libelle": "Heure", "defaut": "08:00"},
                {"nom": "jour_semaine", "type": "choix", "options": ["0", "1", "2", "3", "4", "5", "6"], "libelle": "Jour (0 = lundi)", "defaut": "0"},
                {"nom": "jour_mois", "type": "nombre", "libelle": "Jour du mois", "defaut": 1},
                {"nom": "intervalle_heures", "type": "nombre", "libelle": "Intervalle (heures)", "defaut": 24},
                {"nom": "equipements", "type": "equipements", "libelle": "Une exécution par équipement (vide = une seule)", "defaut": []}]},
]

ACTIONS = [
    {"type": "creer_intervention", "libelle": "Créer une intervention", "icone": "🔧",
     "description": "Crée un ordre d'intervention ; priorité, technicien et date peuvent être choisis automatiquement à partir de l'historique.",
     "params": [{"nom": "type_intervention", "type": "choix", "options": ["corrective", "preventive"], "libelle": "Type", "defaut": "corrective"},
                {"nom": "priorite", "type": "choix", "options": ["auto", "basse", "normale", "haute", "urgente"], "libelle": "Priorité", "defaut": "auto"},
                {"nom": "technicien", "type": "technicien", "libelle": "Technicien (auto = le plus adapté)", "defaut": "auto"},
                {"nom": "description", "type": "texte", "libelle": "Description", "defaut": "{type_alerte} sur {equipement} : {message} (alerte #{alerte_id})"},
                {"nom": "avec_diagnostic", "type": "booleen", "libelle": "Ajouter le diagnostic probable (historique, manuels, IA)", "defaut": True},
                {"nom": "acquitter_alerte", "type": "booleen", "libelle": "Acquitter l'alerte d'origine", "defaut": True}]},
    {"type": "notifier_telegram", "libelle": "Envoyer un message Telegram", "icone": "📨",
     "description": "Prévient l'équipe sur le groupe Telegram configuré dans le fichier .env.",
     "params": [{"nom": "message", "type": "texte", "libelle": "Message", "defaut": "🚨 {severite} sur {equipement} : {message}\nIntervention : {intervention} · Technicien : {technicien}"}]},
    {"type": "analyse_copilote", "libelle": "Analyse par le copilote IA", "icone": "✨",
     "description": "Le copilote analyse l'événement ; sa réponse est ajoutée à l'intervention et utilisable dans les messages ({analyse}).",
     "params": [{"nom": "question", "type": "texte", "libelle": "Question", "defaut": "Analyse l'alerte #{alerte_id} sur {equipement} : cause la plus probable et 3 contrôles à faire. 6 lignes maximum."}]},
    {"type": "changer_statut_equipement", "libelle": "Changer le statut de l'équipement", "icone": "🏭",
     "description": "Passe l'équipement concerné dans un autre statut (par exemple « maintenance »).",
     "params": [{"nom": "statut", "type": "choix", "options": ["maintenance", "actif"], "libelle": "Nouveau statut", "defaut": "maintenance"}]},
    {"type": "acquitter_alerte", "libelle": "Acquitter l'alerte", "icone": "☑️", "description": "Marque l'alerte d'origine comme prise en compte.", "params": []},
    {"type": "reindexer_connaissances", "libelle": "Mettre à jour les connaissances du copilote", "icone": "🔄",
     "description": "Ajoute les derniers comptes rendus à la base de connaissances du copilote.", "params": []},
    {"type": "webhook", "libelle": "Appeler un service externe (webhook)", "icone": "🌐",
     "description": "Envoie l'événement en JSON à une adresse web (ERP, GMAO, Make, n8n…).",
     "params": [{"nom": "url", "type": "texte", "libelle": "Adresse (https://…)", "defaut": ""}]},
    {"type": "journaliser", "libelle": "Écrire dans le journal", "icone": "📝", "description": "Ajoute une ligne au journal de sécurité.",
     "params": [{"nom": "message", "type": "texte", "libelle": "Message", "defaut": "Workflow : {type_evenement} sur {equipement}"}]},
]

VARIABLES = ["equipement", "alerte_id", "severite", "type_alerte", "message", "date", "intervention", "technicien", "priorite",
             "nb_alertes", "analyse", "document", "type_evenement", "workflow"]

COMMUN_ACTION = {"en_cas_erreur": "continuer", "tentatives": 3}

MODELES = [
    {"cle": "alerte_critique", "nom": "Alerte critique : intervention urgente et alerte de l'équipe",
     "description": "À chaque alerte critique : intervention créée avec le technicien le plus adapté, analyse du copilote, message Telegram.",
     "declencheur": {"type": "alerte", "params": {"severites": ["critique"], "equipements": [], "type_capteur": "", "origine": ""}},
     "actions": [{"type": "creer_intervention", "params": {"type_intervention": "corrective", "priorite": "urgente", "technicien": "auto",
                                                          "description": "{type_alerte} sur {equipement} : {message} (alerte #{alerte_id})",
                                                          "avec_diagnostic": True, "acquitter_alerte": True}, "en_cas_erreur": "arreter", "tentatives": 3},
                 {"type": "analyse_copilote", "params": {"question": "Analyse l'alerte #{alerte_id} sur {equipement} : cause la plus probable et 3 contrôles à faire. 6 lignes maximum."}, "en_cas_erreur": "continuer", "tentatives": 2},
                 {"type": "notifier_telegram", "params": {"message": "🚨 Alerte critique sur {equipement}\n{message}\n🔧 {intervention} créée · technicien : {technicien}\n\n{analyse}"}, "en_cas_erreur": "continuer", "tentatives": 3}]},
    {"cle": "recidive", "nom": "Alertes répétées : intervention préventive",
     "description": "Si un équipement cumule 3 alertes en 24 heures, une intervention préventive est planifiée (récidive).",
     "declencheur": {"type": "recidive", "params": {"nb": 3, "heures": 24, "severites": ["critique", "haute"], "equipements": [], "type_capteur": "", "origine": ""}},
     "actions": [{"type": "creer_intervention", "params": {"type_intervention": "preventive", "priorite": "haute", "technicien": "auto",
                                                          "description": "Récidive : {nb_alertes} alertes en 24 h sur {equipement}. Rechercher la cause racine.",
                                                          "avec_diagnostic": True, "acquitter_alerte": False}, "en_cas_erreur": "arreter", "tentatives": 3},
                 {"type": "notifier_telegram", "params": {"message": "🔁 {nb_alertes} alertes en 24 h sur {equipement} : intervention {intervention} planifiée ({technicien})."}, "en_cas_erreur": "continuer", "tentatives": 3}]},
    {"cle": "escalade", "nom": "Escalade : alerte critique non traitée après 30 minutes",
     "description": "Si une alerte critique n'a ni intervention ni acquittement après 30 minutes, le responsable est prévenu.",
     "declencheur": {"type": "alerte_non_traitee", "params": {"minutes": 30, "severites": ["critique"], "equipements": [], "type_capteur": "", "origine": ""}},
     "actions": [{"type": "notifier_telegram", "params": {"message": "⏰ ESCALADE : l'alerte #{alerte_id} ({severite}) sur {equipement} n'est pas traitée depuis 30 minutes.\n{message}"}, "en_cas_erreur": "continuer", "tentatives": 3},
                 {"type": "journaliser", "params": {"message": "Escalade de l'alerte #{alerte_id} sur {equipement}"}, "en_cas_erreur": "continuer", "tentatives": 1}]},
    {"cle": "graissage_hebdo", "nom": "Maintenance préventive : graissage chaque lundi",
     "description": "Chaque lundi à 8 h, une intervention préventive de graissage est planifiée pour les équipements choisis.",
     "declencheur": {"type": "planifie", "params": {"frequence": "hebdomadaire", "heure": "08:00", "jour_semaine": "0", "jour_mois": 1, "intervalle_heures": 24, "equipements": []}},
     "actions": [{"type": "creer_intervention", "params": {"type_intervention": "preventive", "priorite": "normale", "technicien": "auto",
                                                          "description": "Graissage hebdomadaire des roulements de {equipement} (graisse NLGI 2, quantité selon le manuel).",
                                                          "avec_diagnostic": False, "acquitter_alerte": False}, "en_cas_erreur": "continuer", "tentatives": 3}]},
    {"cle": "apres_intervention", "nom": "Après chaque intervention : mise à jour du copilote",
     "description": "Quand une intervention est terminée, son compte rendu est ajouté aux connaissances du copilote et l'équipement repasse actif.",
     "declencheur": {"type": "intervention_terminee", "params": {"equipements": [], "type_intervention": ""}},
     "actions": [{"type": "reindexer_connaissances", "params": {}, "en_cas_erreur": "continuer", "tentatives": 2},
                 {"type": "changer_statut_equipement", "params": {"statut": "actif"}, "en_cas_erreur": "continuer", "tentatives": 1},
                 {"type": "notifier_telegram", "params": {"message": "✅ {intervention} terminée sur {equipement} par {technicien}."}, "en_cas_erreur": "continuer", "tentatives": 3}]},
]


def definition(liste, type_):
    return next((d for d in liste if d["type"] == type_), None)
