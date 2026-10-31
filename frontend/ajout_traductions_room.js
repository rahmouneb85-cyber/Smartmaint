// Ajoute les traductions de Room Live (salles, audio, vidéo et chat en temps réel) dans fr.json, en.json et ar.json.
// Les clés qui existent déjà ne sont JAMAIS modifiées : seules les clés manquantes sont ajoutées.
// Utilisation (depuis le dossier frontend) : node ajout_traductions_room.js
const fs = require('fs');
const path = require('path');

const NOUVEAU = {
  "fr": {
    "room": {
      "intro": "Réunions audio et vidéo en direct avec chat, réservées aux participants invités.",
      "nouvelle": "Nouvelle salle",
      "chargement": "Chargement…",
      "aucune": "Aucune salle pour le moment : créez-en une et invitez vos collègues.",
      "enDirect": "En direct",
      "ouverte": "Ouverte",
      "terminee": "Terminée",
      "nbMembres": "{{n}} membre(s)",
      "invite": "Vous êtes invité à cette réunion",
      "rejoindre": "Rejoindre",
      "historique": "Voir l’historique",
      "chercher": "Rechercher un collègue",
      "inviter": "Inviter",
      "nomSalle": "Nom de la réunion",
      "description": "Objet (facultatif)",
      "creer": "Créer et entrer",
      "introuvable": "Salle introuvable",
      "finReunion": "La réunion est terminée.",
      "retire": "Vous avez été retiré de la salle.",
      "bloque": "Vous avez été bloqué dans cette salle.",
      "ailleurs": "La salle a été ouverte dans une autre fenêtre.",
      "sansMedia": "Caméra ou micro indisponible : vous entrez sans son ni image. Vérifiez les autorisations du navigateur.",
      "coupe": "Connexion interrompue. Vous pouvez rejoindre de nouveau.",
      "aucunePiste": "Rejoignez de nouveau en activant ce périphérique.",
      "confirmFin": "Terminer la réunion pour tous les participants ?",
      "terminer": "Terminer",
      "retourListe": "Retour à la liste des salles",
      "duree": "Durée de la réunion",
      "nbParticipants": "{{n}} participant(s)",
      "videos": "Vidéos des participants",
      "pret": "Prêt à rejoindre ? Choisissez votre micro et votre caméra.",
      "micro": "Micro",
      "camera": "Caméra",
      "connexionEnCours": "Connexion…",
      "entrer": "Entrer dans la réunion",
      "confidentialite": "Le son et l’image passent directement entre les participants, chiffrés : ils ne sont ni transmis au serveur ni enregistrés.",
      "commandes": "Commandes de la réunion",
      "couperMicro": "Couper le micro",
      "activerMicro": "Activer le micro",
      "couperCamera": "Couper la caméra",
      "activerCamera": "Activer la caméra",
      "quitter": "Quitter la réunion",
      "panneau": "Chat et participants",
      "chat": "Chat",
      "participants": "Participants",
      "aucunMessage": "Aucun message pour le moment.",
      "ecrire": "Écrire un message…",
      "rejoindrePourEcrire": "Rejoignez la réunion pour écrire",
      "envoyer": "Envoyer",
      "vous": "vous",
      "microCoupe": "micro coupé",
      "envoyerInvitations": "Envoyer les invitations",
      "enLigne": "en ligne",
      "horsLigne": "hors ligne",
      "debloquer": "Débloquer",
      "retirerModo": "Retirer modérateur",
      "nommerModo": "Nommer modérateur",
      "confirmRetirer": "Retirer {{nom}} de la salle ?",
      "retirer": "Retirer",
      "confirmBloquer": "Bloquer {{nom}} ? Il ne pourra plus entrer dans cette salle.",
      "bloquer": "Bloquer",
      "active": "activé",
      "coupeEtat": "coupé",
      "terminerTous": "Terminer pour tous",
      "aideRoles": "Seuls l’hôte et les modérateurs peuvent inviter, retirer ou bloquer un participant.",
      "role": {
        "hote": "Hôte",
        "moderateur": "Modérateur",
        "participant": "Participant"
      },
      "statut": {
        "invite": "invité",
        "bloque": "bloqué"
      }
    },
    "menu": {
      "room": "Room Live"
    },
    "fab": {
      "n": {
        "room_invitation": "Invitation à la réunion « {{nom}} » ({{par}})"
      }
    }
  },
  "en": {
    "room": {
      "intro": "Live audio and video meetings with chat, for invited participants only.",
      "nouvelle": "New room",
      "chargement": "Loading…",
      "aucune": "No rooms yet: create one and invite your colleagues.",
      "enDirect": "Live",
      "ouverte": "Open",
      "terminee": "Ended",
      "nbMembres": "{{n}} member(s)",
      "invite": "You are invited to this meeting",
      "rejoindre": "Join",
      "historique": "View history",
      "chercher": "Search for a colleague",
      "inviter": "Invite",
      "nomSalle": "Meeting name",
      "description": "Subject (optional)",
      "creer": "Create and join",
      "introuvable": "Room not found",
      "finReunion": "The meeting has ended.",
      "retire": "You have been removed from the room.",
      "bloque": "You have been blocked in this room.",
      "ailleurs": "The room was opened in another window.",
      "sansMedia": "Camera or microphone unavailable: you are joining without audio or video. Check the browser permissions.",
      "coupe": "Connection lost. You can join again.",
      "aucunePiste": "Join again with this device enabled.",
      "confirmFin": "End the meeting for all participants?",
      "terminer": "End",
      "retourListe": "Back to the room list",
      "duree": "Meeting duration",
      "nbParticipants": "{{n}} participant(s)",
      "videos": "Participant videos",
      "pret": "Ready to join? Choose your microphone and camera.",
      "micro": "Microphone",
      "camera": "Camera",
      "connexionEnCours": "Connecting…",
      "entrer": "Join the meeting",
      "confidentialite": "Audio and video go directly between participants, encrypted: they are neither sent to the server nor recorded.",
      "commandes": "Meeting controls",
      "couperMicro": "Mute microphone",
      "activerMicro": "Unmute microphone",
      "couperCamera": "Turn off camera",
      "activerCamera": "Turn on camera",
      "quitter": "Leave the meeting",
      "panneau": "Chat and participants",
      "chat": "Chat",
      "participants": "Participants",
      "aucunMessage": "No messages yet.",
      "ecrire": "Write a message…",
      "rejoindrePourEcrire": "Join the meeting to write",
      "envoyer": "Send",
      "vous": "you",
      "microCoupe": "microphone muted",
      "envoyerInvitations": "Send invitations",
      "enLigne": "online",
      "horsLigne": "offline",
      "debloquer": "Unblock",
      "retirerModo": "Remove moderator",
      "nommerModo": "Make moderator",
      "confirmRetirer": "Remove {{nom}} from the room?",
      "retirer": "Remove",
      "confirmBloquer": "Block {{nom}}? They will no longer be able to enter this room.",
      "bloquer": "Block",
      "active": "on",
      "coupeEtat": "off",
      "terminerTous": "End for everyone",
      "aideRoles": "Only the host and moderators can invite, remove or block a participant.",
      "role": {
        "hote": "Host",
        "moderateur": "Moderator",
        "participant": "Participant"
      },
      "statut": {
        "invite": "invited",
        "bloque": "blocked"
      }
    },
    "menu": {
      "room": "Room Live"
    },
    "fab": {
      "n": {
        "room_invitation": "Invitation to the meeting “{{nom}}” ({{par}})"
      }
    }
  },
  "ar": {
    "room": {
      "intro": "اجتماعات صوتية ومرئية مباشرة مع دردشة، مخصصة للمشاركين المدعوين.",
      "nouvelle": "غرفة جديدة",
      "chargement": "جارٍ التحميل…",
      "aucune": "لا توجد غرف حاليًا: أنشئ غرفة وادعُ زملاءك.",
      "enDirect": "مباشر",
      "ouverte": "مفتوحة",
      "terminee": "منتهية",
      "nbMembres": "{{n}} عضو",
      "invite": "أنت مدعو إلى هذا الاجتماع",
      "rejoindre": "انضمام",
      "historique": "عرض السجل",
      "chercher": "البحث عن زميل",
      "inviter": "دعوة",
      "nomSalle": "اسم الاجتماع",
      "description": "الموضوع (اختياري)",
      "creer": "إنشاء ودخول",
      "introuvable": "الغرفة غير موجودة",
      "finReunion": "انتهى الاجتماع.",
      "retire": "تمت إزالتك من الغرفة.",
      "bloque": "تم حظرك في هذه الغرفة.",
      "ailleurs": "تم فتح الغرفة في نافذة أخرى.",
      "sansMedia": "الكاميرا أو الميكروفون غير متاح: ستدخل دون صوت أو صورة. تحقق من أذونات المتصفح.",
      "coupe": "انقطع الاتصال. يمكنك الانضمام من جديد.",
      "aucunePiste": "انضم من جديد مع تفعيل هذا الجهاز.",
      "confirmFin": "إنهاء الاجتماع لجميع المشاركين؟",
      "terminer": "إنهاء",
      "retourListe": "العودة إلى قائمة الغرف",
      "duree": "مدة الاجتماع",
      "nbParticipants": "{{n}} مشارك",
      "videos": "فيديوهات المشاركين",
      "pret": "مستعد للانضمام؟ اختر الميكروفون والكاميرا.",
      "micro": "الميكروفون",
      "camera": "الكاميرا",
      "connexionEnCours": "جارٍ الاتصال…",
      "entrer": "دخول الاجتماع",
      "confidentialite": "ينتقل الصوت والصورة مباشرة بين المشاركين بشكل مشفر: لا يُرسلان إلى الخادم ولا يُسجَّلان.",
      "commandes": "أدوات التحكم في الاجتماع",
      "couperMicro": "كتم الميكروفون",
      "activerMicro": "تشغيل الميكروفون",
      "couperCamera": "إيقاف الكاميرا",
      "activerCamera": "تشغيل الكاميرا",
      "quitter": "مغادرة الاجتماع",
      "panneau": "الدردشة والمشاركون",
      "chat": "الدردشة",
      "participants": "المشاركون",
      "aucunMessage": "لا توجد رسائل حاليًا.",
      "ecrire": "اكتب رسالة…",
      "rejoindrePourEcrire": "انضم إلى الاجتماع للكتابة",
      "envoyer": "إرسال",
      "vous": "أنت",
      "microCoupe": "الميكروفون مكتوم",
      "envoyerInvitations": "إرسال الدعوات",
      "enLigne": "متصل",
      "horsLigne": "غير متصل",
      "debloquer": "إلغاء الحظر",
      "retirerModo": "إلغاء صفة المشرف",
      "nommerModo": "تعيين مشرف",
      "confirmRetirer": "إزالة {{nom}} من الغرفة؟",
      "retirer": "إزالة",
      "confirmBloquer": "حظر {{nom}}؟ لن يتمكن من دخول هذه الغرفة بعد الآن.",
      "bloquer": "حظر",
      "active": "مفعّل",
      "coupeEtat": "متوقف",
      "terminerTous": "إنهاء للجميع",
      "aideRoles": "وحدهم المضيف والمشرفون يمكنهم دعوة مشارك أو إزالته أو حظره.",
      "role": {
        "hote": "المضيف",
        "moderateur": "مشرف",
        "participant": "مشارك"
      },
      "statut": {
        "invite": "مدعو",
        "bloque": "محظور"
      }
    },
    "menu": {
      "room": "Room Live"
    },
    "fab": {
      "n": {
        "room_invitation": "دعوة إلى الاجتماع « {{nom}} » ({{par}})"
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
  fs.writeFileSync(fichier.replace(/\.json$/, '.avant_room.json.bak'), texte, 'utf8'); // sauvegarde
  const compteur = { n: 0 };
  fusionner(donnees, NOUVEAU[langue], '', compteur);
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2) + '\n', 'utf8');
  console.log(`✅ ${langue}.json : ${compteur.n} traduction(s) ajoutée(s)`);
}
