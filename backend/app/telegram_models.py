"""Telegram ingestion tables.

The collector keeps its own tables rather than writing straight into the UI
feed: `telegram_messages` is the raw archive and always holds the current state
of a message, `telegram_message_revisions` holds the text each edit replaced,
and later increments derive signals from both.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base, UtcDateTime, utcnow


class TelegramAccount(Base):
    """One authorised Telegram user account (the session file lives on disk)."""

    __tablename__ = "telegram_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(64), default="主账号")
    phone: Mapped[str] = mapped_column(String(32), default="")
    session_path: Mapped[str] = mapped_column(String(240), default="")
    tg_user_id: Mapped[int | None] = mapped_column(BigInteger, default=None)
    tg_username: Mapped[str] = mapped_column(String(64), default="")
    display_name: Mapped[str] = mapped_column(String(120), default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    last_connected_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    last_error: Mapped[str] = mapped_column(Text, default="")

    dialogs: Mapped[list[TelegramDialog]] = relationship(back_populates="account")


class TelegramDialog(Base):
    """A chat the collector follows; `enabled` is the operator's switch."""

    __tablename__ = "telegram_dialogs"
    __table_args__ = (
        UniqueConstraint("account_id", "chat_id", name="uq_telegram_dialog_chat"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("telegram_accounts.id", ondelete="CASCADE"), index=True
    )
    chat_id: Mapped[int] = mapped_column(BigInteger, index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    kind: Mapped[str] = mapped_column(String(16), default="group")
    username: Mapped[str] = mapped_column(String(80), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_message_id: Mapped[int] = mapped_column(Integer, default=0)
    last_synced_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    account: Mapped[TelegramAccount] = relationship(back_populates="dialogs")


class TelegramMessageRevision(Base):
    """Text a message had *before* it was edited.

    `telegram_messages` always holds the current state so the feed has one row
    per message. This table is the history: every edit writes the text that is
    about to be replaced, which is what lets the operator see both versions when
    a "buy alert" gets rewritten.
    """

    __tablename__ = "telegram_message_revisions"
    __table_args__ = (
        UniqueConstraint(
            "dialog_id", "message_id", "replaced_at", name="uq_telegram_message_revision"
        ),
        Index("ix_telegram_message_revision_msg", "dialog_id", "message_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dialog_id: Mapped[int] = mapped_column(
        ForeignKey("telegram_dialogs.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    media_kind: Mapped[str] = mapped_column(String(24), default="")
    posted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    replaced_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class TelegramMessage(Base):
    """Raw message archive. Deleted rows stay, they just get `deleted_at`."""

    __tablename__ = "telegram_messages"
    __table_args__ = (
        UniqueConstraint("dialog_id", "message_id", name="uq_telegram_message"),
        Index("ix_telegram_message_posted", "posted_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dialog_id: Mapped[int] = mapped_column(
        ForeignKey("telegram_dialogs.id", ondelete="CASCADE"), index=True
    )
    chat_id: Mapped[int] = mapped_column(BigInteger, index=True)
    message_id: Mapped[int] = mapped_column(Integer)
    sender_id: Mapped[int | None] = mapped_column(BigInteger, default=None)
    sender_name: Mapped[str] = mapped_column(String(160), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    media_kind: Mapped[str] = mapped_column(String(24), default="")
    media_path: Mapped[str] = mapped_column(String(240), default="")
    media_size: Mapped[int] = mapped_column(Integer, default=0)
    reply_to: Mapped[int | None] = mapped_column(Integer, default=None)
    posted_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    edited_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    deleted_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    dialog: Mapped[TelegramDialog] = relationship()
