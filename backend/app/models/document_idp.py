from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from app.core.database import Base

TexteLong = Text().with_variant(MEDIUMTEXT(), "mysql")      # jusqu'à 16 Mo de texte (gros manuels)


class DocumentIDP(Base):
    """Document déposé dans SmartMaint : bon d'intervention à lire ou manuel à ajouter à la base de connaissances."""
    __tablename__ = "documents_idp"

    id = Column(Integer, primary_key=True, index=True)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    type_document = Column(String(30), nullable=False)           # bon_intervention | manuel
    nom_fichier = Column(String(255), nullable=False)
    format = Column(String(20), nullable=False)                  # pdf, image, word, excel, csv, powerpoint, xml, json, texte
    taille = Column(Integer, nullable=False)
    empreinte = Column(String(64), nullable=False, index=True)  # SHA-256 du fichier (détection des doublons)
    chemin = Column(String(255), nullable=False)
    statut = Column(String(20), nullable=False)                  # a_valider | valide | rejete | indexe | erreur
    methode = Column(String(100), nullable=True)                 # modèle ou méthode de lecture utilisée
    texte = Column(TexteLong, nullable=True)                     # texte lu dans le document
    donnees = Column(Text, nullable=True)                        # JSON : champs extraits, confiance, corrections
    controles = Column(Text, nullable=True)                      # JSON : résultat des contrôles d'incohérence
    pages = Column(Integer, nullable=True)
    duree_ms = Column(Integer, nullable=True)
    intervention_id = Column(Integer, nullable=True)               # intervention créée à la validation
    message = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False)
    traite_le = Column(DateTime, nullable=True)
