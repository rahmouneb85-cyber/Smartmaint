"""Évaluation de l'assistance à la saisie sur l'historique réel des interventions.

Pour chaque texte déjà saisi (description, diagnostic, actions, pièces, observations), le script simule une personne
qui tape le texte lettre par lettre en retirant l'intervention de l'historique (elle ne peut pas se suggérer elle-même).
Dès qu'une suggestion correspond exactement à la suite du texte (phrase entière ou mot), elle est acceptée avec Tab,
ce qui compte pour une frappe.

Indicateurs :
  • frappes économisées : 1 − (frappes réellement faites, Tab compris) / nombre de caractères du texte ;
  • textes aidés : part des textes pour lesquels au moins une suggestion a été acceptée.

Utilisation (depuis le dossier backend) : python evaluer_saisie.py"""
import copy
import json
import os
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

from app import models  # noqa: F401
from app.core.database import SessionLocal
from app.models.intervention import Intervention
from app.saisie import suggestions as S


def historique_sans(complet: dict, intervention) -> dict:
    """Copie de l'historique sans les formulations ni les mots de cette intervention (évaluation honnête)."""
    h = copy.deepcopy(complet)
    for champ in S.CHAMPS:
        S.compter_mots(h["_mots"], getattr(intervention, champ, None), retirer=True)
        for m in S._morceaux(getattr(intervention, champ, None)):
            cle = S._norm(m)
            e = h[champ].get(cle)
            if e:
                e["compte"] -= 1
                if e["compte"] <= 0:
                    del h[champ][cle]
    return h


def simuler(db, champ, cible, equipement_id):
    """Tape le texte lettre par lettre et accepte une suggestion dès qu'elle correspond exactement à la suite.
    Renvoie (frappes, acceptations)."""
    pos, frappes, acceptations = 0, 0, 0
    n = len(cible)
    while pos < n:
        if pos > 0 and cible[pos - 1] not in " -'":            # on ne consulte les suggestions qu'en cours de mot
            res = S.suggerer(db, champ, cible[:pos], equipement_id, "fr", 6)["suggestions"]
            meilleure = 0
            for s in res:
                r = s["remplacement"]
                if pos < len(r) <= n and S._norm(cible[:len(r)]) == S._norm(r) and len(r) > meilleure:
                    meilleure = len(r)
            if meilleure > pos + 1:                               # accepter rapporte plus qu'une frappe
                frappes += 1
                acceptations += 1
                pos = meilleure
                continue
        frappes += 1
        pos += 1
    return frappes, acceptations


def main():
    db = SessionLocal()
    complet = S.historique(db)
    interventions = db.query(Intervention).filter(Intervention.statut == "terminee").order_by(Intervention.id.desc()).limit(100).all()
    if not interventions:
        print("Aucune intervention terminée : rien à évaluer.")
        return
    original = S.historique
    total_car, total_frappes, essais, aides = 0, 0, 0, 0
    par_champ = {}
    for i in interventions:
        h = historique_sans(complet, i)
        S.historique = lambda db, h=h: h
        for champ in S.CHAMPS:
            for cible in S._morceaux(getattr(i, champ, None)):
                frappes, acceptations = simuler(db, champ, cible, i.equipement_id)
                n = len(cible)
                c = par_champ.setdefault(champ, {"textes": 0, "caracteres": 0, "frappes": 0, "aides": 0})
                c["textes"] += 1; c["caracteres"] += n; c["frappes"] += frappes; c["aides"] += acceptations > 0
                total_car += n; total_frappes += frappes; essais += 1; aides += acceptations > 0
    S.historique = original

    pct = lambda a, b: round(100 * a / b) if b else 0
    resume = {"date": datetime.now().strftime("%d/%m/%Y"), "interventions": len(interventions), "textes": essais,
              "frappes_economisees": pct(total_car - total_frappes, total_car), "textes_aides": pct(aides, essais),
              "par_champ": {k: {"textes": v["textes"], "frappes_economisees": pct(v["caracteres"] - v["frappes"], v["caracteres"]),
                                "textes_aides": pct(v["aides"], v["textes"])} for k, v in par_champ.items()}}
    print("\n══════════ ASSISTANCE À LA SAISIE ══════════")
    print(f"Interventions évaluées : {resume['interventions']} ({essais} textes)")
    print(f"Frappes économisées    : {resume['frappes_economisees']} %  (touche Tab comptée)")
    print(f"Textes aidés           : {resume['textes_aides']} %")
    for k, v in resume["par_champ"].items():
        print(f"  {k:<20} {v['textes']:>3} textes · {v['frappes_economisees']:>3} % de frappes économisées · {v['textes_aides']:>3} % de textes aidés")
    os.makedirs("evaluations", exist_ok=True)
    chemin = os.path.join("evaluations", f"evaluation_saisie_{datetime.now():%Y-%m-%d_%H%M}.json")
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(resume, f, ensure_ascii=False, indent=2)
    print(f"\nRésultat enregistré : {os.path.abspath(chemin)}")


if __name__ == "__main__":
    main()
