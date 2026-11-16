"""Source monitoring never constructs a position book or loses source edits."""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from app.copy_models import Position, PositionEvent, Signal
from app.db import SessionLocal
from app.models import Event
from app.telegram_collector import TelegramCollector
from app.telegram_forum_sync import sync_forum
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage, TelegramTopic
from app.telegram_topics import ensure_topics
from tests.test_signal_push import OPEN_TEXT
from tests.test_telegram_forum import CHAT, ForumClient, raw, seed


async def book_counts(db):
    return [
        await db.scalar(select(func.count()).select_from(model))
        for model in (Signal, Position, PositionEvent)
    ]


@asynccontextmanager
async def source_fixture():
    dialog = await seed()
    async with SessionLocal() as db:
        await ensure_topics(db, dialog)
        watermark = await db.scalar(select(func.max(Event.id))) or 0
        before = await book_counts(db)
    try:
        yield dialog, watermark, before
    finally:
        async with SessionLocal() as db:
            await db.execute(delete(Event).where(Event.id > watermark))
            await db.execute(delete(TelegramMessage).where(TelegramMessage.dialog_id == dialog.id))
            await db.execute(delete(TelegramTopic).where(TelegramTopic.dialog_id == dialog.id))
            await db.execute(delete(TelegramDialog).where(TelegramDialog.id == dialog.id))
            await db.execute(delete(TelegramAccount).where(TelegramAccount.id == dialog.account_id))
            await db.commit()


def test_live_source_edit_delete_and_duplicate_do_not_build_a_book():
    async def scenario():
        async with source_fixture() as (dialog, watermark, before):
            collector = TelegramCollector(
                account_id=dialog.account_id, client_factory=lambda: None, download_media=False
            )
            message = raw(100, 926111, body=OPEN_TEXT, sender=8797733775)
            await collector.ingest_message(message, CHAT, edited=False)
            await collector.ingest_message(message, CHAT, edited=False)
            message.message = OPEN_TEXT.replace("84768.06", "85123.45")
            message.edit_date = datetime(2026, 11, 8, tzinfo=UTC)
            await collector.ingest_message(message, CHAT, edited=True)
            async with SessionLocal() as db:
                assert await book_counts(db) == before
                source = await db.scalar(
                    select(TelegramMessage).where(TelegramMessage.dialog_id == dialog.id)
                )
                assert source.text == message.message
                events = list(
                    await db.scalars(select(Event).where(Event.id > watermark).order_by(Event.id))
                )
                assert [e.kind for e in events] == [
                    "telegram.message",
                    "signal.open",
                    "telegram.message.edited",
                ]
                payload = json.loads(events[1].payload)
                assert payload["symbol"] == "BTCUSDT"
                assert payload["position_id"] is None
                assert payload["signal_id"] is None
            await collector.ingest_deleted(CHAT, [100])
            async with SessionLocal() as db:
                source = await db.scalar(
                    select(TelegramMessage).where(TelegramMessage.dialog_id == dialog.id)
                )
                assert source.deleted_at is not None
                assert await book_counts(db) == before

    asyncio.run(scenario())


def test_backfill_keeps_original_snapshot_and_incremental_alerts():
    async def scenario():
        async with source_fixture() as (dialog, watermark, before):
            messages = [
                raw(100, 926111, body=OPEN_TEXT, sender=8797733775),
                raw(101, 926111, body="熬鹰当前全部持仓\n源快照原文", sender=8797733775),
            ]
            await sync_forum(ForumClient(messages), dialog, 10)
            async with SessionLocal() as db:
                assert (
                    await db.scalar(
                        select(func.count())
                        .select_from(TelegramMessage)
                        .where(TelegramMessage.dialog_id == dialog.id)
                    )
                    == 2
                )
                assert (
                    await db.scalar(
                        select(func.count()).select_from(Event).where(Event.id > watermark)
                    )
                    == 0
                )
                assert await book_counts(db) == before
            messages += [
                raw(102, 926111, body=OPEN_TEXT, sender=8797733775),
                raw(103, 748, body=OPEN_TEXT, sender=123456),
            ]
            await sync_forum(ForumClient(messages), dialog, 10)
            await sync_forum(ForumClient(messages), dialog, 10)
            async with SessionLocal() as db:
                alerts = list(
                    await db.scalars(
                        select(Event).where(Event.id > watermark, Event.kind == "signal.open")
                    )
                )
                assert len(alerts) == 1
                assert json.loads(alerts[0].payload)["message_id"] == 102
                assert await book_counts(db) == before

    asyncio.run(scenario())
