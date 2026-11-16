"""Append-only event log plus in-process fan-out to connected websockets.

Events are the single delivery path for I1: everything the UI needs to show
(and everything the Android foreground service turns into a notification) is
appended here, then pushed to live sockets. A client that was offline sends its
last seen id in `hello`. Protocol v1 receives one page; v2 pages to a fixed watermark.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, utcnow

REPLAY_LIMIT = 100


class EventQueue(asyncio.Queue[dict[str, Any] | None]):
    """Bounded wake-ups with a sticky overflow flag for in-flight scans."""

    def __init__(self) -> None:
        super().__init__(maxsize=256)
        self.overflowed = False


class EventHub:
    """Fan-out to every socket owned by this process.

    The deployment uses one SQLite API worker. Websockets use publications
    only as wake-ups and scan the committed log in ID order. Multiple workers
    or Postgres require a separate durable commit-order/cross-worker design;
    LISTEN/NOTIFY alone does not provide that ordering guarantee.
    """

    def __init__(self) -> None:
        self._subscribers: set[EventQueue] = set()
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[EventQueue]:
        """Register before taking a snapshot. None means reconnect and resync."""
        queue = EventQueue()
        async with self._lock:
            self._subscribers.add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        async with self.connection() as queue:
            while True:
                event = await queue.get()
                if event is None:
                    raise RuntimeError("event queue overflow: reconnect and resync")
                yield event

    async def publish(self, event: dict[str, Any]) -> None:
        async with self._lock:
            for queue in tuple(self._subscribers):
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    # Stop this consumer before another event can advance its cursor
                    # across lost data. Wake it with a terminal resync marker.
                    queue.overflowed = True
                    self._subscribers.discard(queue)
                    while not queue.empty():
                        queue.get_nowait()
                    queue.put_nowait(None)

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
    db: AsyncSession,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    commit: bool = True,
) -> dict[str, Any]:
    event = Event(kind=kind, payload=json.dumps(payload or {}, ensure_ascii=False))
    db.add(event)
    if commit:
        await db.commit()
        await db.refresh(event)
    else:
        await db.flush()
    data = serialize(event)
    if commit:
        await hub.publish(data)
    return data


async def replay(
    db: AsyncSession, after_id: int, limit: int = REPLAY_LIMIT, *, through_id: int | None = None
) -> list[dict[str, Any]]:
    query = select(Event).where(Event.id > after_id)
    if through_id is not None:
        query = query.where(Event.id <= through_id)
    rows = await db.scalars(query.order_by(Event.id).limit(limit))
    return [serialize(row) for row in rows]


async def latest_id(db: AsyncSession) -> int:
    value = await db.scalar(select(Event.id).order_by(Event.id.desc()).limit(1))
    return int(value or 0)


def now_iso() -> str:
    return datetime.now(tz=utcnow().tzinfo).isoformat()
