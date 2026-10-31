from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.ml import anomalies

router = APIRouter(
    prefix="/ia",
    tags=["IA prédictive"],
    dependencies=[Depends(get_current_user)]
)


@router.post("/entrainer")
def entrainer(db: Session = Depends(get_db)):
    """Entraîne (ou réentraîne) un modèle Isolation Forest pour chaque capteur actif."""
    return {"resultats": anomalies.entrainer(db)}


@router.get("/analyse")
def analyse(nb_points: int = 50, db: Session = Depends(get_db)):
    """Score d'anomalie des dernières mesures de chaque capteur actif."""
    return anomalies.analyser(db, nb_points)
