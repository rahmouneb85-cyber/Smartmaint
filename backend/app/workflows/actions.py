"""Actions exécutables par un workflow.
Chaque action reçoit le contexte de l'événement, peut le compléter (ex. numéro de l'intervention créée, utilisable
ensuite dans un message), et signale ses erreurs par deux types d'exception :
  • ErreurTemporaire : panne réseau, service surchargé, IA indisponible → l'action est retentée ;
  • ErreurDefinitive : configuration invalide, donnée absente → inutile de réessayer.
En mode simulation, aucune action ne modifie les données ni n'appelle l'extérieur : elle décrit ce qu'elle ferait."""
import re
from collections import defaultdict
from datetime import datetime, timedelta

import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.copilote.outils import numero_intervention
from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.user import User


class ErreurTemporaire(Exception):
    pass


class ErreurDefinitive(Exception):
    pass


class Ignoree(Exception):
    """L'action n'avait pas lieu d'être (ex. intervention déjà ouverte pour cette alerte) : ce n'est pas une erreur."""


def rendre(modele: str, ctx: dict) -> str:
    """Remplace les variables {equipement}, {alerte_id}… ; une variable inconnue reste vide au lieu de provoquer une erreur."""
    valeurs = defaultdict(str, {k: ("" if v is None else v) for k, v in ctx.items()})
    try:
        return (modele or "").format_map(valeurs).strip()
    except (ValueError, IndexError):
        return modele or ""


def _val(x):
    return getattr(x, "value", x)


def _reprendre(db, i, ctx):
    """Complète le contexte avec une intervention existante (numéro, technicien, priorité)."""
    tech = db.get(User, i.technicien_id) if i.technicien_id else None
    ctx.update(intervention=numero_intervention(i), intervention_id=i.id,
               technicien=tech.nom if tech else "non assigné", priorite=_val(i.priorite))


def sans_markdown(texte: str) -> str:
    """Telegram affiche le texte brut : on retire les marques **gras**, # titres, `code` et --- du copilote."""
    texte = re.sub(r"\*\*(.+?)\*\*", r"\1", texte or "")
    texte = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", texte)
    texte = re.sub(r"(?m)^\s*(-{3,}|\*{3,})\s*$", "", texte)
    texte = texte.replace("`", "")
    texte = re.sub(r"(?m)^(\s*)[*-] ", r"\1• ", texte)
    return re.sub(r"\n{3,}", "\n\n", texte).strip()


def creer_intervention(db: Session, ctx: dict, p: dict, wf, simulation: bool) -> str:
    if not ctx.get("equipement_id"):
        raise ErreurDefinitive("L'événement ne concerne aucun équipement : choisissez des équipements dans le déclencheur")
    eq = db.get(Equipment, int(ctx["equipement_id"]))
    if not eq:
        raise ErreurDefinitive(f"Équipement n° {ctx['equipement_id']} introuvable")
    # pas de doublon : une alerte n'ouvre qu'une intervention, et un workflow n'ouvre qu'un ordre par équipement et par jour
    if ctx.get("alerte_id"):
        deja = db.query(Intervention).filter(Intervention.alerte_id == ctx["alerte_id"], Intervention.statut != "terminee").first()
        if deja:
            _reprendre(db, deja, ctx)
            raise Ignoree(f"Intervention {numero_intervention(deja)} déjà ouverte pour l'alerte #{ctx['alerte_id']}")
    marque = f"(Créée automatiquement par le workflow « {wf.nom} »)"
    recente = db.query(Intervention).filter(Intervention.equipement_id == eq.id, Intervention.statut != "terminee",
                                            Intervention.created_at >= datetime.now() - timedelta(hours=20),
                                            Intervention.description.like(f"%{marque}%")).first()
    if recente:
        _reprendre(db, recente, ctx)
        raise Ignoree(f"{numero_intervention(recente)} déjà créée aujourd'hui par ce workflow sur {eq.nom}")

    from app.saisie.propositions import proposer
    description = rendre(p.get("description") or "{type_alerte} sur {equipement}", ctx)
    prop = proposer(db, eq.id, description, ctx.get("alerte_id"), p.get("type_intervention") or "corrective",
                    avec_ia=bool(p.get("avec_diagnostic")) and not simulation)
    pr = prop["propositions"]
    priorite = pr.get("priorite", "normale") if (p.get("priorite") or "auto") == "auto" else p["priorite"]
    tech_id = pr.get("technicien_id") if (p.get("technicien") or "auto") == "auto" else (None if p.get("technicien") == "aucun" else int(p["technicien"]))
    tech = db.get(User, tech_id) if tech_id else None
    date = datetime.now() + {"urgente": timedelta(hours=1), "haute": timedelta(hours=4), "normale": timedelta(days=1), "basse": timedelta(days=3)}.get(priorite, timedelta(days=1))
    lignes = [description]
    if p.get("avec_diagnostic"):
        for cle, lib in (("diagnostic", "Diagnostic probable"), ("actions_realisees", "Actions à prévoir"), ("pieces_remplacees", "Pièces à prévoir")):
            if pr.get(cle):
                lignes.append(f"{lib} : {pr[cle]}")
    lignes.append(marque)
    ctx.update(technicien=tech.nom if tech else "non assigné", priorite=priorite)
    if simulation:
        ctx["intervention"] = "(nouvelle intervention)"
        return f"Créerait une intervention {p.get('type_intervention') or 'corrective'} de priorité {priorite} sur {eq.nom}, assignée à {ctx['technicien']}"
    i = Intervention(equipement_id=eq.id, technicien_id=tech_id, alerte_id=ctx.get("alerte_id"),
                     type_intervention=p.get("type_intervention") or "corrective", priorite=priorite, statut="planifiee",
                     description="\n".join(lignes)[:4000], date_intervention=date, created_at=datetime.now())
    db.add(i)
    if ctx.get("alerte_id") and p.get("acquitter_alerte"):
        a = db.get(Alert, int(ctx["alerte_id"]))
        if a:
            a.acquittee = True
    db.commit()
    db.refresh(i)
    ctx.update(intervention=numero_intervention(i), intervention_id=i.id)
    return f"Intervention {ctx['intervention']} créée (priorité {priorite}, {ctx['technicien']})"


def notifier_telegram(db, ctx, p, wf, simulation) -> str:
    texte = sans_markdown(rendre(p.get("message") or "{type_evenement} sur {equipement}", ctx))[:3500]
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        raise ErreurDefinitive("Telegram n'est pas configuré (TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans le fichier .env)")
    if simulation:
        return "Enverrait sur Telegram : « " + texte[:160] + ("… »" if len(texte) > 160 else " »")
    try:
        r = requests.post(f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                          json={"chat_id": settings.TELEGRAM_CHAT_ID, "text": texte}, timeout=10)
    except requests.RequestException as e:
        raise ErreurTemporaire(f"Telegram injoignable : {e.__class__.__name__}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise ErreurTemporaire(f"Telegram a répondu {r.status_code}")
    if r.status_code != 200:
        raise ErreurDefinitive(f"Telegram a refusé le message ({r.status_code}) : vérifiez le jeton et l'identifiant du groupe")
    return "Message Telegram envoyé"


def analyse_copilote(db, ctx, p, wf, simulation) -> str:
    question = rendre(p.get("question") or "Analyse l'événement sur {equipement}.", ctx)
    if simulation:
        ctx["analyse"] = "(analyse du copilote)"
        return f"Demanderait au copilote : « {question[:150]} »"
    from app.copilote import agent
    admin = db.query(User).filter(User.role == "admin", User.actif.is_(True)).order_by(User.id).first()
    if not admin:
        raise ErreurDefinitive("Aucun administrateur actif pour exécuter le copilote")
    texte, erreur = None, None
    consigne = question + "\nRéponds directement, sans proposer d'intervention (elle est gérée par le workflow)."
    for ev in agent.executer(db, admin, consigne, [], "fr"):
        if ev["type"] == "reponse":
            texte = ev["texte"]
        elif ev["type"] == "erreur":
            erreur = ev["message"]
    if not texte:
        raise ErreurTemporaire(erreur or "Le copilote n'a pas répondu")
    ctx["analyse"] = texte[:1500]
    if ctx.get("intervention_id"):
        i = db.get(Intervention, int(ctx["intervention_id"]))
        if i:
            i.description = ((i.description or "") + "\n\nAnalyse du copilote :\n" + texte)[:6000]
            db.commit()
    return "Analyse du copilote obtenue" + (f" et ajoutée à {ctx.get('intervention')}" if ctx.get("intervention_id") else "")


def changer_statut_equipement(db, ctx, p, wf, simulation) -> str:
    statut = p.get("statut") or "maintenance"
    if statut not in ("actif", "maintenance"):
        raise ErreurDefinitive(f"Statut « {statut} » non autorisé")
    if not ctx.get("equipement_id"):
        raise ErreurDefinitive("L'événement ne concerne aucun équipement")
    eq = db.get(Equipment, int(ctx["equipement_id"]))
    if not eq:
        raise ErreurDefinitive("Équipement introuvable")
    if _val(eq.statut) == statut:
        raise Ignoree(f"{eq.nom} est déjà au statut « {statut} »")
    if simulation:
        return f"Passerait {eq.nom} au statut « {statut} »"
    eq.statut = statut
    db.commit()
    return f"{eq.nom} passé au statut « {statut} »"


def acquitter_alerte(db, ctx, p, wf, simulation) -> str:
    if not ctx.get("alerte_id"):
        raise ErreurDefinitive("L'événement ne contient pas d'alerte")
    a = db.get(Alert, int(ctx["alerte_id"]))
    if not a:
        raise ErreurDefinitive(f"Alerte #{ctx['alerte_id']} introuvable")
    if a.acquittee:
        raise Ignoree(f"Alerte #{a.id} déjà acquittée")
    if simulation:
        return f"Acquitterait l'alerte #{a.id}"
    a.acquittee = True
    db.commit()
    return f"Alerte #{a.id} acquittée"


def reindexer_connaissances(db, ctx, p, wf, simulation) -> str:
    if simulation:
        return "Mettrait à jour la base de connaissances du copilote"
    from app.copilote import recherche
    r = recherche.indexer(db)
    return f"Base de connaissances mise à jour ({r['documents']} documents)"


def webhook(db, ctx, p, wf, simulation) -> str:
    url = (p.get("url") or "").strip()
    if not url.startswith(("https://", "http://")):
        raise ErreurDefinitive("Adresse du webhook absente ou invalide (elle doit commencer par https://)")
    if simulation:
        return f"Enverrait l'événement à {url}"
    try:
        r = requests.post(url, json={"workflow": wf.nom, "evenement": ctx, "envoye_le": datetime.now().isoformat()}, timeout=10)
    except requests.RequestException as e:
        raise ErreurTemporaire(f"Service externe injoignable : {e.__class__.__name__}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise ErreurTemporaire(f"Le service externe a répondu {r.status_code}")
    if r.status_code >= 400:
        raise ErreurDefinitive(f"Le service externe a refusé l'appel ({r.status_code})")
    return f"Événement envoyé ({r.status_code})"


def journaliser_action(db, ctx, p, wf, simulation) -> str:
    texte = rendre(p.get("message") or "Workflow « {workflow} »", ctx)[:400]
    if simulation:
        return f"Écrirait dans le journal : « {texte} »"
    from app.core.sessions import journaliser
    journaliser(db, None, "workflow", details=texte)
    return "Ligne ajoutée au journal"


ACTIONS = {"creer_intervention": creer_intervention, "notifier_telegram": notifier_telegram, "analyse_copilote": analyse_copilote,
           "changer_statut_equipement": changer_statut_equipement, "acquitter_alerte": acquitter_alerte,
           "reindexer_connaissances": reindexer_connaissances, "webhook": webhook, "journaliser": journaliser_action}
