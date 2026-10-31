"""Évaluation du copilote de maintenance sur un jeu de 30 questions de référence.

Pour chaque question, la bonne réponse est calculée directement dans la base de données au moment du test
(les données changent en continu avec le simulateur), puis comparée à la réponse du copilote.

Utilisation (depuis le dossier backend, avec MySQL démarré) :
    python evaluer_copilote.py                    toutes les questions
    python evaluer_copilote.py --questions 1-5    seulement les questions 1 à 5
    python evaluer_copilote.py --fournisseur ollama --pause 0

Résultats : affichés dans le terminal et enregistrés dans le dossier evaluations/ (rapport HTML + fichier CSV).
Les échanges de test sont retirés des statistiques du copilote et les actions proposées sont annulées."""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, date

sys.stdout.reconfigure(encoding="utf-8")

from app import models  # noqa: F401  (charge tous les modèles)
from app.core.database import SessionLocal
from app.copilote import agent, llm
from app.copilote.outils import numero_intervention
from app.copilote.recherche import normaliser
from app.models.alert import Alert
from app.models.copilote import CopiloteAction, CopiloteEchange
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.sensor import Sensor
from app.models.sensor_data import SensorData
from app.models.user import User
from app.api.rapport import rapport_maintenance

CHIFFRES_ARABES = str.maketrans("٠١٢٣٤٥٦٧٨٩٫", "0123456789.")


def _val(x):
    return getattr(x, "value", x)


# ─────────────────────────────────────────────────────────────
# VÉRIFICATION D'UNE RÉPONSE
# ─────────────────────────────────────────────────────────────
def nombres_dans(texte: str) -> list:
    t = (texte or "").translate(CHIFFRES_ARABES)
    t = re.sub(r"(?<=\d)[   ](?=\d{3}\b)", "", t)          # 1 234 → 1234
    t = re.sub(r"\[?(OI|FI)-\d{4}-(\d+)\]?", r" \2 ", t)              # OI-2026-0007 → 7
    return [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", t)]


def contient_nombre(reponse: str, acceptes: list, bornes=None) -> bool:
    for x in nombres_dans(reponse):
        if bornes and bornes[0] <= x <= bornes[1]:
            return True
        for a in acceptes:
            if a is not None and abs(x - float(a)) <= max(abs(float(a)) * 0.01, 0.051):
                return True
    return False


def contient_texte(reponse: str, mots: list, tous=False) -> bool:
    r = normaliser(reponse)
    trouves = [normaliser(m) in r for m in mots if m]
    return all(trouves) if tous else any(trouves)


# ─────────────────────────────────────────────────────────────
# DONNÉES DE RÉFÉRENCE
# ─────────────────────────────────────────────────────────────
def contexte(db) -> dict:
    """Choisit dans la base les équipements, alertes et interventions sur lesquels porteront les questions."""
    eqs = db.query(Equipment).order_by(Equipment.id).all()
    capteurs = db.query(Sensor).all()
    avec_capteurs = [e for e in eqs if any(c.equipement_id == e.id for c in capteurs)]
    pompe = next((e for e in eqs if "pompe" in normaliser(e.nom)), avec_capteurs[0] if avec_capteurs else (eqs[0] if eqs else None))
    autre = next((e for e in avec_capteurs if pompe and e.id != pompe.id), None) or next((e for e in eqs if pompe and e.id != pompe.id), pompe)
    vib = next((c for c in capteurs if pompe and c.equipement_id == pompe.id and "vib" in normaliser(c.type)), None)
    seuil = next((c for c in capteurs if c.seuil_max is not None and autre and c.equipement_id == autre.id), None) \
        or next((c for c in capteurs if c.seuil_max is not None), None)
    terminees = db.query(Intervention).filter(Intervention.statut == "terminee").order_by(Intervention.id.desc()).all()
    avec_pieces = next((i for i in terminees if i.pieces_remplacees and pompe and i.equipement_id == pompe.id), None) \
        or next((i for i in terminees if i.pieces_remplacees), None)
    avec_diag = next((i for i in terminees if i.diagnostic), None)
    ouverte_assignee = db.query(Intervention).filter(Intervention.statut != "terminee", Intervention.technicien_id.isnot(None)) \
        .order_by(Intervention.id.desc()).first()
    alerte_vib = db.query(Alert).filter(Alert.type.like("%vibration%")).order_by(Alert.id.desc()).first() \
        or db.query(Alert).order_by(Alert.id.desc()).first()
    return {"pompe": pompe, "autre": autre, "vib": vib, "seuil": seuil, "avec_pieces": avec_pieces, "avec_diag": avec_diag,
            "ouverte_assignee": ouverte_assignee, "alerte": alerte_vib}


def compter_alertes(db, jours=7, **filtres):
    q = db.query(Alert).filter(Alert.created_at >= datetime.now() - timedelta(days=jours))
    if filtres.get("equipement"):
        q = q.filter(Alert.equipement_id == filtres["equipement"].id)
    if filtres.get("severite"):
        q = q.filter(Alert.severite == filtres["severite"])
    if filtres.get("type"):
        q = q.filter(Alert.type.like(f"%{filtres['type']}%"))
    if filtres.get("ia"):
        q = q.filter(Alert.type.like("Anomalie IA%"))
    return q.count()


def rapport30(db):
    return rapport_maintenance(debut=date.today() - timedelta(days=29), fin=date.today(), db=db)


def techniciens_charge(db):
    res = {}
    for u in db.query(User).filter(User.role == "technicien", User.actif.is_(True)).all():
        res[u.nom] = db.query(Intervention).filter(Intervention.technicien_id == u.id, Intervention.statut != "terminee").count()
    return res


def mot_cle(texte: str) -> list:
    """Mots significatifs d'un texte libre (diagnostic, pièces) : la réponse doit en reprendre au moins un."""
    mots = [m for m in re.findall(r"[A-Za-zÀ-ÿ0-9]{5,}", texte or "") if normaliser(m) not in {"remplacement", "controle", "verification"}]
    return mots[:4] or [texte or ""]


# ─────────────────────────────────────────────────────────────
# LES 30 QUESTIONS
# Chaque question renvoie (texte, langue, verification, outils attendus) ; verification(db, reponse, avant) → bool
# « avant » contient les valeurs mesurées juste avant la question (les données vivantes bougent pendant le test).
# ─────────────────────────────────────────────────────────────
def questions(db, c):
    P, A = c["pompe"], c["autre"]
    Q = []

    def ajouter(categorie, texte, langue, verifier, outils, avant=None, applicable=True):
        Q.append({"categorie": categorie, "question": texte, "langue": langue, "verifier": verifier,
                  "outils": outils, "avant": avant, "applicable": applicable})

    nb_eq = lambda d: d.query(Equipment).count()
    ajouter("Équipements", "Combien d'équipements sont enregistrés dans SmartMaint ?", "fr",
            lambda d, r, av: contient_nombre(r, [nb_eq(d)]), {"lister_equipements"})
    ajouter("Équipements", f"Où se trouve l'équipement {P.nom} ?", "fr",
            lambda d, r, av: contient_texte(r, [P.localisation]), {"lister_equipements", "etat_equipement"}, applicable=bool(P and P.localisation))
    ajouter("Équipements", f"Quel est le statut actuel de {A.nom} ?", "fr",
            lambda d, r, av: contient_texte(r, [_val(d.get(Equipment, A.id).statut)]), {"lister_equipements", "etat_equipement"})
    ajouter("Équipements", f"Combien de capteurs actifs sont installés sur {P.nom} ?", "fr",
            lambda d, r, av: contient_nombre(r, [d.query(Sensor).filter(Sensor.equipement_id == P.id, Sensor.actif.is_(True)).count()]),
            {"lister_equipements", "etat_equipement"})

    # ── capteurs ──
    vib = c["vib"]
    if vib:
        dernier_id = lambda d: (d.query(SensorData.id).filter(SensorData.capteur_id == vib.id).order_by(SensorData.id.desc()).first() or [0])[0]
        def verif_mesure(d, r, av):
            valeurs = [m.valeur for m in d.query(SensorData).filter(SensorData.capteur_id == vib.id, SensorData.id >= av).all()]
            return contient_nombre(r, [round(v, 2) for v in valeurs] + [round(v, 1) for v in valeurs])
        ajouter("Capteurs", f"Quelle est la dernière valeur mesurée par le capteur de vibration de {P.nom} ?", "fr",
                verif_mesure, {"etat_equipement"}, avant=dernier_id)
    else:
        ajouter("Capteurs", "Dernière valeur de vibration", "fr", None, set(), applicable=False)
    s = c["seuil"]
    ajouter("Capteurs", f"Quel est le seuil maximal du capteur de {s.type if s else ''} de "
            f"{db.get(Equipment, s.equipement_id).nom if s else ''} ?", "fr",
            lambda d, r, av: contient_nombre(r, [s.seuil_max]), {"etat_equipement"}, applicable=bool(s))

    # ── alertes (comptées avant et après la question, car le simulateur en crée en continu) ──
    def verif_compte(**f):
        return lambda d, r, av: contient_nombre(r, [], bornes=(av, compter_alertes(d, **f)))
    ajouter("Alertes", "Combien d'alertes critiques ont été enregistrées sur les 7 derniers jours ?", "fr",
            verif_compte(severite="critique"), {"rechercher_alertes", "indicateurs_maintenance"},
            avant=lambda d: compter_alertes(d, severite="critique"))
    ajouter("Alertes", f"Combien d'alertes a eu {P.nom} cette semaine ?", "fr",
            verif_compte(equipement=P), {"rechercher_alertes", "etat_equipement"}, avant=lambda d: compter_alertes(d, equipement=P))
    ajouter("Alertes", f"Combien d'alertes de vibration sur {P.nom} ces 7 derniers jours ?", "fr",
            verif_compte(equipement=P, type="vibration"), {"rechercher_alertes"},
            avant=lambda d: compter_alertes(d, equipement=P, type="vibration"))
    ajouter("Alertes", "Combien d'anomalies ont été détectées par l'IA cette semaine ?", "fr",
            verif_compte(ia=True), {"rechercher_alertes", "indicateurs_maintenance"}, avant=lambda d: compter_alertes(d, ia=True))

    def plus_alertes(d):
        cpt = {e.nom: compter_alertes(d, equipement=e) for e in d.query(Equipment).all()}
        m = max(cpt.values()) if cpt else 0
        return [n for n, v in cpt.items() if v == m and m > 0]
    ajouter("Alertes", "Quel équipement a eu le plus d'alertes sur les 7 derniers jours ?", "fr",
            lambda d, r, av: contient_texte(r, plus_alertes(d) + (av or [])), {"rechercher_alertes", "indicateurs_maintenance", "lister_equipements"},
            avant=plus_alertes)

    der_crit = lambda d: (d.query(Alert.id).filter(Alert.severite == "critique").order_by(Alert.id.desc()).first() or [0])[0]
    ajouter("Alertes", "Quelle est la toute dernière alerte critique ? Donne son numéro.", "fr",
            lambda d, r, av: contient_nombre(r, [], bornes=(av, der_crit(d))), {"rechercher_alertes"}, avant=der_crit)

    a = c["alerte"]
    if a:
        from app.api.alert import get_rapport_incident
        try:
            an = get_rapport_incident(a.id, db).get("analyse") or {}
        except Exception:
            an = {}
        v = an.get("valeur_declenchante")
        ajouter("Alertes", f"Analyse l'alerte #{a.id} : quelle valeur a déclenché cette alerte ?", "fr",
                lambda d, r, av: contient_nombre(r, [v, round(v, 1) if v else None]), {"analyser_alerte"}, applicable=v is not None)
    else:
        ajouter("Alertes", "Analyse d'alerte", "fr", None, set(), applicable=False)

    # ── interventions ──
    nb_ouv = lambda d: d.query(Intervention).filter(Intervention.statut != "terminee").count()
    ajouter("Interventions", "Combien d'interventions sont encore ouvertes (non terminées) ?", "fr",
            lambda d, r, av: contient_nombre(r, [nb_ouv(d), av]), {"rechercher_interventions", "indicateurs_maintenance", "lister_techniciens"},
            avant=nb_ouv)
    planif = lambda d: [i.id for i in d.query(Intervention).filter(Intervention.statut == "planifiee").all()]
    ajouter("Interventions", "Quelles interventions sont planifiées ? Donne leurs numéros.", "fr",
            lambda d, r, av: all(contient_nombre(r, [x]) for x in planif(d)[-8:]), {"rechercher_interventions"},
            applicable=bool(planif(db)))
    o = c["ouverte_assignee"]
    if o:
        tech = db.get(User, o.technicien_id)
        ajouter("Interventions", f"Qui est assigné à l'intervention {numero_intervention(o)} ?", "fr",
                lambda d, r, av: contient_texte(r, [tech.nom] + tech.nom.split()[:1]), {"rechercher_interventions"})
    else:
        ajouter("Interventions", "Technicien assigné", "fr", None, set(), applicable=False)
    ip = c["avec_pieces"]
    ajouter("Historique (RAG)", f"Quelles pièces ont déjà été remplacées sur {db.get(Equipment, ip.equipement_id).nom if ip else ''} ?", "fr",
            lambda d, r, av: contient_texte(r, mot_cle(ip.pieces_remplacees)), {"recherche_documentaire", "rechercher_interventions"},
            applicable=bool(ip))
    idg = c["avec_diag"]
    ajouter("Historique (RAG)", f"Quel diagnostic a été posé lors de l'intervention {numero_intervention(idg) if idg else ''} ?", "fr",
            lambda d, r, av: contient_texte(r, mot_cle(idg.diagnostic)), {"recherche_documentaire", "rechercher_interventions"},
            applicable=bool(idg))
    ajouter("Historique (RAG)", f"Y a-t-il déjà eu des problèmes de roulement sur {P.nom} ? Résume l'historique.", "fr",
            lambda d, r, av: contient_texte(r, ["roulement"]) and (not ip or contient_nombre(r, [ip.id]) or contient_texte(r, mot_cle(ip.pieces_remplacees))),
            {"recherche_documentaire", "rechercher_interventions"})
    nb_term = lambda d: d.query(Intervention).filter(Intervention.statut == "terminee",
                                                      Intervention.created_at >= datetime.now() - timedelta(days=30)).count()
    ajouter("Interventions", "Combien d'interventions ont été terminées sur les 30 derniers jours ?", "fr",
            lambda d, r, av: contient_nombre(r, [nb_term(d), rapport30(d)["synthese"]["nb_terminees"]]),
            {"rechercher_interventions", "indicateurs_maintenance"})

    def moins_charge(d):
        ch = techniciens_charge(d)
        m = min(ch.values()) if ch else 0
        return [n for n, v in ch.items() if v == m]
    ajouter("Techniciens", "Quel technicien a le moins d'interventions ouvertes ?", "fr",
            lambda d, r, av: contient_texte(r, moins_charge(d)), {"lister_techniciens"}, applicable=bool(techniciens_charge(db)))

    # ── indicateurs ──
    s30 = rapport30(db)["synthese"]
    mttr = s30.get("mttr_minutes")
    ajouter("Indicateurs", "Quel est le MTTR global sur les 30 derniers jours ?", "fr",
            lambda d, r, av: contient_nombre(r, [mttr, round(mttr / 60, 1), round(mttr / 60, 2)]) if mttr else contient_texte(r, ["aucun", "pas de", "non disponible", "pas assez"]),
            {"indicateurs_maintenance"})
    dispo = lambda d: next((x["disponibilite"] for x in rapport30(d)["equipements"] if x["id"] == P.id), None)
    ajouter("Indicateurs", f"Quelle est la disponibilité de {P.nom} sur les 30 derniers jours ?", "fr",
            lambda d, r, av: contient_nombre(r, [dispo(d), round(dispo(d) or 0, 1)]), {"etat_equipement", "indicateurs_maintenance"},
            applicable=dispo(db) is not None)
    pannes = lambda d: sum(x["nb_pannes"] for x in rapport30(d)["equipements"])
    ajouter("Indicateurs", "Combien de pannes ont été enregistrées au total sur les 30 derniers jours ?", "fr",
            lambda d, r, av: contient_nombre(r, [pannes(d), s30.get("nb_correctives")]), {"indicateurs_maintenance"})
    mtbf = lambda d: next((x["mtbf_heures"] for x in rapport30(d)["equipements"] if x["id"] == P.id), None)
    ajouter("Indicateurs", f"Quel est le MTBF de {P.nom} sur 30 jours ?", "fr",
            lambda d, r, av: contient_nombre(r, [mtbf(d), round(mtbf(d) or 0)]) if mtbf(d) else contient_texte(r, ["aucun", "pas de", "non disponible", "pas assez", "aucune panne"]),
            {"etat_equipement", "indicateurs_maintenance"})

    # ── multilingue ──
    ajouter("Multilingue", "How many pieces of equipment are registered in SmartMaint?", "en",
            lambda d, r, av: contient_nombre(r, [nb_eq(d)]), {"lister_equipements"})
    ajouter("Multilingue", "كم عدد المعدات المسجلة في SmartMaint؟", "ar",
            lambda d, r, av: contient_nombre(r, [nb_eq(d)]), {"lister_equipements"})
    ajouter("Multilingue", "Which technician has the fewest open interventions?", "en",
            lambda d, r, av: contient_texte(r, moins_charge(d)), {"lister_techniciens"}, applicable=bool(techniciens_charge(db)))

    # ── fiabilité ──
    ajouter("Fiabilité", "Quel est l'état du compresseur Z99 ?", "fr",
            # la réponse doit dire que l'équipement n'existe pas, sans inventer de données sur un autre équipement
            lambda d, r, av: bool(re.search(r"introuvable|n.?existe pas|pas (ete |ete )?trouve|trouve aucun|aucun (equipement|compresseur)"
                                            r"|ne figure pas|pas d.?equipement|inconnu|pas reference|n.?est pas (enregistre|repertorie)",
                                            normaliser(r))),
            {"etat_equipement", "lister_equipements"})
    ajouter("Fiabilité", f"Prépare une intervention préventive de graissage sur {A.nom}.", "fr",
            None, {"proposer_intervention"})          # vérifiée à part : une action doit être proposée, rien ne doit être créé
    return Q


# ─────────────────────────────────────────────────────────────
# EXÉCUTION
# ─────────────────────────────────────────────────────────────
def poser(db, user, q):
    debut = time.time()
    fin = {"texte": "", "sources": [], "actions": [], "etapes": [], "echange_id": None, "modele": None}
    erreur = None
    for ev in agent.executer(db, user, q["question"], [], q["langue"]):
        if ev["type"] == "reponse":
            fin = ev
        elif ev["type"] == "erreur":
            erreur = ev["message"]
    return fin, erreur, time.time() - debut


def plage(texte, total):
    if not texte:
        return set(range(1, total + 1))
    res = set()
    for morceau in texte.split(","):
        a, _, b = morceau.partition("-")
        res.update(range(int(a), int(b or a) + 1))
    return res


def rapport_html(lignes, resume, chemin):
    couleur = "#22c55e" if resume["precision"] >= 80 else "#f59e0b" if resume["precision"] >= 60 else "#ef4444"
    cats = "".join(f"<tr><td>{html.escape(k)}</td><td>{v['ok']} / {v['total']}</td></tr>" for k, v in resume["par_categorie"].items())
    rows = "".join(
        f"<tr class='{'ok' if l['resultat'] == 'Correct' else 'ko' if l['resultat'] == 'Incorrect' else 'na'}'>"
        f"<td>{l['n']}</td><td>{html.escape(l['categorie'])}</td><td>{html.escape(l['question'])}</td>"
        f"<td><b>{l['resultat']}</b></td><td>{'oui' if l['outil_ok'] else 'non'}</td><td>{l['duree_s']}</td>"
        f"<td class='rep'>{html.escape(l['reponse'][:400])}</td></tr>" for l in lignes)
    page = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Évaluation du copilote SmartMaint</title>
<style>body{{font-family:Segoe UI,Arial,sans-serif;background:#0f1117;color:#e5e7eb;margin:0;padding:28px}}
h1{{color:#FF6B00;margin:0 0 4px}} .sub{{color:#9ca3af;margin-bottom:22px}}
.kpis{{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}} .kpi{{background:#1a1d2e;border-radius:12px;padding:14px 18px;min-width:150px}}
.kpi b{{display:block;font-size:26px}} .kpi span{{color:#9ca3af;font-size:13px}}
table{{border-collapse:collapse;width:100%;background:#1a1d2e;border-radius:12px;overflow:hidden;margin-bottom:22px}}
th,td{{padding:8px 10px;border-bottom:1px solid #2a2d3e;text-align:left;vertical-align:top;font-size:13px}} th{{color:#FF6B00}}
tr.ok b{{color:#22c55e}} tr.ko b{{color:#ef4444}} tr.na{{opacity:.5}} td.rep{{color:#9ca3af;max-width:420px}}</style></head><body>
<h1>Évaluation du copilote de maintenance</h1>
<div class="sub">Jeu de {resume['total']} questions de référence · {resume['date']} · modèle {html.escape(str(resume['modele']))}</div>
<div class="kpis"><div class="kpi"><b style="color:{couleur}">{resume['precision']} %</b><span>Précision ({resume['correctes']} / {resume['evaluees']})</span></div>
<div class="kpi"><b>{resume['bons_outils']} %</b><span>Choix des bons outils</span></div>
<div class="kpi"><b>{resume['appuyees']} %</b><span>Réponses appuyées sur des données réelles</span></div>
<div class="kpi"><b>{resume['citations']} %</b><span>Sources citées dans le texte</span></div>
<div class="kpi"><b>{resume['duree_moyenne']} s</b><span>Temps de réponse moyen</span></div>
<div class="kpi"><b>{resume['erreurs']}</b><span>Questions sans réponse</span></div></div>
<table><tr><th>Catégorie</th><th>Réponses correctes</th></tr>{cats}</table>
<table><tr><th>N°</th><th>Catégorie</th><th>Question</th><th>Résultat</th><th>Bon outil</th><th>Durée (s)</th><th>Réponse (début)</th></tr>{rows}</table>
</body></html>"""
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)


def main():
    ap = argparse.ArgumentParser(description="Évaluation du copilote sur 30 questions de référence")
    ap.add_argument("--questions", help="ex. 1-5 ou 3,7,12")
    ap.add_argument("--fournisseur", choices=["gemini", "ollama"], help="force un seul fournisseur (sinon : réglage du .env)")
    ap.add_argument("--pause", type=float, default=6, help="pause entre deux questions, en secondes (quota de l'API en ligne)")
    args = ap.parse_args()
    if args.fournisseur:
        llm._fournisseurs = lambda: [args.fournisseur]

    db = SessionLocal()
    user = db.query(User).filter(User.role == "admin", User.actif.is_(True)).order_by(User.id).first()
    if not user:
        print("❌ Aucun compte administrateur actif.")
        return
    ctx = contexte(db)
    if not ctx["pompe"]:
        print("❌ Aucun équipement dans la base.")
        return
    liste = questions(db, ctx)
    choisies = plage(args.questions, len(liste))
    print(f"Évaluation du copilote : {len(choisies)} question(s), fournisseur {llm._fournisseurs()[0]}\n")

    lignes, echanges, modele = [], [], None
    for n, q in enumerate(liste, 1):
        if n not in choisies:
            continue
        if not q["applicable"]:
            print(f"➖ {n:02d} [{q['categorie']}] non applicable (pas de données de ce type dans la base)")
            lignes.append({"n": n, "categorie": q["categorie"], "question": q["question"], "resultat": "Non applicable",
                           "outil_ok": False, "duree_s": 0, "reponse": "", "outils_utilises": ""})
            continue
        avant = q["avant"](db) if q["avant"] else None
        actions_avant = db.query(Intervention).count()
        fin, erreur, duree = poser(db, user, q)
        db.expire_all()
        reponse = fin.get("texte") or ""
        outils_utilises = [e["outil"] for e in fin.get("etapes") or []]
        if fin.get("echange_id"):
            echanges.append(fin["echange_id"])
        modele = fin.get("modele") or modele
        if q["verifier"] is None:   # question d'action : une action en attente, aucune intervention créée
            correct = bool(fin.get("actions")) and db.query(Intervention).count() == actions_avant
        else:
            try:
                correct = bool(reponse) and q["verifier"](db, reponse, avant)
            except Exception as e:
                correct, erreur = False, f"vérification impossible : {e}"
        outil_ok = bool(set(outils_utilises) & q["outils"])
        lignes.append({"n": n, "categorie": q["categorie"], "question": q["question"],
                       "resultat": "Correct" if correct else ("Erreur" if erreur and not reponse else "Incorrect"),
                       "outil_ok": outil_ok, "duree_s": round(duree, 1), "reponse": reponse.replace("\n", " ") or (erreur or ""),
                       "outils_utilises": ", ".join(outils_utilises), "cite": "[" in reponse,
                       "appuyee": bool(fin.get("sources")) or bool(fin.get("actions"))})
        print(f"{'✅' if correct else '❌'} {n:02d} [{q['categorie']}] {q['question'][:70]}  ({round(duree, 1)} s)")
        if not correct:
            print(f"      réponse : {(reponse or erreur or '')[:220]}")
        time.sleep(args.pause)

    # nettoyage : les tests ne doivent pas fausser les statistiques ni laisser d'actions en attente
    for a in db.query(CopiloteAction).filter(CopiloteAction.statut == "en_attente", CopiloteAction.utilisateur_id == user.id).all():
        a.statut = "annulee"
    if echanges:
        db.query(CopiloteEchange).filter(CopiloteEchange.id.in_(echanges)).delete(synchronize_session=False)
    db.commit()

    evaluees = [l for l in lignes if l["resultat"] != "Non applicable"]
    correctes = sum(1 for l in evaluees if l["resultat"] == "Correct")
    par_cat = {}
    for l in evaluees:
        c = par_cat.setdefault(l["categorie"], {"ok": 0, "total": 0})
        c["total"] += 1
        c["ok"] += l["resultat"] == "Correct"
    pct = lambda x: round(100 * x / len(evaluees)) if evaluees else 0
    resume = {"date": datetime.now().strftime("%d/%m/%Y"), "modele": modele, "total": len(lignes), "evaluees": len(evaluees),
              "correctes": correctes, "precision": pct(correctes), "bons_outils": pct(sum(l["outil_ok"] for l in evaluees)),
              "citations": pct(sum(bool(l.get("cite")) for l in evaluees)),
              "appuyees": pct(sum(bool(l.get("appuyee")) for l in evaluees)),
              "duree_moyenne": round(sum(l["duree_s"] for l in evaluees) / len(evaluees), 1) if evaluees else 0,
              "erreurs": sum(1 for l in evaluees if l["resultat"] == "Erreur"), "par_categorie": par_cat}

    os.makedirs("evaluations", exist_ok=True)
    base = os.path.join("evaluations", f"evaluation_copilote_{datetime.now():%Y-%m-%d_%H%M}")
    with open(base + ".csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["n", "categorie", "question", "resultat", "outil_ok", "outils_utilises", "duree_s", "reponse"],
                           delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump(resume, f, ensure_ascii=False, indent=2)
    rapport_html(lignes, resume, base + ".html")

    print(f"\n══════════ RÉSULTAT ══════════")
    print(f"Précision         : {resume['precision']} %  ({correctes} / {len(evaluees)} questions)")
    print(f"Bons outils       : {resume['bons_outils']} %")
    print(f"Appuyées sur des données : {resume['appuyees']} %")
    print(f"Sources citées    : {resume['citations']} %")
    print(f"Temps moyen       : {resume['duree_moyenne']} s")
    for k, v in par_cat.items():
        print(f"  {k:<18} {v['ok']} / {v['total']}")
    print(f"\nRapport : {os.path.abspath(base + '.html')}")


if __name__ == "__main__":
    main()
