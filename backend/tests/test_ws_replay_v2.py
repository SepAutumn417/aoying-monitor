"""Protocol tests with a real event log and a deterministic websocket transport."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.websockets import WebSocketDisconnect

from app import events
from app.api import ws
from app.models import Event


class Socket:
    query_params = {"ticket": "test-ticket"}

    def __init__(self):
        self.incoming = asyncio.Queue()
        self.outgoing = asyncio.Queue()
        self.sending = False
        self.concurrent_send = False
        self.closed = None

    async def accept(self):
        pass

    async def send_json(self, frame):
        self.concurrent_send |= self.sending
        self.sending = True
        await asyncio.sleep(0)
        await self.outgoing.put(frame)
        self.sending = False

    async def receive_json(self):
        value = await self.incoming.get()
        if isinstance(value, Exception):
            raise value
        return value

    async def close(self, code=1000, reason=""):
        self.concurrent_send |= self.sending
        self.closed = (code, reason)
        await self.outgoing.put({"type": "closed", "code": code})

    async def frame(self):
        return await asyncio.wait_for(self.outgoing.get(), 2)


async def scenario(monkeypatch, body, ids=(), database_url="sqlite+aiosqlite:///:memory:"):
    engine = create_async_engine(database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Event.__table__.create)
    async with sessions() as db:
        db.add_all([Event(id=i, kind="signal.open", payload="{}") for i in ids])
        await db.commit()
    local_hub = events.EventHub()
    monkeypatch.setattr(ws, "SessionLocal", sessions)
    monkeypatch.setattr(ws, "hub", local_hub)
    monkeypatch.setattr(events, "hub", local_hub)

    async def redeem(ticket):
        return SimpleNamespace(id=1)

    monkeypatch.setattr(ws, "_redeem", redeem)
    # Endpoint teardown updates devices; this test database has only events.
    from app.models import Device

    async with engine.begin() as conn:
        await conn.run_sync(Device.__table__.create)
    socket = Socket()
    task = asyncio.create_task(ws.websocket_endpoint(socket))
    try:
        await body(socket, local_hub, sessions)
    finally:
        await socket.incoming.put(WebSocketDisconnect())
        try:
            await asyncio.wait_for(task, 2)
        finally:
            await engine.dispose()


def test_v2_replays_201_records_with_gap_ids_and_fixed_watermark(monkeypatch):
    async def body(socket, hub, sessions):
        assert (await socket.frame())["last_event_id"] == 603
        await socket.incoming.put({"type": "hello", "protocol_version": 2, "last_event_id": 0})
        pages = []
        while True:
            frame = await socket.frame()
            if frame["type"] == "replay_complete":
                assert frame["last_event_id"] == 603
                break
            assert frame["type"] == "replay"
            pages.append(frame)
        assert [page["count"] for page in pages] == [100, 100, 1]
        assert [page["next_cursor"] for page in pages] == [300, 600, 603]
        assert [page["has_more"] for page in pages] == [True, True, False]
        assert all(page["watermark"] == 603 for page in pages)
        assert [e["id"] for p in pages for e in p["events"]] == list(range(3, 604, 3))

    asyncio.run(scenario(monkeypatch, body, range(3, 604, 3)))


@pytest.mark.parametrize("cursor", [0, 9, 999])
def test_v2_empty_replay_always_completes(monkeypatch, cursor):
    async def body(socket, hub, sessions):
        await socket.frame()
        await socket.incoming.put({"type": "hello", "protocol_version": 2, "last_event_id": cursor})
        frame = await socket.frame()
        assert frame == {"type": "replay_complete", "last_event_id": 0}

    asyncio.run(scenario(monkeypatch, body))


def test_subscription_precedes_initial_snapshot_and_hello(monkeypatch):
    original_latest = ws.latest_id
    inserted = False

    async def snapshot(db):
        nonlocal inserted
        assert ws.hub.subscriber_count == 1
        captured = await original_latest(db)
        if not inserted:
            inserted = True
            # Real commit after H was read but before initial hello is sent.
            db.add(Event(id=10, kind="signal.open", payload="{}"))
            await db.commit()
            await ws.hub.publish({"id": 10, "kind": "signal.open"})
        return captured

    monkeypatch.setattr(ws, "latest_id", snapshot)

    async def body(socket, hub, sessions):
        assert (await socket.frame())["type"] == "hello"
        assert (await socket.frame())["event"]["id"] == 10

    asyncio.run(scenario(monkeypatch, body))


def test_live_during_replay_is_not_in_snapshot_and_sends_are_serial(monkeypatch):
    original_replay = ws.replay
    published = False

    async def interleave(db, *args, **kwargs):
        nonlocal published
        page = await original_replay(db, *args, **kwargs)
        if not published:
            published = True
            db.add(Event(id=999, kind="signal.close", payload="{}"))
            await db.commit()
            await ws.hub.publish({"id": 999, "kind": "signal.close"})
            await asyncio.sleep(0)
        return page

    monkeypatch.setattr(ws, "replay", interleave)

    async def body(socket, hub, sessions):
        await socket.frame()
        await socket.incoming.put({"type": "hello", "protocol_version": 2, "last_event_id": 0})
        replayed, live, complete = [], [], False
        while not complete or not live:
            frame = await socket.frame()
            if frame["type"] == "event":
                live.append(frame["event"]["id"])
            elif frame["type"] == "replay":
                assert frame["watermark"] == 201
                replayed.extend(e["id"] for e in frame["events"])
            elif frame["type"] == "replay_complete":
                assert frame["last_event_id"] == 201
                complete = True
        assert replayed == list(range(1, 202))
        assert live == [999]
        assert not socket.concurrent_send

    asyncio.run(scenario(monkeypatch, body, range(1, 202)))


def test_v1_keeps_single_page_and_no_completion(monkeypatch):
    async def body(socket, hub, sessions):
        await socket.frame()
        await socket.incoming.put({"type": "hello", "last_event_id": 1})
        frame = await socket.frame()
        assert set(frame) == {"type", "events", "count"}
        assert frame["count"] == 100
        await socket.incoming.put({"type": "ping"})
        assert (await socket.frame())["type"] == "pong"

    asyncio.run(scenario(monkeypatch, body, range(1, 203)))


@pytest.mark.parametrize("message", [[], None, "hello", {"type": "hello", "last_event_id": -1}])
def test_malformed_messages_are_rejected_without_crashing(monkeypatch, message):
    async def body(socket, hub, sessions):
        await socket.frame()
        await socket.incoming.put(message)
        assert (await socket.frame())["type"] == "error"
        await socket.incoming.put({"type": "ping"})
        assert (await socket.frame())["type"] == "pong"

    asyncio.run(scenario(monkeypatch, body))


def test_overflow_forces_socket_resync_instead_of_silent_loss(monkeypatch):
    async def body(socket, hub, sessions):
        await socket.frame()
        # publish does not yield with an uncontended lock: exhaust the bounded queue.
        for i in range(300):
            await hub.publish({"id": i + 1})
        while True:
            frame = await socket.frame()
            if frame["type"] == "closed":
                assert frame["code"] == 1013
                assert "resync" in socket.closed[1]
                break
        assert hub.subscriber_count == 0
        assert not socket.concurrent_send

    asyncio.run(scenario(monkeypatch, body))


@pytest.mark.parametrize("version", [1, 2])
def test_repeated_hello_after_v2_requires_resync(monkeypatch, version):
    async def body(socket, hub, sessions):
        await socket.frame()
        await socket.incoming.put({"type": "hello", "protocol_version": 2, "last_event_id": 0})
        await socket.incoming.put(
            {"type": "hello", "protocol_version": version, "last_event_id": 0}
        )
        assert (await socket.frame())["type"] == "replay_complete"
        assert (await socket.frame()) == {"type": "closed", "code": 1013}
        assert not socket.concurrent_send

    asyncio.run(scenario(monkeypatch, body))


def test_real_socket_disconnect_releases_database_connections():
    import gc
    import warnings

    from fastapi.testclient import TestClient
    from sqlalchemy.exc import SAWarning

    from app.db import engine
    from app.main import app

    gc.collect()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", SAWarning)
        with TestClient(app) as client:
            session = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "test-password-123", "device": {}},
            ).json()
            ticket = client.post(
                "/api/ws/ticket",
                headers={"Authorization": f"Bearer {session['access_token']}"},
            ).json()["ticket"]
            with client.websocket_connect(f"/ws?ticket={ticket}") as socket:
                hello = socket.receive_json()
                socket.send_json(
                    {
                        "type": "hello",
                        "protocol_version": 2,
                        "last_event_id": hello["last_event_id"],
                    }
                )
                assert socket.receive_json()["type"] == "replay_complete"
            assert engine.sync_engine.pool.checkedout() == 0
        gc.collect()
    assert not [str(w.message) for w in caught if issubclass(w.category, SAWarning)]


def test_real_concurrent_appends_publish_out_of_order_but_live_is_sorted(monkeypatch):
    from pathlib import Path

    from sqlalchemy import select

    async def body(socket, hub, sessions):
        assert (await socket.frame())["last_event_id"] == 0
        refreshed = asyncio.Event()
        release_first = asyncio.Event()
        async with sessions() as first, sessions() as second, hub.connection() as published:
            original_refresh = first.refresh

            async def delayed_refresh(event):
                # append_event has committed, but has not refreshed/published yet.
                refreshed.set()
                await release_first.wait()
                await original_refresh(event)

            monkeypatch.setattr(first, "refresh", delayed_refresh)
            pending = asyncio.create_task(events.append_event(first, "signal.open"))
            try:
                await asyncio.wait_for(refreshed.wait(), 2)
                later = await events.append_event(second, "signal.close")
                # Verify two *committed* rows in an independent real connection,
                # not synthetic hub payloads or two sessions sharing one connection.
                async with sessions() as observer:
                    committed = list(await observer.scalars(select(Event.id).order_by(Event.id)))
                assert committed == [later["id"] - 1, later["id"]]
                assert (await published.get())["id"] == later["id"]
                release_first.set()
                earlier = await pending
                assert (await published.get())["id"] == earlier["id"]
                live = [(await socket.frame())["event"]["id"] for _ in range(2)]
                assert live == [earlier["id"], later["id"]]
                assert not socket.concurrent_send
            finally:
                release_first.set()
                await pending

    path = Path(__file__).resolve().parents[1] / ".pytest-tmp" / "concurrent-live.db"
    asyncio.run(scenario(monkeypatch, body, database_url=f"sqlite+aiosqlite:///{path.as_posix()}"))


@pytest.mark.parametrize("ids", [(3, 303, 603), tuple(range(3, 604, 3))])
def test_live_wakeup_reads_gap_ids_from_log_not_hub_payload(monkeypatch, ids):
    async def body(socket, hub, sessions):
        await socket.frame()
        async with sessions() as db:
            db.add_all([Event(id=i, kind="signal.open", payload="{}") for i in ids])
            await db.commit()
        # A hub notification is just a wake-up, not an authoritative event payload.
        await hub.publish({"id": 603, "kind": "untrusted.wakeup"})
        frames = [await socket.frame() for _ in ids]
        assert [f["event"]["id"] for f in frames] == list(ids)
        assert all(f["event"]["kind"] == "signal.open" for f in frames)

    asyncio.run(scenario(monkeypatch, body))


def test_overflow_during_live_scan_closes_before_sending_any_scanned_row(monkeypatch):
    original_replay = ws.replay

    async def overflow(db, *args, **kwargs):
        rows = await original_replay(db, *args, **kwargs)
        for i in range(300):
            await ws.hub.publish({"id": i + 1})
        return rows

    monkeypatch.setattr(ws, "replay", overflow)

    async def body(socket, hub, sessions):
        await socket.frame()
        async with sessions() as db:
            db.add(Event(id=300, kind="signal.open", payload="{}"))
            await db.commit()
        await hub.publish({"id": 300})
        assert await socket.frame() == {"type": "closed", "code": 1013}
        assert not socket.concurrent_send

    asyncio.run(scenario(monkeypatch, body))
