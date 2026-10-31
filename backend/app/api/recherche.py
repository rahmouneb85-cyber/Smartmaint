"""Recherche intelligente du bouton flottant.

Une seule requête cherche dans les équipements, les interventions, les documents, les demandes de support,
les workflows et les comptes, en appliquant exactement les mêmes droits que les pages de l'application :
  • équipements et interventions : tous les comptes connectés (comme les pages correspondantes) ;
  • documents et demandes de support : les siens, ou tous pour les administrateurs et superviseurs ;
  • workflows : administrateurs et superviseurs ;
  • comptes : fiche complète pour l'administrateur, simple nom de collègue (sans email) pour les autres.
Aucune donnée n'est envoyée à un modèle de langage : la recherche est rapide et reste confidentielle.

« Intelligente » : chaque mot doit être trouvé dans au moins un champ (ordre libre), les accents et les
majuscules sont ignorés, « #12 » ou « intervention 12 » retrouvent l'objet par son numéro, et les mots de
statut (panne, urgente, en cours, terminée…) filtrent directement par statut ou priorité.
"""
import re
import unicodedata

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.api.messagerie import contacts_autorises
from app.api.support import demandes_visibles, est_gestion
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.document_idp import DocumentIDP
from app.models.equipment import Equipment
from app.models.support import DemandeSupport
from app.models.intervention import Intervention
from app.models.user import User
from app.models.workflow import Workflow

router = APIRouter(prefix="/recherche", tags=["Recherche"])

PAR_GROUPE = 5

# mots reconnus (sans accents) → filtre sur un statut ou une priorité
STATUTS_EQUIPEMENT = {"panne": "panne", "pannes": "panne", "maintenance": "maintenance", "actif": "actif", "actifs": "actif",
                      "breakdown": "panne", "down": "panne"}
STATUTS_INTERVENTION = {"planifiee": "planifiee", "planifiees": "planifiee", "planned": "planifiee", "encours": "en_cours",
                        "terminee": "terminee", "terminees": "terminee", "done": "terminee", "completed": "terminee"}
PRIORITES = {"urgente": "urgente", "urgentes": "urgente", "urgent": "urgente", "haute": "haute", "high": "haute"}
MOTS_VIDES = {"le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "a", "au", "aux", "the", "of", "and"}
TYPES = {"intervention": "interventions", "interventions": "interventions", "equipement": "equipements",
         "equipements": "equipements", "machine": "equipements", "document": "documents", "documents": "documents"}


def sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn")


def _echapper(mot: str) -> str:
    return mot.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _condition(colonnes, mot: str):
    """Le mot apparaît dans l'une des colonnes (insensible à la casse ; MySQL ignore aussi les accents)."""
    motif = f"%{_echapper(mot)}%"
    return or_(*[c.ilike(motif, escape="\\") for c in colonnes])


def analyser(q: str) -> dict:
    """Découpe la recherche en mots, numéro, statuts et type d'objet demandés."""
    brut = sans_accents(q).replace("en cours", "encours").replace("in progress", "encours")
    numero = None
    m = re.search(r"#\s*(\d+)", brut) or re.fullmatch(r"\s*(?:[a-z]+\s+)?(\d+)\s*", brut)
    if m:
        numero = int(m.group(1))
    mots, filtres, type_vise = [], {}, None
    for mot in re.findall(r"[\w@.\-]+", brut):
        if mot in STATUTS_EQUIPEMENT:
            filtres["equipement"] = STATUTS_EQUIPEMENT[mot]
        elif mot in STATUTS_INTERVENTION:
            filtres["intervention"] = STATUTS_INTERVENTION[mot]
        elif mot in PRIORITES:
            filtres["priorite"] = PRIORITES[mot]
        elif mot in TYPES:
            type_vise = TYPES[mot]
        elif mot not in MOTS_VIDES and not mot.isdigit():
            mots.append(mot)
    # mots d'origine (avec accents) pour la recherche en base : MySQL compare sans tenir compte des accents
    originaux = [w for w in re.findall(r"[\w@.\-]+", q.lower()) if sans_accents(w) in mots]
    return {"mots": originaux or mots, "numero": numero, "filtres": filtres, "type": type_vise}


def _tous_les_mots(requete, colonnes, mots):
    for mot in mots:
        requete = requete.filter(_condition(colonnes, mot))
    return requete


def _val(x):
    return getattr(x, "value", x)


def _equipements(db, a):
    mots, numero, filtres = a["mots"], a["numero"], a["filtres"]
    if "intervention" in filtres or "priorite" in filtres:
        return []
    req = db.query(Equipment)
    if "equipement" in filtres:
        req = req.filter(Equipment.statut == filtres["equipement"])
    if numero is not None and not mots:
        if a["type"] != "equipements":
            return []                     # « #12 » désigne une intervention ou une demande, pas un équipement
        req = req.filter(Equipment.id == numero)
    req = _tous_les_mots(req, [Equipment.nom, Equipment.type, Equipment.localisation], mots)
    return [{"id": e.id, "titre": e.nom, "detail": " · ".join(filter(None, [e.type, e.localisation])),
             "statut": _val(e.statut), "page": "equipements"} for e in req.order_by(Equipment.nom).limit(PAR_GROUPE)]


def _interventions(db, a):
    mots, numero, filtres = a["mots"], a["numero"], a["filtres"]
    if "equipement" in filtres:
        return []
    req = db.query(Intervention).outerjoin(Equipment, Intervention.equipement_id == Equipment.id)
    if "intervention" in filtres:
        req = req.filter(Intervention.statut == filtres["intervention"])
    if "priorite" in filtres:
        req = req.filter(Intervention.priorite == filtres["priorite"])
    if numero is not None and not mots:
        req = req.filter(Intervention.id == numero)
    req = _tous_les_mots(req, [Intervention.description, Intervention.diagnostic, Equipment.nom, cast(Intervention.id, String)], mots)
    liste = req.order_by(Intervention.created_at.desc()).limit(PAR_GROUPE).all()
    noms = {e.id: e.nom for e in db.query(Equipment).filter(Equipment.id.in_({i.equipement_id for i in liste}))} if liste else {}
    return [{"id": i.id, "titre": f"#{i.id} · {noms.get(i.equipement_id, '—')}", "detail": (i.description or "")[:90],
             "statut": _val(i.statut), "priorite": _val(i.priorite), "page": "interventions"} for i in liste]


def _documents(db, a, user, gestion):
    req = db.query(DocumentIDP)
    if not gestion:
        req = req.filter(DocumentIDP.utilisateur_id == user.id)
    req = _tous_les_mots(req, [DocumentIDP.nom_fichier, DocumentIDP.type_document], a["mots"])
    return [{"id": d.id, "titre": d.nom_fichier, "detail": d.type_document, "statut": d.statut, "page": "documents"}
            for d in req.order_by(DocumentIDP.id.desc()).limit(PAR_GROUPE)]


def _support(db, a, user):
    req = demandes_visibles(db, user)
    if a["numero"] is not None and not a["mots"]:
        req = req.filter(DemandeSupport.id == a["numero"])
    req = _tous_les_mots(req, [DemandeSupport.sujet, DemandeSupport.description], a["mots"])
    return [{"id": d.id, "titre": d.sujet, "statut": d.statut, "action": "support"}
            for d in req.order_by(DemandeSupport.maj.desc()).limit(PAR_GROUPE)]


def _workflows(db, a):
    req = _tous_les_mots(db.query(Workflow), [Workflow.nom, Workflow.description], a["mots"])
    return [{"id": w.id, "titre": w.nom, "detail": (w.description or "")[:90], "statut": "actif" if w.actif else "inactif",
             "page": "workflows"} for w in req.order_by(Workflow.nom).limit(PAR_GROUPE)]


def _comptes(db, a, user, admin):
    if admin:
        req = _tous_les_mots(db.query(User), [User.nom, User.email], a["mots"])
        return [{"id": u.id, "titre": u.nom, "detail": u.email, "statut": _val(u.role), "page": "securite"}
                for u in req.order_by(User.nom).limit(PAR_GROUPE)]
    req = _tous_les_mots(contacts_autorises(db, user), [User.nom], a["mots"])
    return [{"id": u.id, "titre": u.nom, "statut": _val(u.role), "action": "message"} for u in req.order_by(User.nom).limit(PAR_GROUPE)]


@router.get("")
def rechercher(q: str = Query(..., min_length=2, max_length=100), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = analyser(q)
    mots, numero, filtres, type_vise = a["mots"], a["numero"], a["filtres"], a["type"]
    gestion = est_gestion(user)
    general = type_vise is None and not filtres          # recherche libre, sans type ni statut demandé
    groupes = []
    if mots or numero is not None or filtres:
        groupes += [("equipements", type_vise in (None, "equipements"), lambda: _equipements(db, a)),
                    ("interventions", type_vise in (None, "interventions"), lambda: _interventions(db, a))]
    groupes += [("documents", bool(mots) and not filtres and type_vise in (None, "documents"), lambda: _documents(db, a, user, gestion)),
                ("support", general and (bool(mots) or numero is not None), lambda: _support(db, a, user)),
                ("workflows", general and bool(mots) and gestion, lambda: _workflows(db, a)),
                ("utilisateurs", general and bool(mots), lambda: _comptes(db, a, user, _val(user.role) == "admin"))]
    resultats = []
    for nom, actif, chercher in groupes:
        elements = chercher() if actif else []
        if elements:
            resultats.append({"groupe": nom, "elements": elements})
    return {"q": q, "comprise": {"mots": mots, "numero": numero, "filtres": filtres, "type": type_vise}, "resultats": resultats}
