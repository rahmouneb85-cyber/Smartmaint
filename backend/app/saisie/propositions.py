"""Propositions pour une nouvelle intervention ou un compte rendu, à partir de l'équipement et de la panne décrite.
La base est l'historique : interventions terminées les plus proches (même équipement favorisé), alerte d'origine,
charge des techniciens, passages des manuels. Un modèle de langage peut ensuite rédiger une synthèse,
mais chaque proposition reste justifiée par sa source et n'est appliquée que si l'utilisateur l'accepte."""
import json
import re
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.copilote import llm, recherche
from app.copilote.outils import numero_intervention
from app.copilote.recherche import normaliser, mots
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User

GRAVITE = {"critique": "urgente", "haute": "haute", "moyenne": "normale", "faible": "basse"}
MOTS_URGENTS = ["fuite", "odeur de brule", "fumee", "arret", "bloque", "surintensite", "incendie", "leak", "smoke", "تسرب", "دخان"]
MOTS_HAUTS = ["vibration", "echauffement", "bruit", "temperature", "noise", "overheating", "اهتزاز", "حرارة"]


def _val(x):
    return getattr(x, "value", x)


class _Doc:
    def __init__(self, texte):
        self.texte = texte


def similaires(db: Session, equipement_id, texte: str, limite: int = 3, exclure_id=None) -> list:
    """Interventions terminées les plus proches de la panne décrite (BM25, bonus si même équipement)."""
    passees = [i for i in db.query(Intervention).filter(Intervention.statut == "terminee").all() if i.id != exclure_id]
    if not passees or not (texte or "").strip():
        return []
    docs = [_Doc(" ".join(filter(None, [i.description, i.diagnostic, i.actions_realisees]))) for i in passees]
    notes = recherche._bm25(mots(texte), docs)
    res = []
    for i, n in zip(passees, notes, strict=True):
        if n <= 0:
            continue
        if equipement_id and i.equipement_id == int(equipement_id):
            n *= 1.5
        res.append((n, i))
    res.sort(key=lambda x: -x[0])
    return [(round(n, 2), i) for n, i in res[:limite]]


def _plus_frequent(valeurs):
    valeurs = [v.strip() for v in valeurs if v and v.strip()]
    return Counter(valeurs).most_common(1)[0][0] if valeurs else None


def proposer(db: Session, equipement_id, description: str, alerte_id=None, type_intervention=None,
             avec_ia: bool = False, exclure_id=None) -> dict:
    eq = db.get(Equipment, int(equipement_id)) if equipement_id else None
    texte = (description or "").strip()
    alerte = db.get(Alert, int(alerte_id)) if alerte_id else None
    if alerte and not texte:
        texte = f"{alerte.type} {alerte.message or ''}"
    P, raisons = {}, {}

    # 1. Interventions similaires
    sim = similaires(db, equipement_id, f"{texte} {alerte.type if alerte else ''}", 3, exclure_id)
    sources = [{"id": i.id, "numero": numero_intervention(i), "note": n, "description": (i.description or "")[:120],
                "diagnostic": i.diagnostic, "actions_realisees": i.actions_realisees, "pieces_remplacees": i.pieces_remplacees,
                "meme_equipement": bool(eq and i.equipement_id == eq.id)} for n, i in sim]
    if sim:
        for champ in ("diagnostic", "actions_realisees", "pieces_remplacees"):
            v = _plus_frequent([getattr(i, champ) for _, i in sim]) or next((getattr(i, champ) for _, i in sim if getattr(i, champ)), None)
            if v:
                P[champ] = v
                provenance = [s["numero"] for s in sources if s[champ] and s[champ].strip() == v.strip()]
                raisons[champ] = "D'après " + ", ".join(provenance or [sources[0]["numero"]])

    # 2. Priorité
    n = normaliser(texte)
    if alerte:
        P["priorite"] = GRAVITE.get(_val(alerte.severite), "normale")
        raisons["priorite"] = f"Alerte #{alerte.id} de sévérité {_val(alerte.severite)}"
    elif any(m in n for m in MOTS_URGENTS):
        P["priorite"], raisons["priorite"] = "urgente", "Symptôme à risque dans la description"
    elif any(m in n for m in MOTS_HAUTS):
        P["priorite"], raisons["priorite"] = "haute", "Symptôme mécanique ou thermique dans la description"
    elif sim:
        P["priorite"] = _plus_frequent([_val(i.priorite) for _, i in sim]) or "normale"
        raisons["priorite"] = "Priorité habituelle des interventions similaires"
    else:
        P["priorite"], raisons["priorite"] = "normale", "Aucun signe d'urgence"

    # 3. Type
    if type_intervention:
        P["type_intervention"] = type_intervention
    else:
        prev = any(m in n for m in ("preventi", "periodique", "entretien", "graissage", "trimestriel", "preventive"))
        P["type_intervention"] = "preventive" if prev and not alerte else "corrective"
        raisons["type_intervention"] = "Entretien planifié" if P["type_intervention"] == "preventive" else "Panne ou anomalie signalée"

    # 4. Technicien : expérience sur cet équipement, puis charge de travail
    techs = db.query(User).filter(User.role == "technicien", User.actif.is_(True)).all()
    if techs:
        charge = {u.id: db.query(Intervention).filter(Intervention.technicien_id == u.id, Intervention.statut != "terminee").count() for u in techs}
        experience = Counter(i.technicien_id for i in db.query(Intervention).filter(
            Intervention.equipement_id == (eq.id if eq else -1), Intervention.statut == "terminee").all() if i.technicien_id)
        meilleur = min(techs, key=lambda u: (charge[u.id] - 0.8 * min(experience.get(u.id, 0), 3), u.nom))
        P["technicien_id"] = meilleur.id
        exp = experience.get(meilleur.id, 0)
        raisons["technicien_id"] = (f"{meilleur.nom} : {exp} intervention(s) terminée(s) sur cet équipement, " if exp else f"{meilleur.nom} : ") \
            + f"{charge[meilleur.id]} intervention(s) en cours"

    # 5. Date prévue selon la priorité
    maintenant = datetime.now().replace(second=0, microsecond=0)
    demain8 = (maintenant + timedelta(days=1)).replace(hour=8, minute=0)
    date = {"urgente": maintenant + timedelta(hours=1), "haute": maintenant + timedelta(hours=4) if maintenant.hour < 14 else demain8,
            "normale": demain8, "basse": demain8 + timedelta(days=2)}[P["priorite"]]
    P["date_intervention"] = date.strftime("%Y-%m-%dT%H:%M")
    raisons["date_intervention"] = f"Délai adapté à la priorité {P['priorite']}"

    # 6. Passages des manuels liés à la panne
    manuels = []
    if texte:
        q = f"{texte} {eq.nom if eq else ''}"
        manuels = [{"source": r["source"], "extrait": r["extrait"][:300]} for r in recherche.rechercher(db, q, 6) if r["type"] == "manuel"][:2]

    # 7. Description proposée si l'utilisateur part d'une alerte
    if alerte and not (description or "").strip():
        P["description"] = f"Contrôle suite à l'alerte #{alerte.id} : {alerte.type}" + (f" ({alerte.message})" if alerte.message else "")
        raisons["description"] = f"Rédigée à partir de l'alerte #{alerte.id}"

    resultat = {"propositions": P, "raisons": raisons, "similaires": sources, "manuels": manuels, "methode": "historique"}
    if avec_ia and texte:
        resultat = _completer_par_modele(resultat, eq, texte, alerte)
    return resultat


def _completer_par_modele(res: dict, eq, texte: str, alerte) -> dict:
    """Le modèle rédige un diagnostic probable et des actions à partir de l'historique et des manuels (jamais d'invention)."""
    contexte = {"equipement": eq.nom if eq else None, "panne": texte,
                "alerte": {"type": alerte.type, "message": alerte.message} if alerte else None,
                "interventions_similaires": [{k: s[k] for k in ("numero", "diagnostic", "actions_realisees", "pieces_remplacees")} for s in res["similaires"]],
                "extraits_manuels": res["manuels"]}
    consigne = ("Tu aides un responsable maintenance à préparer une intervention. À partir UNIQUEMENT du contexte JSON ci-dessous, "
                "réponds en JSON avec les clés \"diagnostic\" (cause la plus probable, une phrase), \"actions_realisees\" "
                "(actions à prévoir, une phrase avec des virgules), \"pieces_remplacees\" (pièces à prévoir, ou null), "
                "\"explication\" (une phrase qui cite les numéros d'intervention ou le manuel utilisés). En français, concis.\n"
                + json.dumps(contexte, ensure_ascii=False, default=str))
    try:
        r = llm.discuter([{"role": "user", "content": consigne}], None, json_attendu=True)
        d = json.loads(re.sub(r"^```(?:json)?|```$", "", r["contenu"].strip(), flags=re.M))
    except (llm.ErreurLLM, json.JSONDecodeError, ValueError):
        return res
    for champ in ("diagnostic", "actions_realisees", "pieces_remplacees"):
        if d.get(champ):
            res["propositions"][champ] = str(d[champ]).strip()
            res["raisons"][champ] = d.get("explication") or res["raisons"].get(champ, "")
    res["methode"] = f"historique + {r['modele']}"
    res["explication"] = d.get("explication")
    return res


def reformuler(texte: str, champ: str = "description") -> dict:
    """Corrige et remet en français technique un texte saisi vite, en arabe, en anglais ou avec des fautes."""
    from app.saisie.vocabulaire import traduire_vers_francais
    texte = (texte or "").strip()
    if not texte:
        return {"texte": "", "methode": "aucune"}
    consigne = ("Réécris ce texte de maintenance industrielle en français correct, clair et concis, dans le style d'un compte rendu "
                "technique. Corrige l'orthographe, traduis s'il est écrit en arabe, en darija ou en anglais. Garde exactement les "
                "valeurs, références et noms. N'ajoute aucune information. Réponds uniquement avec le texte réécrit.\n\n" + texte)
    try:
        r = llm.discuter([{"role": "user", "content": consigne}], None)
        sortie = r["contenu"].strip().strip('"«» ')
        if sortie:
            return {"texte": sortie, "methode": r["modele"]}
    except llm.ErreurLLM:
        pass
    simple = traduire_vers_francais(re.sub(r"\s+", " ", texte))
    simple = re.sub(r"\s+([,.;:])", r"\1", simple)
    return {"texte": simple[0].upper() + simple[1:], "methode": "vocabulaire"}
