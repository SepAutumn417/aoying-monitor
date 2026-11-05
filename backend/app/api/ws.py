"""Websocket endpoint: single-use ticket in, live events out.

Protocol (line: one JSON object per frame, both directions):

    server -> {"type":"hello","device_id":…,"last_event_id":…,"server_time":…}
    client -> {"type":"hello","last_event_id":123}
    server -> {"type":"replay","events":[…],"count":n}        (only when behind)
    server -> {"type":"event","event":{…}}                     (live)
    client -> {"type":"ping"}  server -> {"type":"pong"}
    server -> {"type":"error","message":…}  then close

A ticket can be redeemed exactly once and only within its TTL, so a leaked
`ws_url` is useless after the first connect.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

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

    async with SessionLocal() as db:
        last = await latest_id(db)

    await websocket.send_json(
        {
            "type": "hello",
            "device_id": device.id,
            "last_event_id": last,
            "server_time": datetime.now(UTC).isoformat(),
            "replay_limit": REPLAY_LIMIT,
        }
    )

    async def send_loop() -> None:
        async for event in hub.subscribe():
            await websocket.send_json({"type": "event", "event": event})

    sender = asyncio.create_task(send_loop())
    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=IDLE_TIMEOUT_SECONDS)
            except TimeoutError:
                await websocket.close(code=4408, reason="idle timeout")
                return
            except (ValueError, TypeError):
                await websocket.send_json({"type": "error", "message": "消息必须是 JSON 对象"})
                continue

            kind = message.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong", "server_time": datetime.now(UTC).isoformat()})
            elif kind == "hello":
                try:
                    after = int(message.get("last_event_id") or 0)
                except (TypeError, ValueError):
                    after = 0
                if after > 0:
                    async with SessionLocal() as db:
                        missed = await replay(db, after)
                    if missed:
                        await websocket.send_json(
                            {"type": "replay", "events": missed, "count": len(missed)}
                        )
            else:
                await websocket.send_json(
                    {"type": "error", "message": f"未知消息类型: {kind}"}
                )
    except WebSocketDisconnect:
        pass
    finally:
        sender.cancel()
        try:
            await sender
        except (asyncio.CancelledError, RuntimeError):
            pass
        async with SessionLocal() as db:
            row = await db.get(Device, device.id)
            if row is not None:
                row.last_seen_at = datetime.now(UTC)
                await db.commit()
