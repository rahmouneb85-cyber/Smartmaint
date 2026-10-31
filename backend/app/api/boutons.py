"""Personnalisation des boutons flottants et contacts autorisés de la messagerie (Paramètres, administrateur).

Principe : la personnalisation ne change que l'AFFICHAGE des boutons. Masquer un bouton, le réserver à un rôle
ou à certaines pages ne supprime jamais la fonctionnalité et ne modifie aucun droit d'accès : les routes de
l'API gardent exactement leurs contrôles. Seule exception voulue : les contacts autorisés de la messagerie,
qui sont un vrai droit, appliqué par le serveur (messagerie.contacts_autorises).

La configuration est enregistrée en JSON dans la table `parametres_application`. Elle est fusionnée avec le
catalogue ci-dessous : un bouton ajouté dans une version future apparaît avec ses réglages par défaut, et une
clé inconnue est ignorée.
"""
import json
import re
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import exiger_roles, get_current_user
from app.core.sessions import journaliser
from app.models.parametre import Parametre, PreferenceUtilisateur
from app.models.user import User

router = APIRouter(prefix="/boutons", tags=["Personnalisation des boutons"])
admin_requis = exiger_roles("admin")

ROLES = ["admin", "superviseur", "technicien"]
LANGUES = ["fr", "en", "ar"]
TAILLES = ["petit", "normal", "grand"]
ANIMATIONS = ["aucune", "discrete", "marquee"]
# icônes proposées à l'administrateur (liste fermée : aucune image ni texte libre affiché)
ICONES = ["🤖", "✨", "🔔", "✉️", "💬", "🛟", "⚡", "🌙", "👤", "🌐", "🔎", "📞", "📊", "🏭", "📡", "🔧", "📄", "⚙️",
          "🛡️", "🎛️", "📅", "📈", "🧰", "❓", "⭐", "📌", "🚨", "🧭", "📝", "🔗", "📹", "🎥"]
MAX_PERSO = 10
# actions rapides : id, icône, page ouverte, rôles autorisés
ACTIONS = [("intervention", "🔧", "interventions", ROLES), ("document", "📄", "documents", ROLES), ("question", "✨", "copilote", ROLES),
           ("capteurs", "📡", "capteurs", ROLES), ("tableau", "📊", "dashboard", ROLES), ("support", "🛟", None, ROLES),
           ("equipement", "🏭", "equipements", ["admin", "superviseur"]), ("workflows", "⚙️", "workflows", ["admin", "superviseur"]),
           ("securite", "🛡️", "securite", ["admin"]), ("parametres", "🎛️", "parametres", ["admin"])]
ACTIONS_DEFAUT = ["intervention", "document", "question", "equipement", "workflows"]
PAGES = ["dashboard", "equipements", "capteurs", "interventions", "copilote", "documents", "workflows", "compte", "securite", "parametres", "room"]
APPAREILS = ["tous", "bureau", "mobile"]
CLE_BOUTONS, CLE_CONTACTS = "boutons_flottants", "messagerie_contacts"

# cle, icône, couleur, conditions possibles. L'ordre de la liste est l'ordre par défaut.
CATALOGUE = [
    ("public.assistant", "🤖", "#4f46e5", ["toujours", "horaires"]),
    ("public.whatsapp", "💬", "#15803d", ["toujours", "horaires"]),
    ("public.contact", "✉️", "#c2410c", ["toujours", "horaires"]),
    ("prive.recherche", "🔎", "#0e7490", ["toujours", "horaires"]),
    ("prive.assistant", "🤖", "#4f46e5", ["toujours", "horaires"]),
    ("prive.copilote", "✨", "#7c3aed", ["toujours", "horaires"]),
    ("prive.notifications", "🔔", "#dc2626", ["toujours", "non_lus", "alerte_critique", "horaires"]),
    ("prive.messagerie", "✉️", "#1d4ed8", ["toujours", "non_lus", "horaires"]),
    ("prive.whatsapp", "💬", "#15803d", ["toujours", "horaires"]),
    ("prive.support", "🛟", "#be123c", ["toujours", "non_lus", "alerte_critique", "horaires"]),
    ("prive.actions", "⚡", "#6d28d9", ["toujours", "horaires"]),
    ("prive.theme", "🌙", "#374151", ["toujours"]),
    ("prive.compte", "👤", "#0f766e", ["toujours"]),
    ("prive.langue", "🌐", "#1d4ed8", ["toujours"]),
    ("contextuel.notifications", "🔔", "#b45309", ["non_lus"]),
    ("contextuel.messagerie", "✉️", "#1d4ed8", ["non_lus"]),
    ("contextuel.support", "🛟", "#be123c", ["non_lus", "non_lus_ou_alerte", "alerte_critique"]),
    ("contextuel.room", "📹", "#15803d", ["non_lus"]),
]
INFOS = {cle: {"icone": icone, "couleur": couleur, "conditions": conditions} for cle, icone, couleur, conditions in CATALOGUE}


def _defaut(cle: str, ordre: int) -> dict:
    return {"cle": cle, "espace": cle.split(".")[0], "visible": True, "ordre": ordre, "couleur": INFOS[cle]["couleur"],
            "icone": INFOS[cle]["icone"], "taille": "normal", "animation": "discrete", "langues": [],
            "roles": list(ROLES), "pages": [], "appareils": "tous", "condition": INFOS[cle]["conditions"][0],
            "heure_debut": 8, "heure_fin": 18}


def _perso(b: dict) -> Optional[dict]:
    """Bouton ajouté par l'administrateur (raccourci vers une page ou un lien https), relu depuis la base."""
    base = {**_defaut("prive.recherche", 50), "cle": b.get("cle"), "espace": "prive", "icone": "📌", "couleur": "#0f766e",
            "libelles": {}, "cible_type": "page", "cible": "dashboard"}
    champs = {k: v for k, v in b.items() if k in base and k not in ("espace",)}
    return {**base, **champs}


def defauts() -> List[dict]:
    return [_defaut(cle, i) for i, (cle, *_reste) in enumerate(CATALOGUE)]


def _lire(db: Session, cle: str):
    p = db.get(Parametre, cle)
    try:
        return (json.loads(p.valeur), p) if p else (None, None)
    except ValueError:
        return None, p


def configuration(db: Session) -> List[dict]:
    """Configuration enregistrée fusionnée avec le catalogue, triée par ordre d'affichage."""
    enregistree, _ = _lire(db, CLE_BOUTONS)
    par_cle = {b.get("cle"): b for b in (enregistree or []) if isinstance(b, dict)}
    resultat = []
    for d in defauts():
        b = {**d, **{k: v for k, v in par_cle.get(d["cle"], {}).items() if k in d and k not in ("cle", "espace")}}
        resultat.append(b)
    resultat += [_perso(b) for cle, b in par_cle.items() if isinstance(cle, str) and cle.startswith("perso.")][:MAX_PERSO]
    return sorted(resultat, key=lambda b: (b["espace"] != "public", b["ordre"]))


def contacts_par_role(db: Session) -> Dict[str, List[str]]:
    """Rôles que chaque rôle peut contacter dans la messagerie (par défaut : tout le monde)."""
    enregistre, _ = _lire(db, CLE_CONTACTS)
    base = {r: list(ROLES) for r in ROLES}
    if isinstance(enregistre, dict):
        for r in ROLES:
            if isinstance(enregistre.get(r), list):
                base[r] = [x for x in ROLES if x in enregistre[r]]
    return base


def dans_horaires(b: dict, maintenant: Optional[datetime] = None) -> bool:
    if b["condition"] != "horaires":
        return True
    h = (maintenant or datetime.now()).hour
    debut, fin = b["heure_debut"], b["heure_fin"]
    return debut <= h < fin if debut < fin else (h >= debut or h < fin)      # plage passant minuit


AFFICHAGE = ("cle", "ordre", "couleur", "icone", "taille", "animation", "langues", "appareils", "condition")


def _public(b: dict) -> dict:
    return {k: b[k] for k in AFFICHAGE}


def boutons_publics(db: Session) -> List[dict]:
    return [_public(b) for b in configuration(db) if b["espace"] == "public" and b["visible"] and dans_horaires(b)]


@router.get("/mes-boutons")
def mes_boutons(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Boutons à afficher pour le compte connecté (rôle et horaires vérifiés ici ; pages, appareil et
    éléments non lus sont appliqués par l'interface, qui les connaît)."""
    role = getattr(user.role, "value", user.role)
    boutons = []
    for b in configuration(db):
        if b["espace"] == "public" or not b["visible"] or role not in b["roles"] or not dans_horaires(b):
            continue
        x = {**_public(b), "pages": b["pages"]}
        if b["cle"].startswith("perso."):
            x.update(libelles=b["libelles"], cible_type=b["cible_type"], cible=b["cible"])
        boutons.append(x)
    return {"boutons": boutons, "preferences": preferences(db, user)}


# ─────────────────────────────────────────────────────────────
# ADMINISTRATION
# ─────────────────────────────────────────────────────────────
class Bouton(BaseModel):
    cle: str = Field(..., max_length=30)
    visible: bool = True
    ordre: int = Field(0, ge=0, le=100)
    couleur: str = Field(..., pattern=r"^#[0-9a-fA-F]{6}$")
    icone: Optional[str] = None
    taille: str = "normal"
    animation: str = "discrete"
    langues: List[str] = Field(default_factory=list)
    # boutons ajoutés seulement
    libelles: Dict[str, str] = Field(default_factory=dict)
    cible_type: str = "page"
    cible: str = Field("dashboard", max_length=300)
    roles: List[str] = Field(default_factory=lambda: list(ROLES))
    pages: List[str] = Field(default_factory=list)
    appareils: str = "tous"
    condition: str = "toujours"
    heure_debut: int = Field(8, ge=0, le=23)
    heure_fin: int = Field(18, ge=0, le=24)


class Configuration(BaseModel):
    boutons: List[Bouton]
    contacts: Dict[str, List[str]] = Field(default_factory=dict)


def _verifier_perso(b: Bouton) -> dict:
    if not re.fullmatch(r"perso\.[a-z0-9]{1,12}", b.cle):
        raise HTTPException(status_code=422, detail="Identifiant de bouton ajouté invalide")
    libelles = {lg: v.strip() for lg, v in b.libelles.items() if lg in LANGUES and isinstance(v, str) and v.strip()}
    if not libelles.get("fr") or any(len(v) > 40 for v in libelles.values()):
        raise HTTPException(status_code=422, detail="Un bouton ajouté doit avoir un libellé français de 40 caractères maximum")
    if b.cible_type == "page":
        if b.cible not in PAGES:
            raise HTTPException(status_code=422, detail="Page inconnue pour le bouton ajouté")
    elif b.cible_type == "lien":
        # seuls les liens https sont acceptés : pas de javascript:, data:, http: ni adresse relative
        if not re.fullmatch(r"https://[A-Za-z0-9.-]+(?::\d{2,5})?(?:/[^\s<>\"']*)?", b.cible):
            raise HTTPException(status_code=422, detail="Lien invalide : seule une adresse https:// est acceptée")
    else:
        raise HTTPException(status_code=422, detail="Type de cible inconnu")
    return {"libelles": libelles, "cible_type": b.cible_type, "cible": b.cible, "espace": "prive"}


def _verifier(b: Bouton) -> dict:
    perso = b.cle.startswith("perso.")
    if not perso and b.cle not in INFOS:
        raise HTTPException(status_code=422, detail=f"Bouton inconnu : {b.cle}")
    if (b.icone and b.icone not in ICONES) or b.taille not in TAILLES or b.animation not in ANIMATIONS or set(b.langues) - set(LANGUES):
        raise HTTPException(status_code=422, detail=f"Icône, taille, animation ou langue inconnue pour {b.cle}")
    if set(b.roles) - set(ROLES) or set(b.pages) - set(PAGES) or b.appareils not in APPAREILS:
        raise HTTPException(status_code=422, detail=f"Rôle, page ou appareil inconnu pour {b.cle}")
    if b.condition not in (["toujours", "horaires"] if perso else INFOS[b.cle]["conditions"]):
        raise HTTPException(status_code=422, detail=f"Condition non disponible pour {b.cle}")
    if b.condition == "horaires" and b.heure_debut == b.heure_fin:
        raise HTTPException(status_code=422, detail="La plage horaire doit avoir une heure de début différente de l'heure de fin")
    resultat = {**b.model_dump(), "couleur": b.couleur.lower(), "roles": [r for r in ROLES if r in b.roles],
                "pages": [p for p in PAGES if p in b.pages], "langues": [x for x in LANGUES if x in b.langues],
                "icone": b.icone or (INFOS[b.cle]["icone"] if not perso else "📌")}
    if perso:
        resultat.update(_verifier_perso(b))
    else:
        for k in ("libelles", "cible_type", "cible"):
            resultat.pop(k)
    return resultat


def _ecrire(db: Session, cle: str, valeur, user: User):
    p = db.get(Parametre, cle) or Parametre(cle=cle)
    p.valeur, p.maj, p.maj_par = json.dumps(valeur, ensure_ascii=False), datetime.now(), user.id
    db.add(p)


def _reponse(db: Session) -> dict:
    _, p = _lire(db, CLE_BOUTONS)
    auteur = db.get(User, p.maj_par).nom if p and p.maj_par and db.get(User, p.maj_par) else None
    return {"boutons": configuration(db), "contacts": contacts_par_role(db),
            "catalogue": {"roles": ROLES, "pages": PAGES, "appareils": APPAREILS, "langues": LANGUES, "tailles": TAILLES,
                          "animations": ANIMATIONS, "icones": ICONES, "max_perso": MAX_PERSO,
                          "boutons": {c: {"icone": i["icone"], "conditions": i["conditions"], "couleur": i["couleur"]} for c, i in INFOS.items()}},
            "maj": p.maj if p else None, "maj_par": auteur}


@router.get("/configuration", dependencies=[Depends(admin_requis)])
def lire_configuration(db: Session = Depends(get_db)):
    return _reponse(db)


@router.put("/configuration")
def enregistrer(c: Configuration, request: Request, db: Session = Depends(get_db), user: User = Depends(admin_requis)):
    cles = [b.cle for b in c.boutons]
    if len(cles) != len(set(cles)):
        raise HTTPException(status_code=422, detail="Un bouton apparaît deux fois")
    boutons = [_verifier(b) for b in c.boutons]
    if sum(b["cle"].startswith("perso.") for b in boutons) > MAX_PERSO:
        raise HTTPException(status_code=422, detail=f"{MAX_PERSO} boutons ajoutés au maximum")
    contacts = {}
    for role, autorises in c.contacts.items():
        if role not in ROLES or set(autorises) - set(ROLES):
            raise HTTPException(status_code=422, detail="Rôle inconnu dans les contacts autorisés")
        contacts[role] = [r for r in ROLES if r in autorises]
    _ecrire(db, CLE_BOUTONS, boutons, user)
    if contacts:
        _ecrire(db, CLE_CONTACTS, {**contacts_par_role(db), **contacts}, user)
    masques = [b["cle"] for b in boutons if not b["visible"]]
    journaliser(db, request, "personnalisation_boutons", email=user.email, utilisateur_id=user.id,
                details=f"{len(boutons)} boutons, masqués : {', '.join(masques) or 'aucun'}")
    return _reponse(db)


@router.post("/configuration/reinitialiser")
def reinitialiser(request: Request, db: Session = Depends(get_db), user: User = Depends(admin_requis)):
    for cle in (CLE_BOUTONS, CLE_CONTACTS):
        p = db.get(Parametre, cle)
        if p:
            db.delete(p)
    journaliser(db, request, "personnalisation_boutons", email=user.email, utilisateur_id=user.id, details="Réglages par défaut rétablis")
    return _reponse(db)


# ─────────────────────────────────────────────────────────────
# PRÉFÉRENCES PERSONNELLES (chaque utilisateur, pour lui seul)
# ─────────────────────────────────────────────────────────────
def actions_autorisees(role: str) -> List[dict]:
    return [{"id": i, "icone": icone, "page": page} for i, icone, page, roles in ACTIONS if role in roles]


def preferences(db: Session, user: User) -> dict:
    """Préférences du compte connecté uniquement (aucun identifiant n'est accepté en paramètre)."""
    role = getattr(user.role, "value", user.role)
    autorisees = [a["id"] for a in actions_autorisees(role)]
    p = db.get(PreferenceUtilisateur, user.id)
    try:
        v = json.loads(p.valeur) if p else {}
    except ValueError:
        v = {}
    actions = [a for a in v.get("actions", ACTIONS_DEFAUT) if a in autorisees]
    return {"masques": [m for m in v.get("masques", []) if isinstance(m, str)], "actions": actions,
            "animations_reduites": bool(v.get("animations_reduites", False)), "actions_disponibles": actions_autorisees(role)}


class Preferences(BaseModel):
    masques: List[str] = Field(default_factory=list, max_length=40)
    actions: List[str] = Field(default_factory=list, max_length=10)
    animations_reduites: bool = False


@router.get("/mes-preferences")
def lire_preferences(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return preferences(db, user)


@router.put("/mes-preferences")
def enregistrer_preferences(pr: Preferences, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Masquer un bouton pour soi ne change que son propre affichage ; un bouton masqué par l'administrateur
    ne peut pas être réaffiché, et une action non autorisée pour le rôle est refusée."""
    role = getattr(user.role, "value", user.role)
    autorisees = {a["id"] for a in actions_autorisees(role)}
    if set(pr.actions) - autorisees:
        raise HTTPException(status_code=422, detail="Action rapide non disponible pour votre rôle")
    cles = {b["cle"] for b in configuration(db) if b["espace"] != "public"}
    if set(pr.masques) - cles:
        raise HTTPException(status_code=422, detail="Bouton inconnu")
    p = db.get(PreferenceUtilisateur, user.id) or PreferenceUtilisateur(utilisateur_id=user.id)
    p.valeur = json.dumps({"masques": sorted(set(pr.masques)), "actions": list(dict.fromkeys(pr.actions)),
                           "animations_reduites": pr.animations_reduites}, ensure_ascii=False)
    p.maj = datetime.now()
    db.add(p)
    db.commit()
    return preferences(db, user)


@router.delete("/mes-preferences")
def reinitialiser_preferences(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.get(PreferenceUtilisateur, user.id)
    if p:
        db.delete(p)
        db.commit()
    return preferences(db, user)
