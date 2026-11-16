"""Bounded forum paging, atomic per-topic writes, and offline edit repair.

General uses filtered chat history, not GetReplies(1). Every pass scans at most
20 pages per topic. Incremental cursors are scan watermarks; recent edit reads
never leap over unfinished catch-up. History is silent (no new-trade events).
"""

import logging
from typing import Any

from sqlalchemy import select

from app.copy import notify
from app.db import SessionLocal
from app.events import append_event, hub
from app.models import utcnow
from app.telegram_models import TelegramDialog, TelegramMessage, TelegramTopic
from app.telegram_store import message_payload, normalize, upsert_message
from app.telegram_topics import SIGNAL_BOT_ID, ensure_topics, is_signal_source, topic_id_of

log = logging.getLogger(__name__)

PAGE_SIZE = 200
MAX_PAGES = 20


async def read_window(
    client: Any,
    chat_id: int,
    topic_id: int,
    limit: int,
    min_id: int = 0,
    offset_id: int = 0,
    progress: dict[str, int] | None = None,
) -> tuple[list[Any], int, bool]:
    """Return matching messages, safe scan watermark and bounded-scan warning."""
    batch: list[Any] = []
    watermark = min_id
    offset = offset_id
    for _ in range(MAX_PAGES):
        kwargs: dict[str, Any] = {"limit": PAGE_SIZE}
        if topic_id != 1:
            kwargs["reply_to"] = topic_id
        if min_id:
            kwargs.update(min_id=watermark, reverse=True)
        elif offset:
            kwargs["offset_id"] = offset
        page = [m async for m in client.iter_messages(chat_id, **kwargs)]
        if not page:
            return batch, watermark, False
        for message in page:
            watermark = max(watermark, message.id)
            if topic_id_of(message) == topic_id:
                batch.append(message)
                if not min_id and len(batch) >= limit:
                    return batch, watermark, False
        if min_id:
            # Ascending pages consume all new messages; recent edit reads remain separate.
            if max(m.id for m in page) <= kwargs["min_id"]:
                raise RuntimeError("Telegram history paging made no progress")
        else:
            next_offset = min(m.id for m in page)
            if offset and next_offset >= offset:
                raise RuntimeError("Telegram history paging made no progress")
            offset = next_offset
            if progress is not None:
                progress["offset_id"] = offset
        if len(page) < PAGE_SIZE:
            return batch, watermark, False
    return batch, watermark, True


async def sync_forum(client: Any, dialog: TelegramDialog, limit: int, download: Any = None) -> None:
    async with SessionLocal() as db:
        topics = await ensure_topics(db, dialog)
    for topic in topics:
        if not topic.enabled:
            continue
        try:
            progress: dict[str, int] = {}
            initial = not topic.initial_backfill_done
            batch, cursor, bounded = await read_window(
                client,
                dialog.chat_id,
                topic.topic_id,
                max(1, limit - topic.backfill_count) if initial else limit,
                0 if initial else topic.last_message_id,
                offset_id=topic.backfill_offset_id if initial else 0,
                progress=progress,
            )
            initial_count = len(batch)
            if topic.last_message_id and not initial:
                recent, _, _ = await read_window(client, dialog.chat_id, topic.topic_id, limit)
                batch.extend(recent)
            async with SessionLocal() as db:
                # Pin the latest known bot position snapshot even once high traffic
                # pushes it outside the recent window. Stable sender ID, never name.
                if topic.topic_id == 926111 and hasattr(client, "get_messages"):
                    snapshot = await db.scalar(
                        select(TelegramMessage.message_id)
                        .where(
                            TelegramMessage.dialog_id == dialog.id,
                            TelegramMessage.topic_id == topic.topic_id,
                            TelegramMessage.sender_id == SIGNAL_BOT_ID,
                            TelegramMessage.text.contains("当前全部持仓"),
                            TelegramMessage.deleted_at.is_(None),
                        )
                        .order_by(TelegramMessage.message_id.desc())
                        .limit(1)
                    )
                    if snapshot:
                        pinned = await client.get_messages(dialog.chat_id, ids=[snapshot])
                        batch.extend(m for m in pinned if m is not None and getattr(m, "id", None))
                # Fetch all IO first, then atomically persist contents and cursor.
                unique = {m.id: m for m in batch if topic_id_of(m) == topic.topic_id}
                media = []
                events_to_publish: list[dict[str, Any]] = []
                for message in sorted(unique.values(), key=lambda m: m.id):
                    data = normalize(message)
                    data["chat_id"] = dialog.chat_id
                    row, outcome = await upsert_message(db, dialog, data, commit=False)
                    if download is not None and row.media_kind and not row.media_path:
                        media.append((row, message))
                    if (
                        outcome == "created"
                        and not initial
                        and is_signal_source(dialog.chat_id, topic.topic_id, row.sender_id)
                    ):
                        alert = notify.source_message_alert(row, dialog.title or "")
                        if alert is not None:
                            kind, payload = alert
                            events_to_publish.append(
                                await append_event(db, kind, payload, commit=False)
                            )
                    if outcome == "edited" and not initial:
                        payload = message_payload(row, dialog)
                        payload["outcome"] = "edited"
                        ev = await append_event(
                            db, "telegram.message.edited", payload, commit=False
                        )
                        events_to_publish.append(ev)
                state = await db.get(TelegramTopic, topic.id)
                state.last_message_id = max(state.last_message_id, cursor)
                if initial:
                    state.backfill_count += initial_count
                    state.backfill_offset_id = progress.get("offset_id", state.backfill_offset_id)
                    state.initial_backfill_done = not bounded
                state.last_synced_at = utcnow()
                state.last_error = "扫描达到每轮4000条上限；下轮继续补洞" if bounded else ""
                await db.commit()
                for ev in events_to_publish:
                    await hub.publish(ev)
                # Downloads are best effort and only follow the atomic archive commit.
                for row, message in media:
                    await download(db, row, message, dialog)
        except Exception as exc:
            async with SessionLocal() as db:
                state = await db.get(TelegramTopic, topic.id)
                state.last_error = str(exc)[:1000]
                await db.commit()
    async with SessionLocal() as db:
        row = await db.get(TelegramDialog, dialog.id)
        row.last_synced_at = utcnow()
        await db.commit()
