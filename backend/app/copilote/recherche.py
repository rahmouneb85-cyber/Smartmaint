"""Base de connaissances du copilote (RAG) : indexation et recherche hybride.
Recherche hybride = recherche par mots-clés (BM25) + recherche par le sens (vecteurs), fusionnées par
Reciprocal Rank Fusion. Si le modèle d'embeddings n'est pas installé, la recherche par mots-clés suffit."""
import json
import math
import re
import unicodedata
from collections import Counter
from datetime import datetime

from sqlalchemy.orm import Session

from app.copilote import llm
from app.models.copilote import CopiloteDocument
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User

MOTS_VIDES = set("""le la les un une des de du d l et ou a au aux en dans sur pour par avec sans ce cette ces
est sont ete etre a ont qui que quoi dont the of and to in on for is are was with""".split())


def normaliser(texte: str) -> str:
    texte = unicodedata.normalize("NFKD", (texte or "").lower())
    return "".join(c for c in texte if not unicodedata.combining(c))


def mots(texte: str) -> list:
    return [m for m in re.findall(r"[a-z0-9؀-ۿ]+", normaliser(texte)) if m not in MOTS_VIDES and len(m) > 1]


def _val(x):
    return getattr(x, "value", x)


# ─────────────────────────────────────────────────────────────
# INDEXATION
# ─────────────────────────────────────────────────────────────
def _documents_a_indexer(db: Session) -> list:
    noms_eq = {e.id: e.nom for e in db.query(Equipment).all()}
    noms_tech = {u.id: u.nom for u in db.query(User).all()}
    docs = []
    for e in db.query(Equipment).all():
        docs.append(("equipement", e.id, f"Équipement {e.nom}",
                     f"Équipement {e.nom}, type {e.type}, localisation {e.localisation}, statut {_val(e.statut)}, "
                     f"installé le {e.date_installation}."))
    for i in db.query(Intervention).all():
        numero = ("FI" if _val(i.statut) == "terminee" else "OI") + f"-{(i.created_at or datetime.now()).year}-{i.id:04d}"
        parties = [f"Intervention {numero} sur {noms_eq.get(i.equipement_id, '?')}",
                   f"type {_val(i.type_intervention)}, priorité {_val(i.priorite)}, statut {_val(i.statut)}",
                   f"technicien {noms_tech.get(i.technicien_id, 'non assigné')}",
                   f"date {i.date_debut or i.date_intervention or i.created_at}"]
        if i.alerte_id:
            parties.append(f"suite à l'alerte #{i.alerte_id}")
        for champ, etiquette in (("description", "Description"), ("diagnostic", "Diagnostic"),
                                 ("actions_realisees", "Actions réalisées"), ("pieces_remplacees", "Pièces remplacées"),
                                 ("observations", "Observations")):
            valeur = getattr(i, champ, None)
            if valeur:
                parties.append(f"{etiquette} : {valeur}")
        docs.append(("intervention", i.id, f"Intervention {numero}", ". ".join(parties)))
    return docs


def indexer(db: Session) -> dict:
    """Reconstruit la base de connaissances à partir des données de SmartMaint."""
    docs = _documents_a_indexer(db)
    vecs = llm.vecteurs([d[3] for d in docs])
    db.query(CopiloteDocument).filter(CopiloteDocument.source_type.in_(["equipement", "intervention"])).delete(synchronize_session=False)
    maintenant = datetime.now()
    for k, (stype, sid, titre, texte) in enumerate(docs):
        db.add(CopiloteDocument(source_type=stype, source_id=sid, titre=titre, texte=texte,
                                embedding=json.dumps(vecs[k]) if vecs else None, maj=maintenant))
    db.commit()
    return {"documents": len(docs), "vecteurs": bool(vecs)}


def ajouter_document(db: Session, source_type: str, source_id, titre: str, texte: str, taille: int = 1200):
    """Ajoute un document externe (fiche technique, manuel...) découpé en morceaux de taille raisonnable."""
    morceaux = [texte[i:i + taille] for i in range(0, len(texte), taille - 150)] or [texte]
    vecs = llm.vecteurs(morceaux)
    for k, m in enumerate(morceaux):
        db.add(CopiloteDocument(source_type=source_type, source_id=source_id, titre=f"{titre} ({k + 1}/{len(morceaux)})",
                                texte=m, embedding=json.dumps(vecs[k]) if vecs else None, maj=datetime.now()))
    db.commit()
    return len(morceaux)


# ─────────────────────────────────────────────────────────────
# RECHERCHE HYBRIDE
# ─────────────────────────────────────────────────────────────
def _bm25(requete: list, docs: list, k1=1.5, b=0.75) -> list:
    corpus = [mots(d.texte) for d in docs]
    n = len(corpus)
    moyenne = sum(len(c) for c in corpus) / max(n, 1)
    df = Counter(m for c in corpus for m in set(c))
    scores = []
    for c in corpus:
        tf = Counter(c)
        s = 0.0
        for m in requete:
            if m in tf:
                idf = math.log(1 + (n - df[m] + 0.5) / (df[m] + 0.5))
                s += idf * tf[m] * (k1 + 1) / (tf[m] + k1 * (1 - b + b * len(c) / moyenne))
        scores.append(s)
    return scores


def _cosinus(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b, strict=False)) / (na * nb) if na and nb else 0.0


def rechercher(db: Session, requete: str, limite: int = 5) -> list:
    docs = db.query(CopiloteDocument).all()
    if not docs:
        return []
    classements = []
    s_bm25 = _bm25(mots(requete), docs)
    classements.append(sorted(range(len(docs)), key=lambda i: -s_bm25[i]))
    if any(d.embedding for d in docs):
        q = llm.vecteurs([requete])
        if q:
            s_vec = [_cosinus(q[0], json.loads(d.embedding)) if d.embedding else -1 for d in docs]
            classements.append(sorted(range(len(docs)), key=lambda i: -s_vec[i]))
    # Reciprocal Rank Fusion
    fusion = Counter()
    for classement in classements:
        for rang, i in enumerate(classement):
            fusion[i] += 1 / (60 + rang)
    meilleurs = [i for i, _ in fusion.most_common(limite) if s_bm25[i] > 0 or len(classements) > 1]
    return [{"source": docs[i].titre, "type": docs[i].source_type, "id": docs[i].source_id,
             "extrait": docs[i].texte[:600]} for i in meilleurs]
