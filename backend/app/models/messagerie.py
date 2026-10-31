from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint

from app.core.database import Base


class Conversation(Base):
    """Conversation privée entre deux utilisateurs."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, nullable=False)
    maj = Column(DateTime, nullable=False)             # date du dernier message (tri de la liste)


class Participant(Base):
    """Seuls les participants peuvent lire ou écrire dans une conversation."""
    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    utilisateur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="CASCADE"), nullable=False)
    derniere_lecture = Column(DateTime, nullable=True)  # messages plus récents = non lus

    __table_args__ = (UniqueConstraint("conversation_id", "utilisateur_id", name="uq_participant"),
                      Index("ix_participant_utilisateur", "utilisateur_id"))


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    auteur_id = Column(Integer, ForeignKey("utilisateurs.id", ondelete="SET NULL"), nullable=True)
    texte = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)

    __table_args__ = (Index("ix_message_conversation", "conversation_id", "id"),)
