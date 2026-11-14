"""Websocket endpoint: single-use ticket in, live events out.

Protocol (line: one JSON object per frame, both directions):

    server -> {"type":"hello","device_id":…,"last_event_id":…,"server_time":…}
    client -> {"type":"hello","last_event_id":123}
    server -> {"type":"replay","events":[…],"count":n}        (only when behind)
    server -> {"type":"event","event":{…}}                     (live)
    client -> {"type":"ping"}  server -> {"type":"pong"}
    server -> {"type":"error","message":…}  (invalid message)

Optional client hello protocol_version=2 enables snapshot-bounded pages:
    replay includes next_cursor, watermark and has_more, then replay_complete
    carries last_event_id=watermark even for an empty replay. Live can interleave;
    clients buffer it until completion, then merge by event ID. Only one v2 hello
    is allowed per socket. Queue overflow closes with 1013 to require resync.

A ticket can be redeemed exactly once and only within its TTL, so a leaked
`ws_url` is useless after the first connect.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from anyio import CancelScope
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.db import SessionLocal
from app.events import REPLAY_LIMIT, hub, latest_id, replay
from app.models import Device, WsTicket
from app.security import hash_secret

router = APIRouter()

# Drop a socket that has sent nothing for this long; the client pings every 25s.
IDLE_TIMEOUT_SECONDS = 75


async def _redeem(ticket: str) -> Device | None:
    async with SessionLocal() as db:
        row = await db.scalar(select(WsTicket).where(WsTicket.ticket == hash_secret(ticket)))
        if row is None:
            return None
        now = datetime.now(UTC)
        expired = row.expires_at <= now
        if row.used_at is not None or expired:
            return None
        row.used_at = now
        device = await db.get(Device, row.device_id)
        await db.commit()
        if device is None or device.revoked_at is not None:
            return None
        return device


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    ticket = websocket.query_params.get("ticket", "")
    if not ticket:
        await websocket.close(code=4401, reason="missing ticket")
        return

    device = await _redeem(ticket)
    if device is None:
        await websocket.close(code=4401, reason="invalid or used ticket")
        return

    await websocket.accept()

    write_lock = asyncio.Lock()
    closed = False

    async def send(frame: dict) -> None:
        nonlocal closed
        async with write_lock:
            if closed:
                return
            # Overflow may have occurred while a replay/live DB read was
            # suspended. Never emit its rows/completion past a known loss.
            if queue.overflowed:
                closed = True
                await websocket.close(
                    code=1013, reason="event queue overflow: reconnect and resync"
                )
                return
            await websocket.send_json(frame)

    async def close(code: int, reason: str) -> None:
        nonlocal closed
        async with write_lock:
            if not closed:
                closed = True
                await websocket.close(code=code, reason=reason)

    async def receive_loop() -> None:
        v2_started = False
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(), timeout=IDLE_TIMEOUT_SECONDS
                )
                if not isinstance(message, dict):
                    raise ValueError("not an object")
            except TimeoutError:
                await close(4408, "idle timeout")
                return
            except (ValueError, TypeError):
                await send({"type": "error", "message": "消息必须是 JSON 对象"})
                continue

            kind = message.get("type")
            if kind == "ping":
                await send({"type": "pong", "server_time": datetime.now(UTC).isoformat()})
            elif kind == "hello":
                # Once v2 begins, even a downgrade hello must reconnect rather
                # than restart replay on a cursor the client is still merging.
                if v2_started:
                    await close(1013, "repeated hello: reconnect and resync")
                    return
                try:
                    after = int(message.get("last_event_id") or 0)
                    if after < 0:
                        raise ValueError("negative cursor")
                except (TypeError, ValueError, OverflowError):
                    await send({"type": "error", "message": "无效事件游标"})
                    continue
                if message.get("protocol_version") == 2:
                    v2_started = True
                    async with SessionLocal() as db:
                        watermark = await latest_id(db)
                        while after < watermark:
                            missed = await replay(db, after, through_id=watermark)
                            if not missed:
                                break
                            after = missed[-1]["id"]
                            # Probe the bounded log, not ID arithmetic: IDs can have gaps.
                            more = bool(await replay(db, after, limit=1, through_id=watermark))
                            await send(
                                {
                                    "type": "replay",
                                    "events": missed,
                                    "count": len(missed),
                                    "next_cursor": after,
                                    "watermark": watermark,
                                    "has_more": more,
                                }
                            )
                            if not more:
                                break
                    await send({"type": "replay_complete", "last_event_id": watermark})
                elif after > 0:
                    async with SessionLocal() as db:
                        missed = await replay(db, after)
                    if missed:
                        await send({"type": "replay", "events": missed, "count": len(missed)})
            else:
                await send({"type": "error", "message": f"未知消息类型: {kind}"})

    try:
        # Registration must finish before the initial hello snapshot; a commit
        # racing either snapshot is then covered by replay, live, or both.
        async with hub.connection() as queue:
            async with SessionLocal() as db:
                last = await latest_id(db)
            await send(
                {
                    "type": "hello",
                    "device_id": device.id,
                    "last_event_id": last,
                    "server_time": datetime.now(UTC).isoformat(),
                    "replay_limit": REPLAY_LIMIT,
                }
            )

            async def send_loop() -> None:
                live_cursor = last
                while True:
                    wakeup = await queue.get()
                    if wakeup is None or queue.overflowed:
                        await close(1013, "event queue overflow: reconnect and resync")
                        return
                    # The hub is a wake-up, NOT authoritative delivery content:
                    # append_event can commit n then publish n+1 before n.refresh
                    # finishes. SQLite serializes writers, so committed H also
                    # covers all committed lower IDs (including real ID gaps).
                    # This relies on the deployed single-worker SQLite log; it
                    # is NOT a Postgres sequence/commit-order guarantee.
                    async with SessionLocal() as db:
                        watermark = await latest_id(db)
                    while live_cursor < watermark:
                        async with SessionLocal() as db:
                            page = await replay(db, live_cursor, through_id=watermark)
                        # Release each read transaction before network backpressure.
                        if not page:
                            break
                        for event in page:
                            await send({"type": "event", "event": event})
                            if closed:
                                return
                            live_cursor = event["id"]

            tasks = [asyncio.create_task(send_loop()), asyncio.create_task(receive_loop())]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                # ASGI/TestClient cancellation is level-triggered. Let child
                # sessions finish rollback/close before their connection is lost.
                with CancelScope(shield=True):
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
    except WebSocketDisconnect:
        pass
    finally:
        with CancelScope(shield=True):
            async with SessionLocal() as db:
                row = await db.get(Device, device.id)
                if row is not None:
                    row.last_seen_at = datetime.now(UTC)
                    await db.commit()
