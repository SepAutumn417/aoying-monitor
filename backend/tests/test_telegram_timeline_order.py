"""Independent topic backfill must not reorder the visible timeline."""

from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import telegram
from app.models import Base
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage


@pytest.mark.asyncio
async def test_feed_orders_by_message_time_and_pages_in_that_order(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            account = TelegramAccount(label="ordering")
            db.add(account)
            await db.flush()
            dialog = TelegramDialog(account_id=account.id, chat_id=-1002568478710)
            db.add(dialog)
            await db.flush()
            for mid, day in [(301, 7), (302, 7), (100, 1)]:
                db.add(
                    TelegramMessage(
                        dialog_id=dialog.id,
                        chat_id=dialog.chat_id,
                        message_id=mid,
                        topic_id=1,
                        text=str(mid),
                        posted_at=datetime(2026, 11, day, tzinfo=UTC),
                    )
                )
            await db.commit()
            monkeypatch.setattr(
                telegram, "get_collector", lambda: SimpleNamespace(account_id=account.id)
            )
            page = await telegram.list_messages(limit=2, db=db, user=None)
            assert [row["message_id"] for row in page["messages"]] == [302, 301]
            next_page = await telegram.list_messages(
                limit=2, before_id=page["messages"][-1]["id"], db=db, user=None
            )
            assert [row["message_id"] for row in next_page["messages"]] == [100]
    finally:
        await engine.dispose()
