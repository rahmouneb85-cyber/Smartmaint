from datetime import datetime, date, time, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.equipment import Equipment
from app.models.sensor import Sensor
from app.models.alert import Alert
from app.models.intervention import Intervention
from app.models.user import User

router = APIRouter(prefix="/rapports", tags=["Rapports"], dependencies=[Depends(get_current_user)])


def _val(x):
    return getattr(x, "value", x)


def _duree_minutes(i):
    if i.date_debut and i.date_fin:
        return max(0, round((i.date_fin - i.date_debut).total_seconds() / 60))
    return None


def _type_capteur(alerte, capteurs_par_id, capteurs_par_equipement):
    """Type du capteur à l'origine d'une alerte (colonne capteur_id, sinon déduit du type d'alerte)."""
    if alerte.capteur_id and alerte.capteur_id in capteurs_par_id:
        return capteurs_par_id[alerte.capteur_id].type
    for c in capteurs_par_equipement.get(alerte.equipement_id, []):
        if alerte.type and alerte.type.endswith(c.type):
            return c.type
    return "autre"


# ─────────────────────────────────────────────────────────────
# RAPPORT DE MAINTENANCE SUR UNE PÉRIODE (par défaut : les 7 derniers jours)
# ─────────────────────────────────────────────────────────────
@router.get("/maintenance")
def rapport_maintenance(debut: Optional[date] = None, fin: Optional[date] = None, db: Session = Depends(get_db)):
    fin = fin or date.today()
    debut = debut or (fin - timedelta(days=6))
    if debut > fin:
        raise HTTPException(status_code=400, detail="La date de début doit précéder la date de fin")
    t0 = datetime.combine(debut, time.min)
    t1 = datetime.combine(fin, time.max)
    periode_minutes = max(1, (t1 - t0).total_seconds() / 60)
    nb_jours = (fin - debut).days + 1

    equipements = db.query(Equipment).order_by(Equipment.id).all()
    capteurs = db.query(Sensor).all()
    capteurs_par_id = {c.id: c for c in capteurs}
    capteurs_par_equipement = {}
    for c in capteurs:
        if c.actif:
            capteurs_par_equipement.setdefault(c.equipement_id, []).append(c)
    noms_tech = {u.id: u.nom for u in db.query(User).all()}
    noms_eq = {e.id: e.nom for e in equipements}

    alertes = db.query(Alert).filter(Alert.created_at >= t0, Alert.created_at <= t1).all()
    interventions = db.query(Intervention).filter(
        (Intervention.created_at.between(t0, t1)) | (Intervention.date_fin.between(t0, t1))
    ).order_by(Intervention.created_at).all()

    # 1. Alertes : par sévérité, par origine, par type de capteur, par jour
    par_severite = {"critique": 0, "haute": 0, "moyenne": 0, "faible": 0}
    par_origine = {"seuil": 0, "ia": 0}
    par_capteur = {}
    par_jour = {(debut + timedelta(days=k)).isoformat(): {"seuil": 0, "ia": 0} for k in range(nb_jours)}
    for a in alertes:
        s = _val(a.severite)
        par_severite[s] = par_severite.get(s, 0) + 1
        origine = "ia" if (a.type or "").startswith("Anomalie IA") else "seuil"
        par_origine[origine] += 1
        tc = _type_capteur(a, capteurs_par_id, capteurs_par_equipement)
        par_capteur[tc] = par_capteur.get(tc, 0) + 1
        jour = a.created_at.date().isoformat()
        if jour in par_jour:
            par_jour[jour][origine] += 1

    # Alertes graves (critique ou haute) qui n'ont donné lieu à aucune intervention
    ids_traites = {i.alerte_id for i in db.query(Intervention.alerte_id).filter(Intervention.alerte_id.isnot(None)).all()}
    graves_non_traitees = [a for a in alertes
                           if _val(a.severite) in ("critique", "haute") and not (a.type or "").startswith("Anomalie IA")
                           and a.id not in ids_traites]

    # 2. Interventions de la période
    terminees = [i for i in interventions if _val(i.statut) == "terminee" and i.date_fin and t0 <= i.date_fin <= t1]
    correctives_terminees = [i for i in terminees if _val(i.type_intervention) == "corrective" and _duree_minutes(i) is not None]
    arret_total = sum(_duree_minutes(i) for i in correctives_terminees)
    liste_interventions = [{
        "id": i.id, "equipement": noms_eq.get(i.equipement_id), "type_intervention": _val(i.type_intervention),
        "priorite": _val(i.priorite), "statut": _val(i.statut), "technicien": noms_tech.get(i.technicien_id),
        "alerte_id": i.alerte_id, "date": i.date_debut or i.date_intervention or i.created_at,
        "duree_minutes": _duree_minutes(i),
    } for i in interventions]

    # 3. Indicateurs par équipement
    par_equipement = []
    for e in equipements:
        al = [a for a in alertes if a.equipement_id == e.id]
        pannes = [i for i in correctives_terminees if i.equipement_id == e.id]
        arret = sum(_duree_minutes(i) for i in pannes)
        par_equipement.append({
            "id": e.id, "nom": e.nom, "localisation": e.localisation, "statut": _val(e.statut),
            "nb_alertes": len(al),
            "nb_critiques": sum(1 for a in al if _val(a.severite) == "critique"),
            "nb_interventions": sum(1 for i in interventions if i.equipement_id == e.id),
            "nb_ouvertes": sum(1 for i in interventions if i.equipement_id == e.id and _val(i.statut) != "terminee"),
            "nb_pannes": len(pannes),
            "temps_arret_minutes": arret,
            "mttr_minutes": round(arret / len(pannes)) if pannes else None,
            "mtbf_heures": round((periode_minutes - arret) / len(pannes) / 60, 1) if pannes else None,
            "disponibilite": round((periode_minutes - arret) / periode_minutes * 100, 2),
        })

    # 4. Charge de travail par technicien
    charge = {}
    for i in interventions:
        nom = noms_tech.get(i.technicien_id) or "Non assigné"
        c = charge.setdefault(nom, {"technicien": nom, "nb": 0, "terminees": 0, "minutes": 0})
        c["nb"] += 1
        if _val(i.statut) == "terminee":
            c["terminees"] += 1
        c["minutes"] += _duree_minutes(i) or 0

    # 5. Recommandations rédigées automatiquement à partir des chiffres
    recommandations = []
    if par_equipement:
        pire = max(par_equipement, key=lambda x: x["nb_alertes"])
        if pire["nb_alertes"] > 0:
            recommandations.append(f"L'équipement « {pire['nom']} » concentre le plus d'alertes ({pire['nb_alertes']}) : "
                                   f"planifier une inspection préventive complète.")
    if par_capteur:
        tc, n = max(par_capteur.items(), key=lambda x: x[1])
        conseils = {
            "temperature": "vérifier le refroidissement et la lubrification",
            "pression": "contrôler l'étanchéité du circuit et l'état des vannes",
            "vibration": "contrôler les roulements et l'alignement",
            "courant": "contrôler la charge mécanique et l'alimentation électrique",
        }
        noms_capteurs = {"temperature": "température", "pression": "pression", "vibration": "vibration", "courant": "courant"}
        if tc in conseils:
            recommandations.append(f"Les alertes de type « {noms_capteurs[tc]} » sont les plus fréquentes ({n}) : {conseils[tc]}.")
    if graves_non_traitees:
        recommandations.append(f"{len(graves_non_traitees)} alerte(s) de seuil critique(s) ou haute(s) n'ont donné lieu à aucune "
                               f"intervention : les analyser et créer les ordres d'intervention nécessaires.")
    ouvertes = sum(1 for i in interventions if _val(i.statut) != "terminee")
    if ouvertes:
        recommandations.append(f"{ouvertes} intervention(s) restent ouvertes : les clôturer avec un compte rendu.")
    if par_origine["ia"] and par_origine["seuil"]:
        recommandations.append("Les détections IA accompagnent les dépassements de seuil : conserver les deux systèmes, "
                               "l'IA permettant aussi de repérer des dérives avant le seuil.")
    if not recommandations:
        recommandations.append("Aucune anomalie notable sur la période : poursuivre la surveillance habituelle.")

    return {
        "periode": {"debut": debut, "fin": fin, "nb_jours": nb_jours},
        "synthese": {
            "nb_equipements": len(equipements),
            "nb_alertes": len(alertes),
            "nb_interventions": len(interventions),
            "nb_terminees": len(terminees),
            "nb_ouvertes": ouvertes,
            "nb_correctives": sum(1 for i in interventions if _val(i.type_intervention) == "corrective"),
            "nb_preventives": sum(1 for i in interventions if _val(i.type_intervention) == "preventive"),
            "temps_intervention_minutes": sum(_duree_minutes(i) or 0 for i in interventions),
            "mttr_minutes": round(arret_total / len(correctives_terminees)) if correctives_terminees else None,
            "disponibilite_moyenne": round(sum(e["disponibilite"] for e in par_equipement) / len(par_equipement), 2) if par_equipement else None,
            "graves_non_traitees": len(graves_non_traitees),
        },
        "alertes_par_severite": par_severite,
        "alertes_par_origine": par_origine,
        "alertes_par_capteur": par_capteur,
        "alertes_par_jour": [{"jour": j, **v} for j, v in par_jour.items()],
        "equipements": par_equipement,
        "interventions": liste_interventions,
        "techniciens": sorted(charge.values(), key=lambda x: -x["nb"]),
        "recommandations": recommandations,
    }


# ─────────────────────────────────────────────────────────────
# INDICATEURS DU TABLEAU DE BORD (30 derniers jours)
# ─────────────────────────────────────────────────────────────
@router.get("/indicateurs")
def indicateurs(db: Session = Depends(get_db)):
    fin = date.today()
    r = rapport_maintenance(debut=fin - timedelta(days=29), fin=fin, db=db)
    return {"periode": r["periode"], "synthese": r["synthese"], "equipements": r["equipements"]}
