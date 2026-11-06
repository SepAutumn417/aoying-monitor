"""Append-only event log plus in-process fan-out to connected websockets.

Events are the single delivery path for I1: everything the UI needs to show
(and everything the Android foreground service turns into a notification) is
appended here, then pushed to live sockets. A client that was offline sends its
last seen id in `hello` and receives at most `REPLAY_LIMIT` missed events.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, utcnow

REPLAY_LIMIT = 100


class EventHub:
    """Fan-out to every socket owned by this process.

    The deployment runs a single `api` container, so an in-process hub is
    enough; if that ever becomes multi-worker this becomes a Postgres
    LISTEN/NOTIFY bridge behind the same interface.
    """

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        async with self._lock:
            self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    async def publish(self, event: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._subscribers)
        for queue in targets:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # A stuck consumer must not stall the writer; it will re-sync
                # from the event log on its next reconnect.
                continue

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


hub = EventHub()


def serialize(event: Event) -> dict[str, Any]:
    try:
        payload = json.loads(event.payload)
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": event.id,
        "kind": event.kind,
        "payload": payload,
        "created_at": event.created_at.isoformat(),
    }


async def append_event(
    db: AsyncSession, kind: str, payload: dict[str, Any] | None = None
) -> dict[str, Any]:
    event = Event(kind=kind, payload=json.dumps(payload or {}, ensure_ascii=False))
    db.add(event)
    await db.commit()
    await db.refresh(event)
    data = serialize(event)
    await hub.publish(data)
    return data


async def replay(
    db: AsyncSession, after_id: int, limit: int = REPLAY_LIMIT
) -> list[dict[str, Any]]:
    rows = await db.scalars(
        select(Event).where(Event.id > after_id).order_by(Event.id).limit(limit)
    )
    return [serialize(row) for row in rows]


async def latest_id(db: AsyncSession) -> int:
    value = await db.scalar(select(Event.id).order_by(Event.id.desc()).limit(1))
    return int(value or 0)


def now_iso() -> str:
    return datetime.now(tz=utcnow().tzinfo).isoformat()
