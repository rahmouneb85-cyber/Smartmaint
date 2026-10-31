"""Autocomplétion des champs texte des interventions.
Les suggestions viennent de deux sources :
  • l'historique de SmartMaint : les formulations déjà utilisées, en priorité sur le même équipement ;
  • le vocabulaire de maintenance, dans la langue de l'utilisateur (français, anglais, arabe).
Seul le dernier morceau de la phrase (après la dernière virgule ou le dernier point) est complété,
et les fautes de frappe sont tolérées (« roulemnt » retrouve « roulement »)."""
import difflib
import math
import re
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.journaux import journal
from app.copilote.recherche import normaliser
from app.models.intervention import Intervention
from app.saisie import vocabulaire

CHAMPS = ["description", "diagnostic", "actions_realisees", "pieces_remplacees", "observations"]
# virgule et point séparent les morceaux, sauf dans un nombre (« 1,6 mm/s », « 8.1 bar »)
SEPARATEURS = re.compile(r"(?<!\d)[,.]|[,.](?!\d)|[;\n]|\s+(?:et|puis|and|then|و)\s+", re.I)
_CACHE = {"temps": 0, "cle": None, "donnees": None}
DUREE_CACHE = 60          # secondes : l'historique est relu au plus une fois par minute


def _norm(texte: str) -> str:
    t = normaliser(texte or "")
    t = t.replace("ة", "ه").replace("ى", "ي")           # variantes de l'arabe écrit
    return re.sub(r"\s+", " ", t).strip()


def fragment_courant(texte: str) -> tuple:
    """Sépare le texte en (début conservé, morceau en cours de saisie)."""
    texte = texte or ""
    dernier = None
    for m in SEPARATEURS.finditer(texte):
        dernier = m
    if not dernier:
        return "", texte.lstrip()
    debut = texte[:dernier.end()]
    return debut, texte[dernier.end():].lstrip()


def _morceaux(valeur: str) -> list:
    """Découpe un texte de l'historique en formulations réutilisables."""
    res = []
    for m in SEPARATEURS.split(valeur or ""):
        m = m.strip(" -–:()\t")
        if 3 <= len(m) <= 140 and not m.lower().startswith("(saisie automatique") and not m.lower().startswith("(préparée par"):
            res.append(m[0].upper() + m[1:])
    return res


def historique(db: Session) -> dict:
    """{champ: {clé normalisée: {texte, compte, equipements, derniere}}}, mis en cache une minute."""
    maintenant = time.time()
    nb = db.query(Intervention).count()
    if _CACHE["donnees"] is not None and maintenant - _CACHE["temps"] < DUREE_CACHE and _CACHE["cle"] == nb:
        return _CACHE["donnees"]
    donnees = {c: {} for c in CHAMPS}
    donnees["_mots"] = {}
    for i in db.query(Intervention).order_by(Intervention.id.desc()).limit(3000).all():
        quand = i.date_fin or i.date_debut or i.created_at or datetime.now()
        for champ in CHAMPS:
            compter_mots(donnees["_mots"], getattr(i, champ, None))
            for m in _morceaux(getattr(i, champ, None)):
                cle = _norm(m)
                e = donnees[champ].setdefault(cle, {"texte": m, "compte": 0, "equipements": set(), "derniere": quand})
                e["compte"] += 1
                e["equipements"].add(i.equipement_id)
                e["derniere"] = max(e["derniere"], quand)
    # mots du vocabulaire et des manuels déposés (sans compte d'usage, ils passent après ceux de l'historique)
    for liste in vocabulaire.TERMES.values():
        for t in liste:
            compter_mots(donnees["_mots"], t[0], poids=0)
    try:
        from app.models.copilote import CopiloteDocument
        for (texte,) in db.query(CopiloteDocument.texte).filter(CopiloteDocument.source_type == "manuel").limit(300).all():
            compter_mots(donnees["_mots"], texte, poids=0)
    except Exception:                       # les manuels enrichissent les mots proposés, sans être indispensables
        journal.warning("Manuels non pris en compte dans les suggestions", exc_info=True)
    _CACHE.update(temps=maintenant, cle=nb, donnees=donnees)
    return donnees


MOT = re.compile(r"[A-Za-zÀ-ÿ\u0600-\u06FF][\wÀ-ÿ\u0600-\u06FF'’-]*")


def compter_mots(dico: dict, texte, poids: int = 1, retirer: bool = False):
    """Compte les mots d'au moins 5 lettres : ils servent à la complétion mot par mot."""
    for m in MOT.findall(texte or ""):
        if len(m) < 5 or m.lower().startswith(("saisie", "préparée")):
            continue
        cle = _norm(m)
        e = dico.setdefault(cle, {"texte": m.lower() if not m.isupper() else m, "compte": 0, "reference": False})
        if poids == 0:
            e["reference"] = True          # mot du vocabulaire ou d'un manuel : toujours proposable
        e["compte"] += -poids if retirer else poids


def _correspondance(fragment: str, candidat: str) -> float:
    """Note de correspondance entre le morceau saisi et une formulation (0 = aucune)."""
    if not fragment:
        return 0.5
    if candidat.startswith(fragment):
        return 3.0
    mots_f, mots_c = fragment.split(), candidat.split()
    if all(any(c.startswith(f) for c in mots_c) for f in mots_f):
        return 2.2
    if fragment in candidat:
        return 1.6
    # tolérance aux fautes : chaque mot saisi commence un mot de la formulation, ou lui ressemble (4 lettres et plus)
    def proche(f):
        if any(c.startswith(f) for c in mots_c):
            return True
        return len(f) >= 4 and max((difflib.SequenceMatcher(None, f, c[:len(f) + 1]).ratio() for c in mots_c), default=0) >= 0.78
    if mots_f and all(proche(f) for f in mots_f):
        return 1.2
    return 0.0


def suggerer(db: Session, champ: str, texte: str, equipement_id=None, langue: str = "fr", limite: int = 6) -> dict:
    if champ not in CHAMPS:
        champ = "description"
    debut, fragment = fragment_courant(texte)
    f = _norm(fragment)
    deja = {_norm(m) for m in _morceaux(debut)}
    candidats = {}

    for cle, e in historique(db).get(champ, {}).items():
        if cle in deja or cle == f:
            continue
        note = _correspondance(f, cle)
        if note <= 0:
            continue
        note += 0.6 * math.log1p(e["compte"])
        if equipement_id and int(equipement_id) in e["equipements"]:
            note += 1.0
        age = (datetime.now() - e["derniere"]).days if isinstance(e["derniere"], datetime) else 365
        note += 0.4 * max(0, 1 - age / 180)
        candidats[cle] = {"texte": e["texte"], "source": "historique", "compte": e["compte"], "note": note,
                          "meme_equipement": bool(equipement_id and int(equipement_id) in e["equipements"])}

    for t in vocabulaire.termes(champ, langue):
        cle = _norm(t["texte"])
        if cle in deja or cle == f:
            continue
        # le terme est reconnu dans toutes les langues, mais proposé dans la langue de l'utilisateur
        note = max(_correspondance(f, _norm(v)) for v in t["variantes"])
        if note <= 0 or (not f and len(candidats) >= limite):
            continue
        note = note * 0.9 + (0.0 if f else -0.5)
        if cle not in candidats or candidats[cle]["note"] < note:
            candidats[cle] = {"texte": t["texte"], "source": "vocabulaire", "compte": 0, "note": note, "meme_equipement": False}

    tries = sorted(candidats.values(), key=lambda c: -c["note"])[:limite]

    # complétion du mot en cours (utile même pour une phrase jamais écrite)
    m = re.search(r"[\wÀ-ÿ\u0600-\u06FF'’-]+$", texte or "")
    if m and len(m.group(0)) >= 2:
        mot, nm = m.group(0), _norm(m.group(0))
        dico = historique(db).get("_mots", {})
        proposes = {_norm(c["texte"]) for c in tries}
        mots_c = sorted(((e["compte"], cle, e["texte"]) for cle, e in dico.items()
                         if cle.startswith(nm) and len(cle) >= len(nm) + 2 and (e["compte"] > 0 or e.get("reference"))),
                        key=lambda x: (-x[0], len(x[1])))
        place = max(1, limite - len(tries)) if tries else limite
        for compte, cle, forme in mots_c[:min(place, 3)]:
            if cle in proposes:
                continue
            if mot[0].isupper() and not forme.isupper():
                forme = forme[0].upper() + forme[1:]
            tries.append({"texte": forme, "source": "mot", "compte": compte, "note": 0, "meme_equipement": False,
                          "remplacement": (texte or "")[:m.start()] + forme})
    tries = tries[:limite + 2]
    for c in tries:
        if c["source"] == "mot":
            continue
        texte_c = c["texte"]
        # après une virgule ou « et », la suite de la phrase commence par une minuscule (sauf sigle : « SKF »)
        if re.search(r"(,|;|\bet|\bpuis|\band|\bthen)\s*$", debut, re.I) and len(texte_c) > 1 and not texte_c[1].isupper():
            texte_c = texte_c[0].lower() + texte_c[1:]
        c["remplacement"] = debut + (" " if debut and not debut.endswith((" ", "\n")) else "") + texte_c
        c["note"] = round(c["note"], 2)
    return {"fragment": fragment, "suggestions": tries}
