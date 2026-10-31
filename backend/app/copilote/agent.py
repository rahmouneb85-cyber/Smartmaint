"""Agent du copilote : le modèle choisit les outils à appeler, l'agent les exécute et lui renvoie les résultats,
jusqu'à obtenir une réponse finale. Chaque étape est envoyée à l'écran au fur et à mesure (streaming).
Gestion des erreurs : un outil en erreur renvoie un message explicatif au modèle, qui peut corriger sa demande ;
un fournisseur indisponible est remplacé par l'autre ; le nombre d'étapes est limité."""
import json
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.copilote import llm, outils
from app.core.config import settings
from app.models.copilote import CopiloteEchange

LANGUES = {"fr": "français", "en": "English", "ar": "العربية (arabe)"}

LIBELLES_OUTILS = {
    "lister_equipements": "Consultation des équipements",
    "etat_equipement": "Analyse de l'état de l'équipement",
    "rechercher_alertes": "Recherche des alertes",
    "analyser_alerte": "Analyse de l'incident",
    "rechercher_interventions": "Recherche des interventions",
    "indicateurs_maintenance": "Calcul des indicateurs de maintenance",
    "recherche_documentaire": "Recherche dans la base de connaissances",
    "lister_techniciens": "Consultation des techniciens",
    "proposer_intervention": "Préparation de l'ordre d'intervention",
}


def consigne_systeme(langue: str, nom: str, role: str) -> str:
    return (
        "Tu es le Copilote de maintenance de SmartMaint, plateforme de supervision industrielle IoT. "
        f"Nous sommes le {datetime.now():%d/%m/%Y %H:%M}. Tu aides {nom} (rôle : {role}).\n"
        "RÈGLES :\n"
        "1. Pour toute question sur les équipements, capteurs, alertes, interventions ou indicateurs, appelle d'abord "
        "les outils : n'invente jamais un chiffre, un nom ou une date.\n"
        "2. Tu peux appeler plusieurs outils à la suite. Si un outil renvoie une erreur, corrige ta demande.\n"
        "3. Cite les éléments sur lesquels tu t'appuies entre crochets : [Alerte #123], [OI-2026-0006], [FI-2026-0004] "
        "ou [nom de l'équipement]. Ne cite jamais le nom d'un outil (pas de [lister_equipements]).\n"
        "4. Quand on te demande de préparer, créer ou planifier une intervention, appelle proposer_intervention DANS "
        "CETTE MÊME RÉPONSE, sans poser de question avant : rien n'est créé tant que l'utilisateur n'a pas confirmé, il "
        "peut donc annuler. Le technicien est facultatif : si tu as consulté lister_techniciens, prends le moins chargé, "
        "sinon laisse-le vide. Ensuite, dis à l'utilisateur de cliquer sur « Confirmer ».\n"
        "5. Pour un diagnostic, appuie-toi sur les mesures, l'analyse de l'alerte et les interventions passées, puis "
        "propose des causes probables et des contrôles concrets.\n"
        "6. Réponds de façon claire et structurée, en phrases courtes, avec des listes si utile.\n"
        f"7. Réponds uniquement en {LANGUES.get(langue, 'français')}. Recopie les noms des équipements tels quels."
    )


def executer(db: Session, user, question: str, historique: list, langue: str = "fr"):
    """Générateur d'événements : {'type': 'etape'|'reponse'|'erreur', ...}."""
    debut = time.time()
    ctx = {"utilisateur_id": user.id, "sources": [], "actions": []}
    trace = []
    messages = [{"role": "system", "content": consigne_systeme(langue, user.nom, getattr(user.role, "value", user.role))}]
    messages += [{"role": m["role"], "content": str(m["content"])[:2000]} for m in historique[-6:]
                 if m.get("role") in ("user", "assistant") and m.get("content")]
    messages.append({"role": "user", "content": question[:2000]})
    fournisseur = modele = None
    reponse = None

    try:
        for etape in range(settings.COPILOTE_MAX_ETAPES):
            yield {"type": "reflexion", "etape": etape + 1}
            r = llm.discuter(messages, outils.DEFINITIONS, prefere=fournisseur)
            fournisseur, modele = r["fournisseur"], r["modele"]
            if not r["appels_outils"]:
                reponse = r["contenu"].strip()
                break
            messages.append({"role": "assistant", "content": r["contenu"] or "", "tool_calls": r["appels_outils"]})
            for appel in r["appels_outils"]:
                nom = appel["function"]["name"]
                try:
                    arguments = json.loads(appel["function"].get("arguments") or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                yield {"type": "etape", "outil": nom, "libelle": LIBELLES_OUTILS.get(nom, nom), "arguments": arguments}
                t0 = time.time()
                try:
                    fonction = outils.FONCTIONS.get(nom)
                    if not fonction:
                        raise outils.OutilErreur(f"Outil inconnu : {nom}")
                    resultat = fonction(db, ctx, **{k: v for k, v in arguments.items() if v not in (None, "")})
                    statut = "ok"
                except outils.OutilErreur as e:
                    resultat, statut = {"erreur": str(e)}, "erreur"
                except TypeError as e:
                    resultat, statut = {"erreur": f"Paramètres invalides : {e}"}, "erreur"
                except Exception as e:
                    db.rollback()
                    resultat, statut = {"erreur": f"Erreur technique : {str(e)[:200]}"}, "erreur"
                trace.append({"outil": nom, "arguments": arguments, "statut": statut, "duree_ms": int((time.time() - t0) * 1000)})
                yield {"type": "resultat_etape", "outil": nom, "statut": statut}
                messages.append({"role": "tool", "tool_call_id": appel.get("id", nom), "name": nom,
                                 "content": json.dumps(resultat, ensure_ascii=False, default=str)[:6000]})
        if reponse is None:
            # limite d'étapes atteinte : on demande une synthèse sans nouvel outil
            r = llm.discuter(messages + [{"role": "user", "content": "Fais maintenant ta réponse finale avec les informations obtenues."}],
                             None, prefere=fournisseur)
            reponse = r["contenu"].strip()
    except llm.ErreurLLM as e:
        yield {"type": "erreur", "message": str(e)}
        reponse = None

    # sources sans doublons
    vues, sources = set(), []
    for s in ctx["sources"]:
        cle = (s["type"], s["id"]) if s["id"] is not None else (s["type"], s["libelle"])
        if cle not in vues:
            vues.add(cle)
            sources.append(s)

    echange = CopiloteEchange(utilisateur_id=user.id, question=question[:2000], reponse=reponse,
                              outils=json.dumps(trace, ensure_ascii=False), fournisseur=fournisseur, modele=modele,
                              duree_ms=int((time.time() - debut) * 1000), created_at=datetime.now())
    db.add(echange)
    db.commit()
    if reponse is not None:
        yield {"type": "reponse", "texte": reponse or "…", "sources": sources[:12], "actions": ctx["actions"],
               "echange_id": echange.id, "fournisseur": fournisseur, "modele": modele,
               "duree_ms": echange.duree_ms, "etapes": trace}
