"""Telegram ingestion tests.

No Telegram account is involved: `FakeMessage` mimics the handful of attributes
`normalize()` reads, and the collector's persistence callbacks are exercised
directly. That covers the parts that actually decide what a phone gets told.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.models import Event
from app.telegram_collector import TelegramCollector
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage
from app.telegram_store import mark_deleted, normalize, revisions_of, upsert_message

ADMIN = {"username": "admin", "password": "test-password-123"}
CHAT_ID = -1001234567890


class FakeSender:
    def __init__(self, first: str = "", last: str = "", username: str = "") -> None:
        self.first_name = first
        self.last_name = last
        self.username = username


class FakeMessage:
    def __init__(
        self,
        message_id: int,
        text: str = "",
        chat_id: int = CHAT_ID,
        media: Any = None,
        edit_date: datetime | None = None,
        reply_to_msg_id: int | None = None,
    ) -> None:
        self.id = message_id
        self.message = text
        self.chat_id = chat_id
        self.media = media
        self.date = datetime(2026, 11, 5, 8, 0, tzinfo=UTC)
        self.edit_date = edit_date
        self.reply_to_msg_id = reply_to_msg_id
        self.sender_id = 42
        self.sender = FakeSender(first="熬鹰", last="资本", username="thankUcrypto_")


def run(coro: Any) -> Any:
    return asyncio.run(coro)


async def _seed() -> int:
    async with SessionLocal() as db:
        account = TelegramAccount(
            label="测试号", phone="+8613800000000", session_path="./tmp/t.session"
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)
        dialog = TelegramDialog(
            account_id=account.id, chat_id=CHAT_ID, title="熬鹰｜观点群", kind="group"
        )
        db.add(dialog)
        await db.commit()
        await db.refresh(dialog)
        return dialog.id


def test_normalize_flattens_message() -> None:
    data = normalize(FakeMessage(7, text="BTC 加仓", reply_to_msg_id=3))
    assert data["chat_id"] == CHAT_ID
    assert data["message_id"] == 7
    assert data["text"] == "BTC 加仓"
    assert data["sender_name"] == "熬鹰 资本"
    assert data["reply_to"] == 3
    assert data["posted_at"].tzinfo is not None


def test_upsert_message_records_created_then_edit() -> None:
    async def scenario() -> tuple[str, str]:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            first, outcome1 = await upsert_message(
                db, dialog, normalize(FakeMessage(1, "开多 ETH"))
            )
            second, outcome2 = await upsert_message(
                db,
                dialog,
                normalize(
                    FakeMessage(1, "开多 ETH 3x", edit_date=datetime(2026, 11, 5, 8, 5, tzinfo=UTC))
                ),
            )
        assert outcome1 == "created"
        assert outcome2 == "edited"
        assert first.id == second.id
        assert second.text == "开多 ETH 3x"
        assert second.edited_at is not None
        return outcome1, outcome2

    run(scenario())


def test_upsert_message_is_idempotent_for_unchanged_text() -> None:
    async def scenario() -> str:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            await upsert_message(db, dialog, normalize(FakeMessage(2, "同样的内容")))
            _, outcome = await upsert_message(db, dialog, normalize(FakeMessage(2, "同样的内容")))
        return outcome

    assert run(scenario()) == "unchanged"


def test_mark_deleted_keeps_row_and_sets_stamp() -> None:
    async def scenario() -> tuple[int, bool]:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            await upsert_message(db, dialog, normalize(FakeMessage(3, "会被删掉")))
            rows = await mark_deleted(db, dialog, [3])
            stored = await db.scalar(select(TelegramMessage).where(TelegramMessage.message_id == 3))
        return len(rows), stored is not None and stored.deleted_at is not None

    count, stamped = run(scenario())
    assert count == 1
    assert stamped is True


def test_collector_ingests_and_publishes_events() -> None:
    async def scenario() -> list[str]:
        await _seed()
        collector = TelegramCollector(client_factory=lambda: None, download_media=False)
        await collector.ingest_message(FakeMessage(10, "BTC 空单平掉"), CHAT_ID, edited=False)
        await collector.ingest_message(FakeMessage(11, "新开 SOL 多"), CHAT_ID, edited=False)
        await collector.ingest_deleted(CHAT_ID, [10])
        async with SessionLocal() as db:
            rows = list(await db.scalars(select(Event).order_by(Event.id)))
        return [row.kind for row in rows]

    kinds = run(scenario())
    assert "telegram.message" in kinds
    assert "telegram.message.deleted" in kinds


def test_collector_ignores_unfollowed_chat() -> None:
    async def scenario() -> Any:
        await _seed()
        collector = TelegramCollector(client_factory=lambda: None, download_media=False)
        return await collector.ingest_message(
            FakeMessage(99, "别的群", chat_id=-100999), -100999, edited=False
        )

    assert run(scenario()) is None


def test_telegram_status_requires_auth() -> None:
    with TestClient(app) as client:
        assert client.get("/api/telegram/status").status_code == 401


def test_telegram_status_and_dialogs_endpoints() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={**ADMIN, "device": {"name": "t"}}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        status = client.get("/api/telegram/status", headers=headers)
        assert status.status_code == 200
        body = status.json()
        assert body["collector"]["state"] in {"stopped", "error", "running"}
        assert body["followed"] >= 0

        dialogs = client.get("/api/telegram/dialogs", headers=headers)
        assert dialogs.status_code == 200
        assert isinstance(dialogs.json(), list)

        messages = client.get("/api/telegram/messages", headers=headers)
        assert messages.status_code == 200
        assert "messages" in messages.json()


def test_sync_requires_running_collector() -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={**ADMIN, "device": {"name": "t2"}}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        response = client.post("/api/telegram/sync", headers=headers)
    assert response.status_code == 409
    assert "未运行" in response.json()["detail"]


@pytest.mark.parametrize("chat_id", [CHAT_ID])
def test_follow_and_unfollow_dialog(chat_id: int) -> None:
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={**ADMIN, "device": {"name": "t3"}}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        follow = client.post(f"/api/telegram/dialogs/{chat_id}/follow", headers=headers)
        assert follow.status_code == 200, follow.text
        assert follow.json()["enabled"] is True

        listed = client.get("/api/telegram/dialogs", headers=headers).json()
        assert any(item["chat_id"] == chat_id for item in listed)

        unfollow = client.delete(f"/api/telegram/dialogs/{chat_id}/follow", headers=headers)
        assert unfollow.status_code == 200
        assert unfollow.json()["enabled"] is False


def test_edit_archives_the_previous_text() -> None:
    async def scenario() -> tuple[int, str]:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            await upsert_message(db, dialog, normalize(FakeMessage(20, "开多 BTC 2x")))
            await upsert_message(
                db,
                dialog,
                normalize(
                    FakeMessage(
                        20, "开多 BTC 5x", edit_date=datetime(2026, 11, 5, 8, 5, tzinfo=UTC)
                    )
                ),
            )
            history = await revisions_of(db, dialog.id, [20])
        return len(history[20]), history[20][0].text

    count, text = run(scenario())
    assert count == 1
    assert text == "开多 BTC 2x"


def test_repeated_edit_deliveries_do_not_duplicate_revisions() -> None:
    async def scenario() -> int:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            edited = normalize(
                FakeMessage(21, "改成 3x", edit_date=datetime(2026, 11, 5, 8, 5, tzinfo=UTC))
            )
            await upsert_message(db, dialog, normalize(FakeMessage(21, "开多 1x")))
            await upsert_message(db, dialog, edited)
            await upsert_message(db, dialog, edited)
            history = await revisions_of(db, dialog.id, [21])
        return len(history[21])

    assert run(scenario()) == 1


def test_delete_update_without_chat_id_is_ignored() -> None:
    """Telegram omits the chat for some deletes; message ids are per chat, so
    applying them everywhere would erase unrelated rows."""

    async def scenario() -> bool:
        await _seed()
        collector = TelegramCollector(client_factory=lambda: None, download_media=False)
        await collector.ingest_message(FakeMessage(30, "留着"), CHAT_ID, edited=False)
        await collector.ingest_deleted(None, [30])
        async with SessionLocal() as db:
            row = await db.scalar(select(TelegramMessage).where(TelegramMessage.message_id == 30))
        return row is not None and row.deleted_at is None

    assert run(scenario()) is True


def test_first_backfill_takes_the_newest_messages() -> None:
    """No `min_id` plus `reverse=True` would return the *oldest* history."""

    class FakeClient:
        def __init__(self) -> None:
            self.calls: list[dict[str, Any]] = []

        def iter_messages(self, chat_id: int, **kwargs: Any) -> Any:
            self.calls.append(kwargs)

            async def generator() -> Any:
                for message_id in (101, 102):
                    yield FakeMessage(message_id, f"m{message_id}")

            return generator()

    async def scenario() -> tuple[dict[str, Any], int]:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            # Other tests share this chat id; force the "first contact" branch.
            dialog.last_message_id = 0
            await db.commit()
            client = FakeClient()
            collector = TelegramCollector(client_factory=lambda: None, download_media=False)
            collector._client = client  # noqa: SLF001 - the fake stands in for Telethon
            await collector._backfill_dialog(client, dialog)  # noqa: SLF001
            stored = await db.scalar(
                select(TelegramMessage).where(TelegramMessage.message_id == 102)
            )
        return client.calls[0], (0 if stored is None else stored.message_id)

    kwargs, newest = run(scenario())
    assert "min_id" not in kwargs
    assert kwargs["limit"] == 200
    assert newest == 102


def test_messages_endpoint_filters_and_returns_revisions() -> None:
    async def scenario() -> None:
        await _seed()
        async with SessionLocal() as db:
            dialog = await db.scalar(
                select(TelegramDialog).where(TelegramDialog.chat_id == CHAT_ID)
            )
            assert dialog is not None
            await upsert_message(db, dialog, normalize(FakeMessage(40, "老文案")))
            await upsert_message(
                db,
                dialog,
                normalize(
                    FakeMessage(40, "新文案", edit_date=datetime(2026, 11, 5, 9, 0, tzinfo=UTC))
                ),
            )

    run(scenario())

    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={**ADMIN, "device": {"name": "t4"}}).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        edited = client.get(
            "/api/telegram/messages",
            params={"kind": "edited", "include_revisions": True, "chat_id": CHAT_ID},
            headers=headers,
        )
        assert edited.status_code == 200, edited.text
        items = edited.json()["messages"]
        assert all(item["edited_at"] for item in items)
        target = next(item for item in items if item["message_id"] == 40)
        assert target["text"] == "新文案"
        assert [rev["text"] for rev in target["revisions"]] == ["老文案"]

        assert client.get(
            "/api/telegram/messages", params={"kind": "nope"}, headers=headers
        ).status_code == 400
