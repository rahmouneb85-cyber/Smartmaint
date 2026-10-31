"""Création des notifications.

Les notifications sont créées automatiquement, quel que soit l'endroit du code qui produit l'événement
(mesure hors seuil, anomalie IA, création par l'API, workflow…) : des écouteurs SQLAlchemy réagissent à
l'enregistrement d'une alerte ou d'une intervention, dans la même transaction.

Pour éviter de submerger les utilisateurs, les événements répétés sont regroupés : une notification non lue
de même clé (même équipement et même type d'alerte, par exemple) créée depuis moins d'une heure est mise à
jour (« 3 alertes critiques… ») au lieu d'en créer une nouvelle.
"""
import json
from datetime import datetime, timedelta

from sqlalchemy import and_, event, inspect, select, update
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.equipment import Equipment
from app.models.intervention import Intervention
from app.models.notification import Notification
from app.models.user import User

T = Notification.__table__
FENETRE_REGROUPEMENT = timedelta(hours=1)
SEVERITES_NOTIFIEES = {"haute": "attention", "critique": "critique"}


def _val(x):
    return getattr(x, "value", x)


def destinataires(connexion, roles=None, ids=None) -> list:
    """Comptes actifs ayant l'un des rôles donnés (ou les identifiants donnés)."""
    u = User.__table__
    q = select(u.c.id).where(u.c.actif.is_(True))
    if roles:
        q = q.where(u.c.role.in_(roles))
    if ids:
        q = q.where(u.c.id.in_(ids))
    return [r[0] for r in connexion.execute(q)]


def creer(connexion, utilisateurs: list, type_: str, titre: str, message: str = None, niveau: str = "info",
          page: str = None, objet_id: int = None, cle: str = None, titre_groupe: str = None, donnees: dict = None):
    """Crée (ou regroupe) une notification pour chaque utilisateur. `connexion` : Connection ou Session."""
    maintenant = datetime.now()
    for uid in set(utilisateurs):
        existante = None
        if cle:
            existante = connexion.execute(select(T.c.id, T.c.nombre).where(and_(
                T.c.utilisateur_id == uid, T.c.cle == cle, T.c.lue.is_(False),
                T.c.created_at >= maintenant - FENETRE_REGROUPEMENT))).first()
        if existante:
            n = existante.nombre + 1
            connexion.execute(update(T).where(T.c.id == existante.id).values(
                nombre=n, message=message, objet_id=objet_id, created_at=maintenant, donnees=_json(donnees, n),
                titre=(titre_groupe or titre).replace("{n}", str(n))[:200]))
        else:
            connexion.execute(T.insert().values(
                utilisateur_id=uid, type=type_, niveau=niveau, titre=titre.replace("{n}", "1")[:200], message=message, donnees=_json(donnees, 1),
                page=page, objet_id=objet_id, cle=cle, nombre=1, lue=False, created_at=maintenant))


def _json(donnees, n):
    return json.dumps({**donnees, "n": n}, ensure_ascii=False) if donnees else None


def notifier_session(db: Session, roles=None, ids=None, **kwargs):
    """Version utilisable depuis une route ou un module métier (session ouverte)."""
    connexion = db.connection()
    creer(connexion, destinataires(connexion, roles, ids), **kwargs)


# ─────────────────────────────────────────────────────────────
# ÉCOUTEURS : alertes et interventions
# ─────────────────────────────────────────────────────────────
@event.listens_for(Alert, "after_insert")
def _alerte_creee(mapper, connexion, alerte):
    severite = _val(alerte.severite)
    if severite not in SEVERITES_NOTIFIEES:
        return
    e = Equipment.__table__
    nom = connexion.execute(select(e.c.nom).where(e.c.id == alerte.equipement_id)).scalar() or "équipement"
    creer(connexion, destinataires(connexion, roles=["admin", "superviseur"]), "alerte",
          titre=f"Alerte {severite} : {alerte.type} sur {nom}",
          titre_groupe=f"{{n}} alertes {severite}s : {alerte.type} sur {nom}",
          message=alerte.message, niveau=SEVERITES_NOTIFIEES[severite], page="dashboard", objet_id=alerte.id,
          donnees={"modele": "alerte", "severite": severite, "type": alerte.type, "equipement": nom},
          cle=f"alerte:{alerte.equipement_id}:{alerte.type}:{severite}"[:120])


def _intervention_assignee(connexion, i, nouvelle: bool):
    e = Equipment.__table__
    nom = connexion.execute(select(e.c.nom).where(e.c.id == i.equipement_id)).scalar() or "équipement"
    priorite = _val(i.priorite) or "normale"
    creer(connexion, destinataires(connexion, ids=[i.technicien_id]), "intervention",
          titre=f"{'Nouvelle intervention' if nouvelle else 'Intervention'} assignée : {nom}",
          message=(i.description or "")[:300], niveau="attention" if priorite in ("haute", "urgente") else "info",
          donnees={"modele": "intervention_nouvelle" if nouvelle else "intervention", "equipement": nom},
          page="interventions", objet_id=i.id)


@event.listens_for(Intervention, "after_insert")
def _intervention_creee(mapper, connexion, i):
    if i.technicien_id:
        _intervention_assignee(connexion, i, True)


@event.listens_for(Intervention, "after_update")
def _intervention_modifiee(mapper, connexion, i):
    historique = inspect(i).attrs.technicien_id.history
    if historique.has_changes() and i.technicien_id:
        _intervention_assignee(connexion, i, False)
