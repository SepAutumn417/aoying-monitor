"""Turning Telegram messages into rows.

The collector talks to Telethon, but everything that decides *what* gets stored
is pure here: normalising a message, de-duplicating a re-fetched one, recording
an edit, recording a deletion. Keeping this separate is what makes the whole
ingestion path testable without an authorised Telegram session.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import utcnow
from app.telegram_models import TelegramDialog, TelegramMessage, TelegramMessageRevision
from app.telegram_topics import TARGET_CHAT_ID, sender_role, topic_id_of, topic_title

# Media kinds we know how to label. Anything else is stored as "file" so the
# archive still records that an attachment existed.
MEDIA_LABELS = {
    "MessageMediaPhoto": "photo",
    "MessageMediaDocument": "document",
    "MessageMediaWebPage": "",
    "MessageMediaGeo": "geo",
    "MessageMediaPoll": "poll",
    "MessageMediaContact": "contact",
}


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def media_kind_of(message: Any) -> str:
    media = getattr(message, "media", None)
    if media is None:
        return ""
    return MEDIA_LABELS.get(type(media).__name__, "file")


def sender_name_of(message: Any) -> str:
    """Best-effort display name from whatever Telethon attached to the event."""

    sender = getattr(message, "sender", None)
    if sender is None:
        return ""
    title = getattr(sender, "title", None)
    if title:
        return str(title)
    first = getattr(sender, "first_name", None) or ""
    last = getattr(sender, "last_name", None) or ""
    name = f"{first} {last}".strip()
    if name:
        return name
    username = getattr(sender, "username", None)
    return str(username) if username else ""


def normalize(message: Any) -> dict[str, Any]:
    """Flatten a Telethon message into the columns we persist."""

    return {
        "chat_id": int(getattr(message, "chat_id", 0) or 0),
        "message_id": int(getattr(message, "id", 0) or 0),
        "topic_id": topic_id_of(message)
        if getattr(message, "chat_id", None) == TARGET_CHAT_ID
        else None,
        "sender_id": getattr(message, "sender_id", None),
        "sender_name": sender_name_of(message)[:160],
        "text": (getattr(message, "message", "") or "")[:8000],
        "media_kind": media_kind_of(message),
        "reply_to": getattr(getattr(message, "reply_to_msg_id", None), "__int__", lambda: None)()
        if getattr(message, "reply_to_msg_id", None) is not None
        else None,
        "posted_at": _as_utc(getattr(message, "date", None)) or utcnow(),
        "edited_at": _as_utc(getattr(message, "edit_date", None)),
    }


async def upsert_message(
    db: AsyncSession, dialog: TelegramDialog, data: dict[str, Any], *, commit: bool = True
) -> tuple[TelegramMessage, str]:
    """Insert, edit or no-op a message.

    Returns the row plus one of `created`, `edited`, `unchanged` so callers can
    decide whether an event is worth pushing to phones. An edit first archives
    the text it is about to replace, so the operator can still see the wording
    that triggered a decision.
    """

    existing = await db.scalar(
        select(TelegramMessage).where(
            TelegramMessage.dialog_id == dialog.id,
            TelegramMessage.message_id == data["message_id"],
        )
    )

    if existing is None:
        row = TelegramMessage(dialog_id=dialog.id, **data)
        db.add(row)
        if commit:
            await db.commit()
            await db.refresh(row)
        else:
            await db.flush()
        return row, "created"

    changed = False
    content_changed = data["text"] != existing.text or data["media_kind"] != existing.media_kind
    if content_changed:
        # The text being replaced was live until the edit Telegram reports.
        await _archive_revision(db, existing, data["edited_at"] or utcnow())
        existing.text = data["text"]
        changed = True
    if data["edited_at"] and data["edited_at"] != existing.edited_at:
        existing.edited_at = data["edited_at"]
        changed = True
    if data["media_kind"] != existing.media_kind:
        existing.media_kind = data["media_kind"]
        existing.media_path = ""
        existing.media_size = 0
        changed = True
    for field in ("topic_id", "sender_id", "reply_to"):
        if data.get(field) is not None and getattr(existing, field) != data[field]:
            setattr(existing, field, data[field])
            changed = True
    if existing.deleted_at is not None:
        # Telegram can deliver a re-fetch after a deletion event was processed
        # out of order; a live message wins.
        existing.deleted_at = None
        changed = True

    if changed:
        if commit:
            await db.commit()
            await db.refresh(existing)
        else:
            await db.flush()
        return existing, "edited"
    return existing, "unchanged"


async def _archive_revision(db: AsyncSession, row: TelegramMessage, replaced_at: datetime) -> None:
    """Store the text a message had before this edit.

    `replaced_at` is the edit timestamp Telegram reported; using it (instead of
    `now`) is what makes a re-delivered edit idempotent rather than a new
    revision, and the unique constraint backs that up.
    """

    duplicate = await db.scalar(
        select(TelegramMessageRevision).where(
            TelegramMessageRevision.dialog_id == row.dialog_id,
            TelegramMessageRevision.message_id == row.message_id,
            TelegramMessageRevision.replaced_at == replaced_at,
        )
    )
    if duplicate is not None:
        return
    db.add(
        TelegramMessageRevision(
            dialog_id=row.dialog_id,
            message_id=row.message_id,
            text=row.text,
            media_kind=row.media_kind,
            posted_at=row.posted_at,
            replaced_at=replaced_at,
        )
    )


async def revisions_of(
    db: AsyncSession, dialog_id: int, message_ids: list[int]
) -> dict[int, list[TelegramMessageRevision]]:
    """Revisions for a batch of messages, grouped by `message_id`."""

    if not message_ids:
        return {}
    rows = list(
        await db.scalars(
            select(TelegramMessageRevision)
            .where(
                TelegramMessageRevision.dialog_id == dialog_id,
                TelegramMessageRevision.message_id.in_(message_ids),
            )
            .order_by(TelegramMessageRevision.replaced_at)
        )
    )
    grouped: dict[int, list[TelegramMessageRevision]] = {}
    for row in rows:
        grouped.setdefault(row.message_id, []).append(row)
    return grouped


async def mark_deleted(
    db: AsyncSession, dialog: TelegramDialog, message_ids: list[int]
) -> list[TelegramMessage]:
    if not message_ids:
        return []
    rows = list(
        await db.scalars(
            select(TelegramMessage).where(
                TelegramMessage.dialog_id == dialog.id,
                TelegramMessage.message_id.in_(message_ids),
                TelegramMessage.deleted_at.is_(None),
            )
        )
    )
    if not rows:
        return []
    stamp = utcnow()
    for row in rows:
        row.deleted_at = stamp
    await db.commit()
    return rows


def message_payload(row: TelegramMessage, dialog: TelegramDialog) -> dict[str, Any]:
    """Shape used for `telegram.message` events (and therefore phone pushes)."""

    return {
        "dialog": dialog.title or str(dialog.chat_id),
        "chat_id": dialog.chat_id,
        "message_id": row.message_id,
        "sender": row.sender_name,
        "sender_id": row.sender_id,
        "sender_role": sender_role(row.chat_id, row.sender_id),
        "topic_id": row.topic_id,
        "topic_title": topic_title(row.chat_id, row.topic_id),
        "text": row.text[:400],
        "media_kind": row.media_kind,
        "posted_at": row.posted_at.isoformat(),
        "edited": row.edited_at is not None,
    }
