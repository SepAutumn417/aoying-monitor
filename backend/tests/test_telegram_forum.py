"""Forum contracts; no network or production sessions."""

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import SessionLocal
from app.telegram_collector import TelegramCollector
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage
from app.telegram_store import normalize, revisions_of, upsert_message

CHAT = -1002568478710


def raw(mid=1, topic=1, body="text", sender=7460753506):
    return NS(
        id=mid,
        chat_id=CHAT,
        message=body,
        sender_id=sender,
        sender=None,
        date=datetime(2026, 11, 7, tzinfo=UTC),
        edit_date=None,
        media=None,
        action=None,
        reply_to=None
        if topic == 1
        else NS(forum_topic=True, reply_to_top_id=topic, reply_to_msg_id=topic),
    )


async def seed():
    async with SessionLocal() as db:
        account = TelegramAccount(label="forum")
        db.add(account)
        await db.flush()
        dialog = TelegramDialog(account_id=account.id, chat_id=CHAT, title="forum")
        db.add(dialog)
        await db.commit()
        return dialog


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, 1),
        (NS(forum_topic=False, reply_to_top_id=1756158, reply_to_msg_id=1756161), 1),
        (NS(forum_topic=True, reply_to_top_id=748, reply_to_msg_id=999), 748),
        (NS(forum_topic=True, reply_to_top_id=None, reply_to_msg_id=926111), 926111),
        (NS(forum_topic=True, reply_to_top_id=12345, reply_to_msg_id=12345), 12345),
        (NS(forum_topic=True, reply_to_top_id=None, reply_to_msg_id=None), None),
    ],
)
def test_topic_header(header, expected):
    from app.telegram_topics import topic_id_of

    assert topic_id_of(NS(reply_to=header, action=None)) == expected


def test_topic_root_and_group_scoped_identity():
    from app.telegram_topics import sender_role, topic_id_of

    action = type("MessageActionTopicCreate", (), {})()
    assert topic_id_of(NS(id=748, action=action, reply_to=None)) == 748
    assert sender_role(CHAT, 7460753506) == "owner"
    assert sender_role(CHAT, 8797733775) == "signal_bot"
    assert sender_role(CHAT, 8907156644) == "assistant"
    assert sender_role(-123, 7460753506) == "member"


def test_normalize_topic_and_empty_media_edit():
    async def scenario():
        dialog = await seed()
        async with SessionLocal() as db:
            first = raw(100, 748)
            first.media = type("MessageMediaPhoto", (), {})()
            row, _ = await upsert_message(db, dialog, normalize(first))
            row.media_path = "old.jpg"
            row.media_size = 9
            await db.commit()
            update = raw(100, 748, "")
            update.edit_date = datetime(2026, 11, 7, 1, tzinfo=UTC)
            row, outcome = await upsert_message(db, dialog, normalize(update))
            assert row.text == ""
            assert row.media_kind == ""
            assert row.media_path == ""
            assert row.media_size == 0
            assert row.topic_id == 748
            assert outcome == "edited"
            await upsert_message(db, dialog, normalize(update))
            history = await revisions_of(db, dialog.id, [100])
            assert len(history[100]) == 1
            assert history[100][0].media_kind == "photo"

    asyncio.run(scenario())


def test_explicit_upgrade_is_idempotent_preserves_old_rows():
    from app.telegram_migrations import upgrade_telegram_schema

    async def scenario():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.execute(
                text("CREATE TABLE telegram_accounts (id INTEGER PRIMARY KEY, label TEXT)")
            )
            await conn.execute(text("INSERT INTO telegram_accounts VALUES (7, 'keep')"))
            await conn.execute(
                text("CREATE TABLE telegram_messages (id INTEGER PRIMARY KEY, text TEXT)")
            )
            await conn.execute(text("INSERT INTO telegram_messages VALUES (9, 'old')"))
            await conn.run_sync(upgrade_telegram_schema)
            await conn.run_sync(upgrade_telegram_schema)
            columns = await conn.run_sync(
                lambda c: [x["name"] for x in inspect(c).get_columns("telegram_messages")]
            )
            assert "topic_id" in columns
            assert (
                await conn.execute(text("SELECT text, topic_id FROM telegram_messages"))
            ).one() == ("old", None)
            assert (
                await conn.execute(text("SELECT label FROM telegram_accounts"))
            ).scalar() == "keep"
        await engine.dispose()

    asyncio.run(scenario())


class ForumClient:
    def __init__(self, messages):
        self.messages = messages
        self.calls = []
        self.fail_topic = None

    async def get_messages(self, chat_id, ids):
        return [m for m in self.messages if m.id in ids]

    def iter_messages(self, chat_id, **kwargs):
        self.calls.append(kwargs)

        async def generate():
            if self.fail_topic is not None and kwargs.get("reply_to") == self.fail_topic:
                raise RuntimeError("topic unavailable")
            from app.telegram_topics import topic_id_of

            messages = [
                m
                for m in self.messages
                if m.id > kwargs.get("min_id", 0)
                and (not kwargs.get("offset_id") or m.id < kwargs["offset_id"])
                and (not kwargs.get("reply_to") or topic_id_of(m) == kwargs["reply_to"])
            ]
            messages.sort(key=lambda m: m.id, reverse=not kwargs.get("reverse", False))
            for m in messages[: kwargs.get("limit", 200)]:
                yield m

        return generate()


def test_topics_independent_latest200_reread_and_snapshot():
    from app.telegram_models import TelegramTopic

    async def scenario():
        dialog = await seed()
        messages = [
            raw(10000 * i + j, topic)
            for i, topic in enumerate((1, 748, 926111, 1006930), 1)
            for j in range(1, 251)
        ]
        client = ForumClient(messages)
        collector = TelegramCollector(
            account_id=dialog.account_id, client_factory=lambda: client, download_media=False
        )
        collector._client = client
        await collector._backfill_dialog(client, dialog)
        async with SessionLocal() as db:
            topics = list(
                await db.scalars(select(TelegramTopic).where(TelegramTopic.dialog_id == dialog.id))
            )
            stored = list(
                await db.scalars(
                    select(TelegramMessage).where(TelegramMessage.dialog_id == dialog.id)
                )
            )
            assert {t.topic_id for t in topics} == {1, 748, 926111, 1006930}
            assert len(stored) == 800
            assert all(sum(m.topic_id == t.topic_id for m in stored) == 200 for t in topics)
            assert all(t.last_error == "" and t.last_synced_at for t in topics)
        # Existing snapshot falls out of the most recent 200; it must still be fetched by ID.
        snapshot = next(m for m in messages if m.id == 30250)
        snapshot.message = "熬鹰当前全部持仓"
        snapshot.sender_id = 8797733775
        await collector._backfill_dialog(client, dialog)
        snapshot.message = "熬鹰当前全部持仓 updated"
        snapshot.edit_date = datetime(2026, 11, 7, 3, tzinfo=UTC)
        client.messages += [raw(31000 + j, 926111) for j in range(300)]
        await collector._backfill_dialog(client, dialog)
        await collector._backfill_dialog(client, dialog)
        async with SessionLocal() as db:
            row = await db.scalar(
                select(TelegramMessage).where(
                    TelegramMessage.dialog_id == dialog.id, TelegramMessage.message_id == 30250
                )
            )
            assert row.text.endswith("updated")
            history = await revisions_of(db, dialog.id, [30250])
            assert len(history[30250]) == 2

    asyncio.run(scenario())


def test_failed_topic_keeps_cursor_other_topics_continue():
    from app.telegram_models import TelegramTopic

    async def scenario():
        dialog = await seed()
        client = ForumClient([raw(900, 748), raw(901, 926111), raw(902, 1)])
        client.fail_topic = 748
        collector = TelegramCollector(
            account_id=dialog.account_id, client_factory=lambda: client, download_media=False
        )
        collector._client = client
        await collector._backfill_dialog(client, dialog)
        async with SessionLocal() as db:
            topics = list(
                await db.scalars(select(TelegramTopic).where(TelegramTopic.dialog_id == dialog.id))
            )
            failed = next(t for t in topics if t.topic_id == 748)
            assert failed.last_message_id == 0
            assert "topic unavailable" in failed.last_error
            assert next(t for t in topics if t.topic_id == 926111).last_message_id == 901
        assert await collector.ingest_message(raw(999, 333), CHAT, False) is None
        async with SessionLocal() as db:
            topic = await db.get(TelegramTopic, failed.id)
            topic.enabled = False
            await db.commit()
        assert await collector.ingest_message(raw(1000, 748), CHAT, False) is None

    asyncio.run(scenario())


def test_production_scope_excludes_other_enabled_dialogs():
    async def scenario():
        dialog = await seed()
        async with SessionLocal() as db:
            other = TelegramDialog(account_id=dialog.account_id, chat_id=-999, enabled=True)
            db.add(other)
            await db.commit()
        collector = TelegramCollector(account_id=dialog.account_id)
        dialogs = await collector._enabled_dialogs()
        assert [d.chat_id for d in dialogs] == [CHAT]
        async with SessionLocal() as db:
            assert not (await db.get(TelegramDialog, other.id)).enabled

    asyncio.run(scenario())


def test_topic_api_and_id_based_focus_filters(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.telegram_topics import ensure_topics

    async def setup():
        dialog = await seed()
        import app.api.telegram as api

        monkeypatch.setattr(api, "get_collector", lambda: NS(account_id=dialog.account_id))
        async with SessionLocal() as db:
            await ensure_topics(db, dialog)
            for mid, topic, sender in [
                (80001, 926111, 8797733775),
                (80002, 748, 7460753506),
                (80003, 1, 7460753506),
                (80004, 1006930, 7460753506),
                (80005, 1, 42),
                (80006, 926111, 42),
                (80007, 1006930, 8907156644),
            ]:
                await upsert_message(db, dialog, normalize(raw(mid, topic, sender=sender)))

    asyncio.run(setup())
    with TestClient(app) as client:
        assert client.get("/api/telegram/topics").status_code == 401
        login = client.post(
            "/api/auth/login",
            json={
                "username": "admin",
                "password": "test-password-123",
                "device": {"name": "forum"},
            },
        ).json()
        headers = {"Authorization": f"Bearer {login['access_token']}"}
        topics = client.get("/api/telegram/topics", params={"chat_id": CHAT}, headers=headers)
        assert topics.status_code == 200
        items = topics.json()
        assert len(items) == 4
        assert all(
            set(item)
            == {
                "id",
                "chat_id",
                "topic_id",
                "title",
                "enabled",
                "last_message_id",
                "last_synced_at",
                "messages",
                "last_error",
            }
            for item in items
        )
        assert all(item["last_error"] == "" for item in items)
        assert (
            client.get("/api/telegram/topics", params={"chat_id": -123}, headers=headers).json()
            == []
        )

        def get(**params):
            return client.get(
                "/api/telegram/messages", params={"chat_id": CHAT, **params}, headers=headers
            )

        important = get(focus="important").json()["messages"]
        assert {m["message_id"] for m in important} == {80001, 80002, 80003}
        assert {m["sender_role"] for m in important} == {"owner", "signal_bot"}
        assert all(m["topic_title"] and m["sender_id"] for m in important)
        assert {m["message_id"] for m in get(focus="owner").json()["messages"]} == {
            80002,
            80003,
            80004,
        }
        assert [
            m["message_id"] for m in get(focus="important", topic_id=748).json()["messages"]
        ] == [80002]
        assert len(get().json()["messages"]) == 7
        assert get(focus="nope").status_code == 400


def test_general_paging_is_bounded_and_failure_is_atomic(monkeypatch):
    import app.telegram_forum_sync as sync
    from app.telegram_models import TelegramTopic
    from app.telegram_topics import ensure_topics

    async def scenario():
        dialog = await seed()
        async with SessionLocal() as db:
            topics = await ensure_topics(db, dialog)
        client = ForumClient([raw(1000 + i, 748) for i in range(500)] + [raw(1, 1)])
        monkeypatch.setattr(sync, "MAX_PAGES", 2)
        batch, _, bounded = await sync.read_window(client, CHAT, 1, 200)
        assert batch == [] and bounded
        assert len(client.calls) == 2
        real_upsert = sync.upsert_message

        async def fail_second(db, dialog, data, **kwargs):
            if data["message_id"] == 1001:
                raise RuntimeError("write failed")
            return await real_upsert(db, dialog, data, **kwargs)

        monkeypatch.setattr(sync, "upsert_message", fail_second)
        await sync.sync_forum(ForumClient([raw(1000, 748), raw(1001, 748)]), dialog, 200)
        async with SessionLocal() as db:
            topic = await db.get(TelegramTopic, next(t.id for t in topics if t.topic_id == 748))
            assert topic.last_message_id == 0
            assert topic.last_error == "write failed"
            assert not list(
                await db.scalars(
                    select(TelegramMessage).where(TelegramMessage.dialog_id == dialog.id)
                )
            )

    asyncio.run(scenario())


def test_sparse_general_initial_backfill_continues_older_pages(monkeypatch):
    import app.telegram_forum_sync as sync
    from app.telegram_models import TelegramTopic

    async def scenario():
        dialog = await seed()
        messages = [raw(10000 + i, 748) for i in range(250)] + [raw(i, 1) for i in range(1, 251)]
        client = ForumClient(messages)
        monkeypatch.setattr(sync, "MAX_PAGES", 1)
        await sync.sync_forum(client, dialog, 200)
        await sync.sync_forum(client, dialog, 200)
        await sync.sync_forum(client, dialog, 200)
        async with SessionLocal() as db:
            stored = list(
                await db.scalars(
                    select(TelegramMessage).where(
                        TelegramMessage.dialog_id == dialog.id, TelegramMessage.topic_id == 1
                    )
                )
            )
            assert len(stored) == 200
            assert min(m.message_id for m in stored) == 51
            topic = await db.scalar(
                select(TelegramTopic).where(
                    TelegramTopic.dialog_id == dialog.id, TelegramTopic.topic_id == 1
                )
            )
            assert topic.last_error == ""

    asyncio.run(scenario())


def test_production_resolves_one_account_and_ignores_other_chat_deletes():
    async def scenario():
        await seed()
        collector = TelegramCollector()
        await collector._load_account()
        async with SessionLocal() as db:
            primary = await db.scalar(
                select(TelegramAccount.id).order_by(TelegramAccount.id).limit(1)
            )
            assert collector.account_id == primary
        # Production must not mutate any old followed unrelated archive.
        async with SessionLocal() as db:
            other = TelegramDialog(account_id=primary, chat_id=-98765)
            db.add(other)
            await db.flush()
            message = TelegramMessage(dialog_id=other.id, chat_id=other.chat_id, message_id=111)
            db.add(message)
            await db.commit()
        await collector.ingest_deleted(-98765, [111])
        async with SessionLocal() as db:
            assert (await db.get(TelegramMessage, message.id)).deleted_at is None

    asyncio.run(scenario())


def test_forum_history_keeps_media_download_path(monkeypatch):
    async def scenario():
        dialog = await seed()
        photo = raw(9999, 748)
        photo.media = type("MessageMediaPhoto", (), {})()
        client = ForumClient([photo])
        collector = TelegramCollector(account_id=dialog.account_id, client_factory=lambda: client)
        collector._client = client
        downloaded = []

        async def capture(self, db, row, message, source):
            downloaded.append(row.message_id)

        monkeypatch.setattr(TelegramCollector, "_download", capture)
        await collector._backfill_dialog(client, dialog)
        assert downloaded == [9999]

    asyncio.run(scenario())


def test_forum_backfill_derives_signals_and_positions():
    """Forum sync / backfill must derive signals and update the position ledger."""
    from app.copy_models import Position, Signal
    from app.telegram_forum_sync import sync_forum
    from tests.test_signal_push import OPEN_TEXT

    async def scenario():
        dialog = await seed()
        signal_msg = raw(8888, 926111, body=OPEN_TEXT, sender=8797733775)
        # Also include a chatter message from a member in 748 that pastes signal text
        fake_msg = raw(8889, 748, body=OPEN_TEXT, sender=123456)
        client = ForumClient([signal_msg, fake_msg])
        await sync_forum(client, dialog, limit=10)

        async with SessionLocal() as db:
            sig = await db.scalar(
                select(Signal).where(
                    Signal.dialog_id == dialog.id,
                    Signal.message_id == 8888,
                )
            )
            assert sig is not None
            assert sig.symbol == "BTCUSDT"
            assert sig.kind == "open"

            # Fake message from non-bot in non-signal topic must NOT create a signal
            fake_sig = await db.scalar(
                select(Signal).where(
                    Signal.dialog_id == dialog.id,
                    Signal.message_id == 8889,
                )
            )
            assert fake_sig is None

            pos = await db.scalar(
                select(Position).where(Position.symbol == "BTCUSDT", Position.status == "open")
            )
            assert pos is not None
            assert pos.entry == 84768.06

    asyncio.run(scenario())
