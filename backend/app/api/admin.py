"""Console d'administration de la sécurité : utilisateurs, sessions, appareils et journal."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import exiger_roles
from app.core.sessions import journaliser, sessions_actives, revoquer
from app.core import mfa, sauvegarde
from app.api.auth import decrire_session
from app.models.user import User, RoleEnum
from app.models.appareil import Appareil
from app.models.journal_securite import JournalSecurite
from app.models.session_utilisateur import SessionUtilisateur

router = APIRouter(prefix="/admin", tags=["Administration sécurité"])
admin_requis = exiger_roles("admin")


# ─────────────────────────────────────────────────────────────
# TABLEAU DE BORD DE SÉCURITÉ
# ─────────────────────────────────────────────────────────────
@router.get("/securite/resume", dependencies=[Depends(admin_requis)])
def resume(db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    depuis = datetime.now() - timedelta(hours=24)
    def compter(ev):
        return db.query(JournalSecurite).filter(JournalSecurite.evenement == ev, JournalSecurite.created_at > depuis).count()
    return {
        "utilisateurs": db.query(User).count(),
        "utilisateurs_actifs": db.query(User).filter(User.actif.is_(True)).count(),
        "sessions_actives": sessions_actives(db).count(),
        "appareils": db.query(Appareil).count(),
        "appareils_bloques": db.query(Appareil).filter(Appareil.statut == "bloque").count(),
        "connexions_24h": compter("connexion_reussie"),
        "echecs_24h": compter("echec_connexion"),
        "blocages_24h": compter("connexion_bloquee"),
        "inhabituelles_24h": compter("connexion_inhabituelle"),
    }


# ─────────────────────────────────────────────────────────────
# UTILISATEURS
# ─────────────────────────────────────────────────────────────
class ModifUtilisateur(BaseModel):
    actif: Optional[bool] = None
    role: Optional[RoleEnum] = None


@router.get("/utilisateurs", dependencies=[Depends(admin_requis)])
def utilisateurs(db: Session = Depends(get_db)):
    return [{
        "id": u.id, "nom": u.nom, "email": u.email, "role": getattr(u.role, "value", u.role), "actif": u.actif,
        "created_at": u.created_at, "sessions_actives": sessions_actives(db, u.id).count(),
        "totp_actif": bool(u.totp_actif),
    } for u in db.query(User).order_by(User.id).all()]


@router.put("/utilisateurs/{id}")
def modifier_utilisateur(id: int, data: ModifUtilisateur, request: Request, db: Session = Depends(get_db),
                         admin: User = Depends(admin_requis)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == admin.id and (data.actif is False or (data.role and data.role != RoleEnum.admin)):
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver ou rétrograder votre propre compte")
    changements = []
    if data.actif is not None and data.actif != user.actif:
        user.actif = data.actif
        changements.append("activé" if data.actif else "désactivé")
        if not data.actif:
            revoquer(db, sessions_actives(db, user.id).all(), "compte desactive")
    if data.role is not None and data.role != user.role:
        user.role = data.role
        changements.append(f"rôle {data.role.value}")
        revoquer(db, sessions_actives(db, user.id).all(), "changement de role")   # nouveaux droits à la reconnexion
    db.commit()
    if changements:
        journaliser(db, request, "modification_compte", email=user.email, utilisateur_id=admin.id,
                    details=f"Compte {user.id} : {', '.join(changements)} par {admin.email}")
    return {"message": "Compte mis à jour", "changements": changements}


@router.post("/utilisateurs/{id}/deconnecter")
def deconnecter_utilisateur(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    n = revoquer(db, sessions_actives(db, id).all(), "deconnexion a distance")
    journaliser(db, request, "deconnexion_distance", email=user.email, utilisateur_id=admin.id,
                details=f"{n} session(s) de {user.email} fermée(s) par {admin.email}")
    return {"message": f"{n} session(s) fermée(s)"}


@router.post("/utilisateurs/{id}/reinitialiser-2fa")
def reinitialiser_2fa(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    """Pour un utilisateur qui a perdu son téléphone et ses codes de secours."""
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    mfa.desactiver(user)
    db.commit()
    n = revoquer(db, sessions_actives(db, id).all(), "reinitialisation 2FA")
    journaliser(db, request, "mfa_reinitialisee", email=user.email, utilisateur_id=admin.id,
                details=f"2FA de {user.email} réinitialisée par {admin.email}, {n} session(s) fermée(s)")
    return {"message": "Double authentification réinitialisée"}


# ─────────────────────────────────────────────────────────────
# SESSIONS
# ─────────────────────────────────────────────────────────────
@router.get("/sessions", dependencies=[Depends(admin_requis)])
def toutes_les_sessions(db: Session = Depends(get_db)):
    noms = {u.id: (u.nom, u.email) for u in db.query(User).all()}
    lignes = sessions_actives(db).order_by(SessionUtilisateur.derniere_activite.desc()).all()
    resultat = []
    for s in lignes:
        d = decrire_session(s, db)
        d["nom"], d["email"] = noms.get(s.utilisateur_id, ("?", "?"))
        resultat.append(d)
    return resultat


@router.delete("/sessions/{id}")
def fermer_session(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    s = db.query(SessionUtilisateur).filter(SessionUtilisateur.id == id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session introuvable")
    revoquer(db, [s], "deconnexion a distance")
    journaliser(db, request, "deconnexion_distance", utilisateur_id=admin.id,
                details=f"Session {id} de l'utilisateur {s.utilisateur_id} fermée par {admin.email}")
    return {"message": "Session fermée"}


# ─────────────────────────────────────────────────────────────
# APPAREILS
# ─────────────────────────────────────────────────────────────
@router.get("/appareils", dependencies=[Depends(admin_requis)])
def appareils(db: Session = Depends(get_db)):
    noms = {u.id: (u.nom, u.email) for u in db.query(User).all()}
    return [{
        "id": a.id, "utilisateur_id": a.utilisateur_id, "nom_utilisateur": noms.get(a.utilisateur_id, ("?", "?"))[0],
        "email": noms.get(a.utilisateur_id, ("?", "?"))[1], "appareil": a.nom, "systeme": a.systeme,
        "navigateur": a.navigateur, "statut": a.statut, "premiere_connexion": a.premiere_connexion,
        "derniere_connexion": a.derniere_connexion, "derniere_ip": a.derniere_ip, "localisation": a.localisation,
        "sessions_actives": sessions_actives(db).filter(SessionUtilisateur.appareil_id == a.id).count(),
    } for a in db.query(Appareil).order_by(Appareil.derniere_connexion.desc()).all()]


def _appareil(db, id):
    a = db.query(Appareil).filter(Appareil.id == id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Appareil introuvable")
    return a


@router.put("/appareils/{id}/bloquer")
def bloquer_appareil(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    a = _appareil(db, id)
    a.statut = "bloque"
    db.commit()
    n = revoquer(db, sessions_actives(db).filter(SessionUtilisateur.appareil_id == id).all(), "appareil bloque")
    journaliser(db, request, "appareil_bloque_admin", utilisateur_id=admin.id,
                details=f"Appareil {id} ({a.nom}) bloqué, {n} session(s) fermée(s)")
    return {"message": f"Appareil bloqué, {n} session(s) fermée(s)"}


@router.put("/appareils/{id}/reactiver")
def reactiver_appareil(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    a = _appareil(db, id)
    a.statut = "autorise"
    db.commit()
    journaliser(db, request, "appareil_reactive", utilisateur_id=admin.id, details=f"Appareil {id} ({a.nom}) réactivé")
    return {"message": "Appareil réactivé"}


@router.delete("/appareils/{id}")
def supprimer_appareil(id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    a = _appareil(db, id)
    n = revoquer(db, sessions_actives(db).filter(SessionUtilisateur.appareil_id == id).all(), "appareil supprime")
    nom = a.nom
    db.delete(a)
    db.commit()
    journaliser(db, request, "appareil_supprime", utilisateur_id=admin.id,
                details=f"Appareil {id} ({nom}) supprimé, {n} session(s) fermée(s)")
    return {"message": "Appareil supprimé"}


# ─────────────────────────────────────────────────────────────
# JOURNAL DE SÉCURITÉ
# ─────────────────────────────────────────────────────────────
@router.get("/journal", dependencies=[Depends(admin_requis)])
def journal(evenement: Optional[str] = None, email: Optional[str] = None, limite: int = 200,
            db: Session = Depends(get_db)):
    q = db.query(JournalSecurite)
    if evenement:
        q = q.filter(JournalSecurite.evenement == evenement)
    if email:
        q = q.filter(JournalSecurite.email == email.lower().strip())
    lignes = q.order_by(JournalSecurite.created_at.desc()).limit(min(max(limite, 1), 1000)).all()
    return [{"id": e.id, "date": e.created_at, "evenement": e.evenement, "email": e.email,
             "utilisateur_id": e.utilisateur_id, "ip": e.ip, "navigateur": e.navigateur, "details": e.details}
            for e in lignes]


# ─────────────────────────────────────────────────────────────
# SAUVEGARDES DE LA BASE DE DONNÉES
# ─────────────────────────────────────────────────────────────
@router.get("/sauvegardes", dependencies=[Depends(admin_requis)])
def liste_sauvegardes():
    return sauvegarde.lister()


@router.post("/sauvegardes")
def nouvelle_sauvegarde(request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    try:
        info = sauvegarde.creer("manuelle")
    except Exception as e:
        journaliser(db, request, "sauvegarde_echec", utilisateur_id=admin.id, details=str(e)[:250])
        raise HTTPException(status_code=500, detail=str(e)) from e
    journaliser(db, request, "sauvegarde_creee", utilisateur_id=admin.id, details=f"{info['nom']} ({info['taille_sql_ko']} Ko)")
    return {"message": f"Sauvegarde {info['nom']} créée", **info}


@router.post("/sauvegardes/{nom}/tester")
def tester_sauvegarde(nom: str, request: Request, db: Session = Depends(get_db), admin: User = Depends(admin_requis)):
    try:
        resultat = sauvegarde.tester(nom)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        journaliser(db, request, "restauration_echec", utilisateur_id=admin.id, details=f"{nom} : {str(e)[:200]}")
        raise HTTPException(status_code=500, detail=str(e)) from e
    journaliser(db, request, "restauration_testee", utilisateur_id=admin.id,
                details=f"{nom} : {'réussie' if resultat['reussi'] else 'échec'} ({len(resultat['tables'])} tables)")
    return resultat
