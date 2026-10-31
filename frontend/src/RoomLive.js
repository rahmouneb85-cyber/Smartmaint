import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from './api';
import { confirmer } from './Confirmation';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';

// ─────────────────────────────────────────────────────────────
// ROOM LIVE : salles de réunion avec audio, vidéo et chat en temps réel
//   • le serveur gère les salles, les rôles et relaie la signalisation par WebSocket ;
//   • le son et l'image passent directement entre navigateurs (WebRTC, chiffré de bout en bout).
// ─────────────────────────────────────────────────────────────

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA' };
const CARTE = { background: 'var(--card, #1a1d2e)', borderRadius: 14, border: '1px solid var(--border, #2a2d3e)' };
const CHAMP = { background: 'var(--input, #0f1117)', color: 'var(--text, #fff)', border: '1px solid var(--border, #333)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' };
const BOUTON = (fond) => ({ background: fond, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', minHeight: 40 });
// boutons ronds façon visioconférence : gris quand le périphérique est actif, rouge quand il est coupé
const ROND = (actif = true, taille = 52) => ({ width: taille, height: taille, borderRadius: taille / 2, border: 'none', cursor: 'pointer', color: '#fff',
  background: actif ? '#3c4043' : '#c5221f', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' });
const RACCROCHER = { height: 52, minWidth: 72, padding: '0 20px', borderRadius: 26, border: 'none', cursor: 'pointer', color: '#fff', background: '#c5221f',
  display: 'flex', alignItems: 'center', justifyContent: 'center' };
const ICONE = { fontSize: 26 };

const entete = (json) => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
async function appeler(chemin, methode = 'GET', corps) {
  const r = await fetch(`${API}${chemin}`, { method: methode, headers: entete(!!corps), body: corps ? JSON.stringify(corps) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : String(r.status));
  return d;
}
const adresseWs = (salleId) => `${API.replace(/^http/, 'ws')}/rooms/ws/${salleId}`;
const partageEcranPossible = () => !!navigator.mediaDevices?.getDisplayMedia;
const taille = (o) => (o < 1024 ? `${o} o` : o < 1048576 ? `${(o / 1024).toFixed(0)} Ko` : `${(o / 1048576).toFixed(1)} Mo`);

// téléchargement avec le jeton de connexion : le fichier n'a jamais d'adresse publique
async function telecharger(salleId, f) {
  const r = await fetch(`${API}/rooms/${salleId}/fichiers/${f.id}`, { headers: entete() });
  if (!r.ok) throw new Error(String(r.status));
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url; a.download = f.nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useEtroit() {
  const [etroit, setEtroit] = useState(window.innerWidth < 600);
  useEffect(() => { const f = () => setEtroit(window.innerWidth < 600); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return etroit;
}

function Initiales({ nom, taille = 64 }) {
  const ini = (nom || '?').split(' ').map(m => m[0]).slice(0, 2).join('').toUpperCase();
  return <span aria-hidden="true" style={{ width: taille, height: taille, borderRadius: taille / 2, background: 'var(--info-fond)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: taille * 0.36 }}>{ini}</span>;
}

function Video({ flux, muet, nom, micro, camera, ecran, moi, tr }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== flux) ref.current.srcObject = flux || null; }, [flux]);
  const image = flux && (camera || ecran) && flux.getVideoTracks().length > 0;
  return (
    <figure style={{ margin: 0, position: 'relative', background: '#0b0d14', borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 10', display: 'flex', alignItems: 'center', justifyContent: 'center',
      gridColumn: ecran ? '1 / -1' : 'auto', order: ecran ? -1 : 0, outline: ecran ? '2px solid #8ab4f8' : 'none' }}>
      <video ref={ref} autoPlay playsInline muted={muet} style={{ width: '100%', height: '100%', objectFit: ecran ? 'contain' : 'cover', display: image ? 'block' : 'none', transform: moi && !ecran ? 'scaleX(-1)' : 'none' }} />
      {ecran && <span style={{ position: 'absolute', top: 8, insetInlineStart: 8, background: '#1a73e8', color: '#fff', borderRadius: 8, padding: '3px 8px', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
        <PresentToAllIcon style={{ fontSize: 16 }} aria-hidden="true" />{moi ? tr('vousPresentez', 'Vous présentez votre écran') : tr('presente', '{{nom}} présente son écran', { nom })}</span>}
      {!image && <Initiales nom={nom} />}
      {!micro && <span aria-hidden="true" style={{ position: 'absolute', top: 8, insetInlineEnd: 8, width: 30, height: 30, borderRadius: 15, background: '#000a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MicOffIcon style={{ fontSize: 18 }} /></span>}
      <figcaption style={{ position: 'absolute', bottom: 8, insetInlineStart: 8, background: '#000a', color: '#fff', borderRadius: 8, padding: '3px 8px', fontSize: 13 }}>
        {nom}{moi ? ` (${tr('vous', 'vous')})` : ''}
        {!micro && <span className="visuellement-cache"> · {tr('microCoupe', 'micro coupé')}</span>}
      </figcaption>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────
// LISTE DES SALLES ET CRÉATION
// ─────────────────────────────────────────────────────────────
function RoomLive({ moi }) {
  const { t, i18n } = useTranslation();
  const tr = (cle, defaut, o = {}) => t('room.' + cle, { defaultValue: defaut, ...o });
  const [salles, setSalles] = useState(null);
  const [active, setActive] = useState(null);
  const [creation, setCreation] = useState(false);
  const [message, setMessage] = useState('');

  const charger = useCallback(() => appeler('/rooms').then(setSalles).catch(() => setSalles([])), []);
  useEffect(() => { charger(); const id = setInterval(charger, 15000); return () => clearInterval(id); }, [charger]);

  if (active) return <Salle id={active} moi={moi} tr={tr} t={t} i18n={i18n} quitter={(m) => { setActive(null); setMessage(m || ''); charger(); }} />;

  const date = (d) => new Date(d).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div>
      <h2 style={{ color: 'var(--accent)', margin: '0 0 6px' }}>🎥 Room Live</h2>
      <p style={{ color: 'var(--muted, #999)', margin: '0 0 14px' }}>{tr('intro', 'Réunions audio et vidéo en direct avec chat, réservées aux participants invités.')}</p>
      {message && <p role="status" style={{ color: 'var(--attention)' }}>{message}</p>}
      <button onClick={() => setCreation(!creation)} aria-expanded={creation} style={{ ...BOUTON('var(--accent-fond)'), marginBottom: 14 }}>＋ {tr('nouvelle', 'Nouvelle salle')}</button>
      {creation && <Creation tr={tr} surCreation={(s) => { setCreation(false); charger(); setActive(s.id); }} />}
      {salles === null && <p>{tr('chargement', 'Chargement…')}</p>}
      {salles?.length === 0 && <p style={{ color: 'var(--muted, #999)' }}>{tr('aucune', 'Aucune salle pour le moment : créez-en une et invitez vos collègues.')}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {salles?.map(s => (
          <article key={s.id} style={{ ...CARTE, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, borderStyle: s.active ? 'solid' : 'dashed' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>{s.nom}</h3>
              {s.active
                ? (s.en_ligne > 0 ? <span className="fab-puce" style={{ background: 'var(--danger-fond)' }}>● {tr('enDirect', 'En direct')} · {s.en_ligne}</span> : <span className="fab-puce">{tr('ouverte', 'Ouverte')}</span>)
                : <span className="fab-puce">{tr('terminee', 'Terminée')}</span>}
            </div>
            {s.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted, #999)' }}>{s.description}</p>}
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #999)' }}>
              {tr('role.' + s.mon_role, s.mon_role)} · {tr('nbMembres', '{{n}} membre(s)', { n: s.membres })} · {date(s.maj)}
            </p>
            {s.mon_statut === 'invite' && s.active && <p style={{ margin: 0, fontSize: 13, color: 'var(--attention)' }}>✉️ {tr('invite', 'Vous êtes invité à cette réunion')}</p>}
            <button onClick={() => setActive(s.id)} style={{ ...BOUTON(s.active ? 'var(--succes-fond)' : 'var(--neutre-fond)'), marginTop: 'auto' }}>
              {s.active ? `🎥 ${tr('rejoindre', 'Rejoindre')}` : `💬 ${tr('historique', 'Voir l’historique')}`}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ChoixContacts({ tr, choisis, surChoix, exclure = [] }) {
  const [q, setQ] = useState('');
  const [contacts, setContacts] = useState([]);
  useEffect(() => {
    const id = setTimeout(() => appeler(`/messagerie/contacts?q=${encodeURIComponent(q)}`).then(setContacts).catch(() => setContacts([])), 250);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('chercher', 'Rechercher un collègue')} aria-label={tr('chercher', 'Rechercher un collègue')} style={{ ...CHAMP, width: '100%' }} />
      <div role="group" aria-label={tr('inviter', 'Inviter')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
        {contacts.filter(c => !exclure.includes(c.id)).map(c => (
          <button key={c.id} type="button" className="fab-filtre" aria-pressed={choisis.includes(c.id)}
            onClick={() => surChoix(choisis.includes(c.id) ? choisis.filter(x => x !== c.id) : [...choisis, c.id])}>{c.nom}</button>
        ))}
      </div>
    </div>
  );
}

function Creation({ tr, surCreation }) {
  const [f, setF] = useState({ nom: '', description: '', invites: [] });
  const [erreur, setErreur] = useState('');
  const creer = async (e) => {
    e.preventDefault();
    try { surCreation(await appeler('/rooms', 'POST', f)); } catch (err) { setErreur(err.message); }
  };
  return (
    <form onSubmit={creer} style={{ ...CARTE, padding: 16, marginBottom: 14, display: 'grid', gap: 10, maxWidth: 640 }}>
      <label>{tr('nomSalle', 'Nom de la réunion')}
        <input required minLength={3} maxLength={100} value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} style={{ ...CHAMP, width: '100%', marginTop: 4 }} />
      </label>
      <label>{tr('description', 'Objet (facultatif)')}
        <input maxLength={500} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} style={{ ...CHAMP, width: '100%', marginTop: 4 }} />
      </label>
      <div>
        <div style={{ marginBottom: 4 }}>{tr('inviter', 'Inviter')} ({f.invites.length})</div>
        <ChoixContacts tr={tr} choisis={f.invites} surChoix={(invites) => setF({ ...f, invites })} />
      </div>
      {erreur && <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{erreur}</p>}
      <button type="submit" style={BOUTON('var(--accent-fond)')}>🎥 {tr('creer', 'Créer et entrer')}</button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// SALLE : audio, vidéo, chat, participants
// ─────────────────────────────────────────────────────────────
function Salle({ id, moi, tr, t, i18n, quitter }) {
  const [salle, setSalle] = useState(null);
  const [etat, setEtat] = useState('accueil');               // accueil | connexion | direct
  const [options, setOptions] = useState({ micro: true, camera: true });
  const [local, setLocal] = useState(null);
  const [pairs, setPairs] = useState({});                     // id → { nom, role, micro, camera, flux }
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState('');
  const [panneau, setPanneau] = useState('chat');
  const [alerte, setAlerte] = useState('');
  const [debut, setDebut] = useState(null);
  const [maintenant, setMaintenant] = useState(Date.now());
  const ws = useRef(null);
  const connexions = useRef({});                              // id → RTCPeerConnection
  const enAttente = useRef({});                               // candidats reçus avant la description distante
  const fluxLocal = useRef(null);
  const ice = useRef([]);
  const finChat = useRef(null);
  const file = useRef(Promise.resolve());                     // messages traités dans l'ordre d'arrivée
  const fluxDistants = useRef({});                            // id → flux reçu (son, caméra ou écran)
  const ecranRef = useRef(null);                              // piste du partage d'écran en cours
  const [partage, setPartage] = useState(false);
  const [info, setInfo] = useState('');
  const [envoiFichier, setEnvoiFichier] = useState(false);
  const choixFichier = useRef(null);
  const etroit = useEtroit();

  const chargerSalle = useCallback(() => appeler(`/rooms/${id}`).then(setSalle).catch(() => quitter(tr('introuvable', 'Salle introuvable'))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identifiant de la salle seulement
    [id]);
  useEffect(() => { chargerSalle(); appeler(`/rooms/${id}/messages`).then(setMessages).catch(() => {}); }, [id, chargerSalle]);
  useEffect(() => { finChat.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  useEffect(() => { if (!debut) return; const x = setInterval(() => setMaintenant(Date.now()), 1000); return () => clearInterval(x); }, [debut]);

  const envoyer = (m) => { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(m)); };
  const majPair = (pid, champs) => setPairs(p => ({ ...p, [pid]: { ...(p[pid] || {}), ...champs } }));

  const fermerPair = (pid) => {
    connexions.current[pid]?.close();
    delete connexions.current[pid];
    delete fluxDistants.current[pid];
    delete enAttente.current[pid];
    setPairs(p => { const c = { ...p }; delete c[pid]; return c; });
  };

  const nettoyer = useCallback(() => {
    Object.keys(connexions.current).forEach(pid => connexions.current[pid].close());
    connexions.current = {};
    fluxDistants.current = {};
    fluxLocal.current?.getTracks().forEach(tr_ => tr_.stop());
    fluxLocal.current = null;
    ecranRef.current?.stop();
    ecranRef.current = null;
    if (ws.current) { ws.current.onclose = null; ws.current.close(); ws.current = null; }
  }, []);
  useEffect(() => nettoyer, [nettoyer]);

  // connexion directe avec un autre participant
  // piste envoyée aux autres : le micro, et pour l'image l'écran partagé s'il existe, sinon la caméra
  const pisteSortante = (genre) => (genre === 'video' && ecranRef.current) || fluxLocal.current?.getTracks().find(p => p.kind === genre) || null;
  // remplace la piste envoyée à tous les participants, sans renégocier la connexion
  const remplacer = async (genre) => {
    for (const pc of Object.values(connexions.current)) {
      const t = pc.getTransceivers().find(x => x.receiver.track?.kind === genre);
      if (t) { try { await t.sender.replaceTrack(pisteSortante(genre)); } catch { /* connexion fermée */ } }
    }
  };
  const majApercu = () => {
    const pistes = [pisteSortante('video')].filter(Boolean);
    setLocal(pistes.length ? new MediaStream(pistes) : null);
  };
  // connexion directe avec un autre participant ; chaque connexion prévoit toujours un canal son et un canal image
  // dans les deux sens, pour pouvoir activer la caméra ou partager l'écran plus tard sans renégocier
  const connexion = (pid, offreur = false) => {
    if (connexions.current[pid]) return connexions.current[pid];
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    connexions.current[pid] = pc;
    if (offreur) ['audio', 'video'].forEach(genre => pc.addTransceiver(pisteSortante(genre) || genre, { direction: 'sendrecv' }));
    pc.onicecandidate = (e) => { if (e.candidate) envoyer({ type: 'signal', cible: pid, donnees: { candidat: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const flux = fluxDistants.current[pid] || (fluxDistants.current[pid] = new MediaStream());
      flux.getTracks().filter(p => p.kind === e.track.kind && p !== e.track).forEach(p => flux.removeTrack(p));
      if (!flux.getTracks().includes(e.track)) flux.addTrack(e.track);
      majPair(pid, { flux, pistes: flux.getTracks().length });
    };
    pc.onconnectionstatechange = () => majPair(pid, { liaison: pc.connectionState });
    return pc;
  };
  const appliquerCandidats = async (pid) => {
    const pc = connexions.current[pid];
    for (const c of enAttente.current[pid] || []) { try { await pc.addIceCandidate(c); } catch { /* candidat obsolète */ } }
    enAttente.current[pid] = [];
  };
  const offrir = async (pid) => {
    const pc = connexion(pid, true);
    const offre = await pc.createOffer();
    await pc.setLocalDescription(offre);
    envoyer({ type: 'signal', cible: pid, donnees: { sdp: pc.localDescription.toJSON() } });
  };
  const recevoirSignal = async (de, d) => {
    if (d.sdp) {
      const pc = connexion(de);
      await pc.setRemoteDescription(d.sdp);
      await appliquerCandidats(de);
      if (d.sdp.type === 'offer') {
        for (const t of pc.getTransceivers()) {
          t.direction = 'sendrecv';
          await t.sender.replaceTrack(pisteSortante(t.receiver.track.kind));
        }
        await pc.setLocalDescription(await pc.createAnswer());
        envoyer({ type: 'signal', cible: de, donnees: { sdp: pc.localDescription.toJSON() } });
      }
    } else if (d.candidat) {
      const pc = connexions.current[de];
      if (pc?.remoteDescription) { try { await pc.addIceCandidate(d.candidat); } catch { /* ignoré */ } }
      else (enAttente.current[de] = enAttente.current[de] || []).push(d.candidat);
    }
  };

  const recevoir = async (m) => {
    if (m.type === 'bienvenue') {
      ice.current = m.ice || [];
      setEtat('direct'); setDebut(Date.now());
      m.participants.forEach(p => majPair(p.id, p));
      for (const p of m.participants) await offrir(p.id);          // le nouvel arrivant appelle chacun
    } else if (m.type === 'arrivee') {
      majPair(m.participant.id, m.participant);
      chargerSalle();                                            // une invitation devient « membre » à la première entrée
    } else if (m.type === 'depart') {
      fermerPair(m.id);
    } else if (m.type === 'signal') {
      await recevoirSignal(m.de, m.donnees);
    } else if (m.type === 'media') {
      majPair(m.id, { micro: m.micro, camera: m.camera, ecran: m.ecran });
    } else if (m.type === 'chat') {
      setMessages(l => [...l, m.message]);
    } else if (m.type === 'membres') {
      chargerSalle();
    } else if (m.type === 'fichier_retire') {
      appeler(`/rooms/${id}/messages`).then(setMessages).catch(() => {});
    } else if (m.type === 'moderation') {
      const pistes = fluxLocal.current?.getTracks().filter(p => p.kind === (m.peripherique === 'micro' ? 'audio' : 'video')) || [];
      pistes.forEach(p => { p.enabled = false; });
      setOptions(o => { const n = { ...o, [m.peripherique]: false }; envoyer({ type: 'media', micro: n.micro, camera: n.camera, ecran: !!ecranRef.current }); return n; });
      setInfo(m.peripherique === 'micro' ? tr('microCoupePar', '{{par}} a coupé votre micro.', { par: m.par }) : tr('cameraCoupeePar', '{{par}} a coupé votre caméra.', { par: m.par }));
    } else if (m.type === 'expulse') {
      const textes = { fin: tr('finReunion', 'La réunion est terminée.'), retirer: tr('retire', 'Vous avez été retiré de la salle.'),
        bloquer: tr('bloque', 'Vous avez été bloqué dans cette salle.'), ailleurs: tr('ailleurs', 'La salle a été ouverte dans une autre fenêtre.'), quitte: '' };
      nettoyer(); quitter(textes[m.raison] ?? '');
    } else if (m.type === 'erreur') {
      setAlerte(m.detail);
    }
  };

  const entrer = async () => {
    setEtat('connexion'); setAlerte('');
    let flux = null;
    if (options.micro || options.camera) {
      try { flux = await navigator.mediaDevices.getUserMedia({ audio: options.micro, video: options.camera ? { width: 640, height: 400 } : false }); }
      catch { setAlerte(tr('sansMedia', 'Caméra ou micro indisponible : vous entrez sans son ni image. Vérifiez les autorisations du navigateur.')); }
    }
    fluxLocal.current = flux; majApercu();
    const socket = new WebSocket(adresseWs(id));
    ws.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: localStorage.getItem('token') }));
      socket.send(JSON.stringify({ type: 'media', micro: !!flux?.getAudioTracks().length, camera: !!flux?.getVideoTracks().length, ecran: false }));
    };
    socket.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      file.current = file.current.then(() => recevoir(m)).catch(() => { /* négociation abandonnée : le pair sera recréé */ });
    };
    socket.onclose = (e) => {
      if (ws.current !== socket) return;
      nettoyer(); setEtat('accueil'); setPairs({}); setLocal(null);
      if (e.code !== 1000) setAlerte(prev => prev || tr('coupe', 'Connexion interrompue. Vous pouvez rejoindre de nouveau.'));
    };
  };

  const etatMedia = () => ({ micro: !!fluxLocal.current?.getAudioTracks()[0]?.enabled, camera: !!fluxLocal.current?.getVideoTracks()[0]?.enabled, ecran: !!ecranRef.current });
  const annoncer = () => { const e = etatMedia(); setOptions({ micro: e.micro, camera: e.camera }); envoyer({ type: 'media', ...e }); };
  const basculer = async (genre) => {
    const sorte = genre === 'micro' ? 'audio' : 'video';
    const pistes = fluxLocal.current?.getTracks().filter(p => p.kind === sorte) || [];
    if (!pistes.length) {
      // périphérique non activé à l'entrée : on le demande maintenant et on l'envoie à tous
      try {
        const nouveau = await navigator.mediaDevices.getUserMedia(sorte === 'audio' ? { audio: true } : { video: { width: 640, height: 400 } });
        if (!fluxLocal.current) fluxLocal.current = new MediaStream();
        nouveau.getTracks().forEach(p => fluxLocal.current.addTrack(p));
        await remplacer(sorte); majApercu();
      } catch { setAlerte(tr('sansPeripherique', 'Ce périphérique est indisponible. Vérifiez les autorisations du navigateur.')); return; }
    } else {
      pistes.forEach(p => { p.enabled = !p.enabled; });
    }
    setInfo(''); annoncer();
  };
  const arreterPartage = async () => {
    ecranRef.current?.stop();
    ecranRef.current = null;
    setPartage(false);
    await remplacer('video'); majApercu(); annoncer();
  };
  const partagerEcran = async () => {
    if (ecranRef.current) { await arreterPartage(); return; }
    try {
      const flux = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const piste = flux.getVideoTracks()[0];
      piste.onended = arreterPartage;                           // « Arrêter le partage » du navigateur
      ecranRef.current = piste;
      setPartage(true);
      await remplacer('video'); majApercu(); annoncer();
    } catch { /* partage annulé par l'utilisateur */ }
  };
  const envoyerFichier = async (fichier) => {
    if (!fichier) return;
    setEnvoiFichier(true); setAlerte('');
    const donnees = new FormData();
    donnees.append('fichier', fichier, fichier.name);
    try {
      const r = await fetch(`${API}/rooms/${id}/fichiers`, { method: 'POST', headers: entete(), body: donnees });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : String(r.status));
    } catch (e) { setAlerte(e.message); }
    setEnvoiFichier(false);
    if (choixFichier.current) choixFichier.current.value = '';
  };
  const sortir = () => { nettoyer(); quitter(''); };
  const terminer = async () => {
    if (!(await confirmer(tr('confirmFin', 'Terminer la réunion pour tous les participants ?'), { ok: tr('terminer', 'Terminer') }))) return;
    try { await appeler(`/rooms/${id}/terminer`, 'POST'); } catch (e) { setAlerte(e.message); }
  };
  const ecrire = (e) => {
    e.preventDefault();
    const texte = saisie.trim();
    if (!texte) return;
    envoyer({ type: 'chat', texte }); setSaisie('');
  };

  if (!salle) return <p>{tr('chargement', 'Chargement…')}</p>;
  const gestion = ['hote', 'moderateur'].includes(salle.mon_role);
  const duree = debut ? new Date(maintenant - debut).toISOString().slice(11, 19) : '';
  const heure = (d) => new Date(d).toLocaleTimeString(LOCALES[i18n.language] || 'fr-FR', { hour: '2-digit', minute: '2-digit' });
  const enLigne = new Set([moi?.id, ...Object.keys(pairs).map(Number)]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={sortir} className="fab-filtre" aria-label={tr('retourListe', 'Retour à la liste des salles')}><span aria-hidden="true">{i18n.dir() === 'rtl' ? '→' : '←'}</span></button>
        <h2 style={{ margin: 0, color: 'var(--accent)', flex: 1, minWidth: 180 }}>🎥 {salle.nom}</h2>
        {etat === 'direct' && <span className="fab-puce" style={{ background: 'var(--danger-fond)', fontSize: 13 }} role="timer" aria-label={tr('duree', 'Durée de la réunion')}>● {tr('enDirect', 'En direct')} {duree}</span>}
        <span className="fab-puce">{tr('nbParticipants', '{{n}} participant(s)', { n: etat === 'direct' ? Object.keys(pairs).length + 1 : 0 })}</span>
      </div>
      {alerte && <p role="alert" style={{ color: 'var(--attention)', margin: '0 0 10px' }}>⚠️ {alerte}</p>}
      {info && <p role="status" style={{ color: 'var(--info)', margin: '0 0 10px' }}>ℹ️ {info}</p>}

      <div className="room-grille">
        <section aria-label={tr('videos', 'Vidéos des participants')} style={{ ...CARTE, padding: 12, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {etat !== 'direct' ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
              {!salle.active ? <p>{tr('finReunion', 'La réunion est terminée.')}</p> : <>
                <p style={{ margin: 0 }}>{tr('pret', 'Prêt à rejoindre ? Choisissez votre micro et votre caméra.')}</p>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[['micro', MicIcon, MicOffIcon, tr('micro', 'Micro')], ['camera', VideocamIcon, VideocamOffIcon, tr('camera', 'Caméra')]].map(([k, Allume, Eteint, l]) => (
                    <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={() => setOptions({ ...options, [k]: !options[k] })} aria-pressed={options[k]} aria-label={l} style={ROND(options[k], 56)}>
                        {options[k] ? <Allume style={ICONE} /> : <Eteint style={ICONE} />}
                      </button>
                      <span style={{ fontSize: 13 }}>{l} · {options[k] ? tr('active', 'activé') : tr('coupeEtat', 'coupé')}</span>
                    </div>
                  ))}
                </div>
                <button onClick={entrer} disabled={etat === 'connexion'} style={BOUTON('var(--succes-fond)')}>{etat === 'connexion' ? tr('connexionEnCours', 'Connexion…') : `🎥 ${tr('entrer', 'Entrer dans la réunion')}`}</button>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #999)' }}>{tr('confidentialite', 'Le son et l’image passent directement entre les participants, chiffrés : ils ne sont ni transmis au serveur ni enregistrés.')}</p>
              </>}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${etroit ? 140 : 220}px, 1fr))`, gap: 10 }}>
                <Video flux={local} muet moi nom={moi?.nom} micro={options.micro && !!fluxLocal.current?.getAudioTracks().length} camera={options.camera} ecran={partage} tr={tr} />
                {Object.entries(pairs).map(([pid, p]) => <Video key={pid} flux={p.flux} nom={p.nom} micro={p.micro} camera={p.camera} ecran={p.ecran} tr={tr} />)}
              </div>
              <div role="toolbar" aria-label={tr('commandes', 'Commandes de la réunion')} className="room-commandes"
                style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', background: '#202124', borderRadius: 40, padding: '10px 16px', alignSelf: 'center' }}>
                <button onClick={() => basculer('micro')} style={ROND(options.micro, etroit ? 46 : 52)} aria-pressed={!options.micro} title={options.micro ? tr('couperMicro', 'Couper le micro') : tr('activerMicro', 'Activer le micro')}
                  aria-label={options.micro ? tr('couperMicro', 'Couper le micro') : tr('activerMicro', 'Activer le micro')}>{options.micro ? <MicIcon style={ICONE} /> : <MicOffIcon style={ICONE} />}</button>
                <button onClick={() => basculer('camera')} style={ROND(options.camera, etroit ? 46 : 52)} aria-pressed={!options.camera} title={options.camera ? tr('couperCamera', 'Couper la caméra') : tr('activerCamera', 'Activer la caméra')}
                  aria-label={options.camera ? tr('couperCamera', 'Couper la caméra') : tr('activerCamera', 'Activer la caméra')}>{options.camera ? <VideocamIcon style={ICONE} /> : <VideocamOffIcon style={ICONE} />}</button>
                {partageEcranPossible() && (
                  <button onClick={partagerEcran} aria-pressed={partage} title={partage ? tr('arreterPartage', 'Arrêter la présentation') : tr('partagerEcran', 'Présenter votre écran')}
                    aria-label={partage ? tr('arreterPartage', 'Arrêter la présentation') : tr('partagerEcran', 'Présenter votre écran')}
                    style={{ ...ROND(true, etroit ? 46 : 52), background: partage ? '#8ab4f8' : '#3c4043', color: partage ? '#202124' : '#fff' }}>
                    {partage ? <CancelPresentationIcon style={ICONE} /> : <PresentToAllIcon style={ICONE} />}
                  </button>
                )}
                <button onClick={sortir} style={RACCROCHER} title={tr('quitter', 'Quitter la réunion')} aria-label={tr('quitter', 'Quitter la réunion')}><CallEndIcon style={ICONE} /></button>
                {salle.mon_role === 'hote' && <button onClick={terminer} style={{ ...BOUTON('transparent'), border: '1px solid #9aa0a6', borderRadius: 26, minHeight: 52 }}>{tr('terminerTous', 'Terminer pour tous')}</button>}
              </div>
            </>
          )}
        </section>

        <aside className="room-panneau" style={{ ...CARTE, display: 'flex', flexDirection: 'column', minHeight: 420, maxHeight: '75vh' }} aria-label={tr('panneau', 'Chat et participants')}>
          <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border, #2a2d3e)' }}>
            {[['chat', '💬', tr('chat', 'Chat')], ['participants', '👥', tr('participants', 'Participants')], ['fichiers', '📎', tr('fichiers', 'Fichiers')]].map(([k, ic, l]) => (
              <button key={k} role="tab" aria-selected={panneau === k} onClick={() => setPanneau(k)}
                style={{ flex: 1, padding: '12px 6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold', background: panneau === k ? 'var(--info-fond)' : 'transparent', color: panneau === k ? '#fff' : 'var(--text, #fff)', borderRadius: '14px 14px 0 0' }}>
                <span aria-hidden="true">{ic}</span> {l}
              </button>
            ))}
          </div>
          {panneau === 'chat' ? (
            <>
              <div role="log" aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.length === 0 && <p style={{ color: 'var(--muted, #999)', margin: 0 }}>{tr('aucunMessage', 'Aucun message pour le moment.')}</p>}
                {messages.map(m => m.type === 'systeme'
                  ? <p key={m.id} style={{ margin: 0, fontSize: 12, color: 'var(--muted, #999)', textAlign: 'center' }}>{m.texte}</p>
                  : (
                    <div key={m.id} style={{ alignSelf: m.auteur?.id === moi?.id ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted, #999)' }}>{m.auteur?.nom} · {heure(m.date)}</div>
                      {m.type === 'fichier' && m.fichier
                        ? <CarteFichier f={m.fichier} salleId={id} tr={tr} surErreur={setAlerte} />
                        : <div style={{ background: m.auteur?.id === moi?.id ? 'var(--accent-fond)' : 'var(--bg, #0f1117)', color: m.auteur?.id === moi?.id ? '#fff' : 'var(--text, #fff)', padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.texte}</div>}
                    </div>
                  ))}
                <div ref={finChat} />
              </div>
              <form onSubmit={ecrire} style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border, #2a2d3e)' }}>
                <input ref={choixFichier} type="file" className="visuellement-cache" tabIndex={-1} aria-hidden="true"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.pptx,.doc,.xls,.txt,.csv" onChange={e => envoyerFichier(e.target.files?.[0])} />
                <button type="button" onClick={() => choixFichier.current?.click()} disabled={etat !== 'direct' || envoiFichier}
                  title={tr('joindreFichier', 'Partager un fichier')} aria-label={tr('joindreFichier', 'Partager un fichier')}
                  style={{ ...BOUTON('var(--neutre-fond)'), padding: '8px 10px', display: 'flex', alignItems: 'center' }}>
                  {envoiFichier ? '…' : <AttachFileIcon style={{ fontSize: 20 }} />}
                </button>
                <input value={saisie} onChange={e => setSaisie(e.target.value)} maxLength={2000} disabled={etat !== 'direct'}
                  placeholder={etat === 'direct' ? tr('ecrire', 'Écrire un message…') : tr('rejoindrePourEcrire', 'Rejoignez la réunion pour écrire')}
                  aria-label={tr('ecrire', 'Écrire un message…')} style={{ ...CHAMP, flex: 1, minWidth: 0 }} />
                <button type="submit" disabled={etat !== 'direct' || !saisie.trim()} style={BOUTON('var(--accent-fond)')} aria-label={tr('envoyer', 'Envoyer')}>➤</button>
              </form>
            </>
          ) : panneau === 'participants' ? (
            <Participants salle={salle} tr={tr} t={t} gestion={gestion} enLigne={enLigne} moi={moi} surChangement={chargerSalle} surErreur={setAlerte} surInfo={setInfo} />
          ) : (
            <ListeFichiers salleId={id} tr={tr} i18n={i18n} majs={messages.length} surErreur={setAlerte} />
          )}
        </aside>
      </div>
    </div>
  );
}

function CarteFichier({ f, salleId, tr, surErreur }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg, #0f1117)', border: '1px solid var(--border, #2a2d3e)', borderRadius: 12, padding: '8px 10px' }}>
      <span aria-hidden="true" style={{ fontSize: 22 }}>{f.image ? '🖼️' : f.type === 'application/pdf' ? '📕' : '📄'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', overflowWrap: 'anywhere', fontSize: 13 }}>{f.nom}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted, #999)' }}>{taille(f.taille)}</span>
      </span>
      <button onClick={() => telecharger(salleId, f).catch(() => surErreur(tr('telechargementImpossible', 'Téléchargement impossible.')))} className="fab-filtre"
        aria-label={tr('telechargerNom', 'Télécharger {{nom}}', { nom: f.nom })} title={tr('telecharger', 'Télécharger')}>
        <DownloadIcon style={{ fontSize: 18, verticalAlign: 'middle' }} />
      </button>
    </div>
  );
}

function ListeFichiers({ salleId, tr, i18n, majs, surErreur }) {
  const [liste, setListe] = useState(null);
  useEffect(() => { appeler(`/rooms/${salleId}/fichiers`).then(setListe).catch(() => setListe([])); }, [salleId, majs]);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #999)' }}>{tr('aideFichiers', 'Documents partagés pendant la réunion, visibles par les seuls membres de la salle.')}</p>
      {liste?.length === 0 && <p style={{ margin: 0, color: 'var(--muted, #999)' }}>{tr('aucunFichier', 'Aucun fichier partagé.')}</p>}
      {liste?.map(f => (
        <div key={f.id}>
          <CarteFichier f={f} salleId={salleId} tr={tr} surErreur={surErreur} />
          <span style={{ fontSize: 11, color: 'var(--muted, #999)' }}>{new Date(f.date).toLocaleString(LOCALES[i18n.language] || 'fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      ))}
    </div>
  );
}

function Participants({ salle, tr, t, gestion, enLigne, moi, surChangement, surErreur, surInfo }) {
  const [invites, setInvites] = useState([]);
  const [ajout, setAjout] = useState(false);
  const agir = async (chemin, methode = 'POST', corps, question) => {
    if (question && !(await confirmer(question))) return;
    try { await appeler(chemin, methode, corps); surChangement(); } catch (e) { surErreur(e.message); }
  };
  const nomRole = (r) => tr('role.' + r, r);
  const couper = async (m, peripherique) => {
    try {
      await appeler(`/rooms/${salle.id}/membres/${m.id}/couper`, 'POST', { peripherique });
      surInfo(peripherique === 'micro' ? tr('demandeMicro', 'Micro de {{nom}} coupé.', { nom: m.nom }) : tr('demandeCamera', 'Caméra de {{nom}} coupée.', { nom: m.nom }));
    } catch (e) { surErreur(e.message); }
  };
  const couperTous = async () => {
    try { const r = await appeler(`/rooms/${salle.id}/couper-micros`, 'POST'); surInfo(tr('microsCoupes', '{{n}} micro(s) coupé(s).', { n: r.participants })); } catch (e) { surErreur(e.message); }
  };
  const membres = [...salle.membres].sort((a, b) => Number(enLigne.has(b.id)) - Number(enLigne.has(a.id)));
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {gestion && salle.active && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setAjout(!ajout)} aria-expanded={ajout} className="fab-filtre" style={{ flex: 1 }}>＋ {tr('inviter', 'Inviter')}</button>
            <button onClick={couperTous} className="fab-filtre" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <MicOffIcon style={{ fontSize: 18 }} aria-hidden="true" />{tr('couperTous', 'Couper tous les micros')}</button>
          </div>
          {ajout && <div style={{ display: 'grid', gap: 8 }}>
            <ChoixContacts tr={tr} choisis={invites} surChoix={setInvites} exclure={salle.membres.map(m => m.id)} />
            <button disabled={!invites.length} onClick={async () => { await agir(`/rooms/${salle.id}/invitations`, 'POST', { utilisateurs: invites }); setInvites([]); setAjout(false); }} style={BOUTON('var(--info-fond)')}>
              {tr('envoyerInvitations', 'Envoyer les invitations')} ({invites.length})</button>
          </div>}
        </>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {membres.map(m => (
          <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 6, borderRadius: 8, background: 'var(--bg, #0f1117)' }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: enLigne.has(m.id) ? 'var(--succes)' : 'var(--neutre)' }} />
            <span style={{ flex: 1, minWidth: 120 }}>
              {m.nom}{m.id === moi?.id ? ` (${tr('vous', 'vous')})` : ''}
              <span style={{ display: 'block', fontSize: 12, color: 'var(--muted, #999)' }}>
                {nomRole(m.role)} · {m.statut === 'invite' ? tr('statut.invite', 'invité') : m.statut === 'bloque' ? tr('statut.bloque', 'bloqué') : (enLigne.has(m.id) ? tr('enLigne', 'en ligne') : tr('horsLigne', 'hors ligne'))}
              </span>
            </span>
            {gestion && m.id !== moi?.id && m.role !== 'hote' && (salle.mon_role === 'hote' || m.role === 'participant') && (
              m.statut === 'bloque'
                ? <button className="fab-filtre" onClick={() => agir(`/rooms/${salle.id}/membres/${m.id}/debloquer`)}>{tr('debloquer', 'Débloquer')}</button>
                : <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {enLigne.has(m.id) && <>
                      <button className="fab-filtre" onClick={() => couper(m, 'micro')} aria-label={tr('couperMicroDe', 'Couper le micro de {{nom}}', { nom: m.nom })} title={tr('couperMicroDe', 'Couper le micro de {{nom}}', { nom: m.nom })}>
                        <MicOffIcon style={{ fontSize: 18, verticalAlign: 'middle' }} /></button>
                      <button className="fab-filtre" onClick={() => couper(m, 'camera')} aria-label={tr('couperCameraDe', 'Couper la caméra de {{nom}}', { nom: m.nom })} title={tr('couperCameraDe', 'Couper la caméra de {{nom}}', { nom: m.nom })}>
                        <VideocamOffIcon style={{ fontSize: 18, verticalAlign: 'middle' }} /></button>
                    </>}
                    {salle.mon_role === 'hote' && <button className="fab-filtre" onClick={() => agir(`/rooms/${salle.id}/membres/${m.id}/role`, 'PUT', { role: m.role === 'moderateur' ? 'participant' : 'moderateur' })}>
                      {m.role === 'moderateur' ? tr('retirerModo', 'Retirer modérateur') : tr('nommerModo', 'Nommer modérateur')}</button>}
                    <button className="fab-filtre" onClick={() => agir(`/rooms/${salle.id}/membres/${m.id}/retirer`, 'POST', null, tr('confirmRetirer', 'Retirer {{nom}} de la salle ?', { nom: m.nom }))}>{tr('retirer', 'Retirer')}</button>
                    <button className="fab-filtre" style={{ color: 'var(--danger)' }} onClick={() => agir(`/rooms/${salle.id}/membres/${m.id}/bloquer`, 'POST', null, tr('confirmBloquer', 'Bloquer {{nom}} ? Il ne pourra plus entrer dans cette salle.', { nom: m.nom }))}>{tr('bloquer', 'Bloquer')}</button>
                  </span>
            )}
          </li>
        ))}
      </ul>
      {!gestion && <p style={{ fontSize: 12, color: 'var(--muted, #999)', margin: 0 }}>{t('room.aideRoles', { defaultValue: 'Seuls l’hôte et les modérateurs peuvent inviter, retirer ou bloquer un participant.' })}</p>}
    </div>
  );
}

export default RoomLive;
