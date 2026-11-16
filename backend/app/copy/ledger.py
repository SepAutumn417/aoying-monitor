"""Turn parsed bot actions into position state.

The ledger is the only writer of `signals`, `positions` and `position_events`.
It is intentionally small: a signal either matches an open position or it does
not. Signals that predate the archive (their 新开仓 was never collected) are
still stored for audit, they just never become events.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.copy.parser import ParsedSignal, parse_signal
from app.copy_models import Position, PositionEvent, Signal
from app.models import utcnow
from app.telegram_models import TelegramMessage
from app.telegram_topics import is_signal_source

log = logging.getLogger(__name__)

KIND_OPEN = "open"
KIND_CLOSE = "close"


@dataclass
class RebuildStats:
    messages: int = 0
    signals: int = 0
    positions: int = 0
    events: int = 0
    orphans: int = 0


async def ingest(
    db: AsyncSession,
    *,
    dialog_id: int,
    message_id: int,
    text: str,
    posted_at: datetime | None = None,
) -> Signal | None:
    """Parse one message and apply it. Idempotent on (dialog_id, message_id)."""

    signal, _, _ = await ingest_result(
        db, dialog_id=dialog_id, message_id=message_id, text=text, posted_at=posted_at
    )
    return signal


async def _recalculate_position(db: AsyncSession, position: Position) -> None:
    events = list(
        await db.scalars(
            select(PositionEvent)
            .where(PositionEvent.position_id == position.id)
            .order_by(PositionEvent.at, PositionEvent.id)
        )
    )
    if not events:
        await db.delete(position)
        return
    if events[0].kind != KIND_OPEN:
        for ev in events:
            await db.delete(ev)
        await db.delete(position)
        return

    first = events[0]
    first_sig = await db.get(Signal, first.signal_id)
    if first_sig is not None:
        position.symbol = first_sig.symbol
        position.side = first_sig.side
        position.open_signal_id = first_sig.id

    position.opened_at = first.at
    position.entry = first.entry
    position.qty_open = first.qty_after if first.qty_after is not None else first.qty_before
    position.qty_current = first.qty_after
    position.lev = first.lev
    position.margin = first.margin
    position.realized = first.realized or 0.0
    position.status = "open"
    position.closed_at = None

    for ev in events[1:]:
        if ev.entry is not None:
            position.entry = ev.entry
        if ev.qty_after is not None:
            position.qty_current = ev.qty_after
        if ev.lev is not None:
            position.lev = ev.lev
        if ev.margin is not None:
            position.margin = ev.margin
        if ev.realized is not None:
            position.realized = ev.realized
        if ev.kind == KIND_CLOSE:
            position.status = "closed"
            position.closed_at = ev.at
            position.qty_current = 0.0
        else:
            position.status = "open"
            position.closed_at = None


async def retract_messages(
    db: AsyncSession, dialog_id: int, message_ids: list[int]
) -> list[int]:
    """Retract signals and recalculate or remove positions when messages are deleted or edited away."""
    if not message_ids:
        return []
    signals = list(
        await db.scalars(
            select(Signal).where(
                Signal.dialog_id == dialog_id,
                Signal.message_id.in_(message_ids),
            )
        )
    )
    if not signals:
        return []

    affected_pos_ids: set[int] = set()
    retracted_ids = [s.id for s in signals]
    for signal in signals:
        pe = await db.scalar(
            select(PositionEvent).where(PositionEvent.signal_id == signal.id)
        )
        if pe is not None:
            affected_pos_ids.add(pe.position_id)
            await db.delete(pe)
        await db.delete(signal)
    await db.flush()

    for pos_id in affected_pos_ids:
        pos = await db.get(Position, pos_id)
        if pos is None:
            continue
        events = list(
            await db.scalars(
                select(PositionEvent)
                .where(PositionEvent.position_id == pos_id)
                .order_by(PositionEvent.at, PositionEvent.id)
            )
        )
        if not events or pos.open_signal_id in retracted_ids or events[0].kind != KIND_OPEN:
            for ev in events:
                await db.delete(ev)
            await db.delete(pos)
        else:
            await _recalculate_position(db, pos)
    await db.flush()
    return retracted_ids


async def ingest_result(
    db: AsyncSession,
    *,
    dialog_id: int,
    message_id: int,
    text: str,
    posted_at: datetime | None = None,
) -> tuple[Signal | None, Position | None, bool]:
    """`ingest`, but also hand back the position the signal landed on.

    The collector needs the position to say "this closed your ZEC long" in the
    push, and re-reading it by (symbol, side, status) after the fact would race
    with the next message in the same batch.

    The third value says whether this call actually created the signal. A
    re-ingest of an archived message (an edit, a backfill over ground already
    covered) must not push the phone a second time.
    """

    existing = await db.scalar(
        select(Signal).where(Signal.dialog_id == dialog_id, Signal.message_id == message_id)
    )
    if existing is not None:
        parsed = parse_signal(text) if text else None
        if parsed is None:
            await retract_messages(db, dialog_id, [message_id])
            return None, None, False

        changed = (
            existing.kind != parsed.kind
            or existing.action != parsed.action
            or existing.symbol != parsed.symbol
            or existing.side != parsed.side
            or existing.lev_target != parsed.leverage
            or existing.lev_from != parsed.leverage_from
            or existing.lev_to != parsed.leverage_to
            or existing.lev_actual != parsed.lev_actual
            or existing.qty != parsed.qty
            or existing.qty_before != parsed.qty_before
            or existing.qty_after != parsed.qty_after
            or existing.entry != parsed.entry
            or existing.mark != parsed.mark
            or existing.margin != parsed.margin
            or existing.liq != parsed.liq
            or existing.floating != parsed.floating
            or existing.realized != parsed.realized
        )
        if changed:
            existing.kind = parsed.kind
            existing.action = parsed.action
            existing.symbol = parsed.symbol
            existing.side = parsed.side
            existing.lev_target = parsed.leverage
            existing.lev_from = parsed.leverage_from
            existing.lev_to = parsed.leverage_to
            existing.lev_actual = parsed.lev_actual
            existing.qty = parsed.qty
            existing.qty_before = parsed.qty_before
            existing.qty_after = parsed.qty_after
            existing.entry = parsed.entry
            existing.mark = parsed.mark
            existing.margin = parsed.margin
            existing.liq = parsed.liq
            existing.floating = parsed.floating
            existing.realized = parsed.realized
            existing.parsed_at = utcnow()
            pe = await db.scalar(
                select(PositionEvent).where(PositionEvent.signal_id == existing.id)
            )
            position = None
            if pe is not None:
                pe.kind = parsed.kind
                pe.qty_before = parsed.qty_before
                pe.qty_after = parsed.qty_after
                pe.entry = parsed.entry
                pe.mark = parsed.mark
                pe.margin = parsed.margin
                pe.lev = parsed.leverage
                pe.floating = parsed.floating
                pe.realized = parsed.realized
                position = await db.get(Position, pe.position_id)
                if position is not None:
                    if position.open_signal_id == existing.id:
                        position.symbol = parsed.symbol
                        position.side = parsed.side
                    await _recalculate_position(db, position)
            return existing, position, False
        return existing, None, False

    if not text:
        return None, None, False

    parsed = parse_signal(text)
    if parsed is None:
        return None, None, False

    async with db.begin_nested():
        signal = _signal_row(dialog_id, message_id, parsed, posted_at)
        db.add(signal)
        await db.flush()  # assign signal.id for the event row
        position = await _apply(db, signal)
    return signal, position, True


def _signal_row(
    dialog_id: int,
    message_id: int,
    parsed: ParsedSignal,
    posted_at: datetime | None,
) -> Signal:
    return Signal(
        dialog_id=dialog_id,
        message_id=message_id,
        kind=parsed.kind,
        action=parsed.action,
        symbol=parsed.symbol,
        side=parsed.side,
        lev_target=parsed.leverage,
        lev_from=parsed.leverage_from,
        lev_to=parsed.leverage_to,
        lev_actual=parsed.lev_actual,
        qty=parsed.qty,
        qty_before=parsed.qty_before,
        qty_after=parsed.qty_after,
        entry=parsed.entry,
        mark=parsed.mark,
        margin=parsed.margin,
        liq=parsed.liq,
        floating=parsed.floating,
        realized=parsed.realized,
        posted_at=posted_at or parsed.reported_at or utcnow(),
        reported_at=parsed.reported_at,
        parsed_at=utcnow(),
    )


async def _open_position(db: AsyncSession, symbol: str, side: str) -> Position | None:
    return await db.scalar(
        select(Position)
        .where(Position.symbol == symbol, Position.side == side, Position.status == "open")
        .order_by(Position.opened_at.desc())
        .limit(1)
    )


async def _apply(db: AsyncSession, signal: Signal) -> Position | None:
    """Attach `signal` to a position, creating one for an 新开仓."""

    if signal.kind == KIND_OPEN:
        position = Position(
            symbol=signal.symbol,
            side=signal.side,
            status="open",
            opened_at=signal.posted_at,
            entry=signal.entry,
            qty_open=signal.qty,
            qty_current=signal.qty,
            lev=signal.lev_target,
            margin=signal.margin,
            realized=signal.realized or 0.0,
            open_signal_id=signal.id,
        )
        db.add(position)
        await db.flush()
    else:
        position = await _open_position(db, signal.symbol, signal.side)
        if position is None:
            log.debug(
                "orphan signal %s %s %s (no open position)",
                signal.kind,
                signal.symbol,
                signal.side,
            )
            return None
        position.qty_current = signal.qty_after
        if signal.entry is not None:
            position.entry = signal.entry
        if signal.lev_target is not None:
            position.lev = signal.lev_target
        if signal.margin is not None:
            position.margin = signal.margin
        # cumulative, as the bot reports it; never a running sum
        if signal.realized is not None:
            position.realized = signal.realized
        if signal.kind == KIND_CLOSE:
            position.status = "closed"
            position.closed_at = signal.posted_at
            position.qty_current = 0.0

    db.add(
        PositionEvent(
            position_id=position.id,
            signal_id=signal.id,
            kind=signal.kind,
            at=signal.posted_at,
            qty_before=signal.qty_before,
            qty_after=signal.qty_after,
            entry=signal.entry,
            mark=signal.mark,
            margin=signal.margin,
            lev=signal.lev_target,
            floating=signal.floating,
            realized=signal.realized,
        )
    )
    return position


async def ingest_message(db: AsyncSession, message: TelegramMessage) -> Signal | None:
    """Collector hook: derive a signal from an already-stored message."""

    signal, _, _ = await ingest_message_result(db, message)
    return signal


async def ingest_message_result(
    db: AsyncSession, message: TelegramMessage
) -> tuple[Signal | None, Position | None, bool]:
    """`ingest_message`, plus the position and whether this was a first sight.

    The collector only pushes a signal event when `created` is true, so an edit
    or a backfill re-reading covered ground cannot ring the phone twice.
    """

    return await ingest_result(
        db,
        dialog_id=message.dialog_id,
        message_id=message.message_id,
        text=message.text or "",
        posted_at=message.posted_at,
    )


async def rebuild_from_messages(db: AsyncSession) -> RebuildStats:
    """Re-derive everything from the archived text.

    Signal rows are immutable once written, so a parser fix only takes effect
    after a rebuild. This wipes the three derived tables and replays the raw
    archive in posting order.
    """

    stats = RebuildStats()
    await db.execute(delete(PositionEvent))
    await db.execute(delete(Position))
    await db.execute(delete(Signal))
    await db.flush()

    rows = await db.scalars(
        select(TelegramMessage)
        .where(
            TelegramMessage.text != "",
            TelegramMessage.deleted_at.is_(None),
        )
        .order_by(TelegramMessage.posted_at, TelegramMessage.message_id)
    )
    for message in rows:
        if not is_signal_source(message.chat_id, message.topic_id, message.sender_id):
            continue
        stats.messages += 1
        signal = await ingest_message(db, message)
        if signal is None:
            continue
        stats.signals += 1

    stats.positions = await db.scalar(select(func.count(Position.id))) or 0
    stats.events = await db.scalar(select(func.count(PositionEvent.id))) or 0
    stats.orphans = stats.signals - stats.events
    return stats


async def summary(db: AsyncSession) -> dict[str, Any]:
    """Counts used by the copy-trading status endpoint."""

    open_positions = await db.scalar(
        select(func.count(Position.id)).where(Position.status == "open")
    )
    closed_positions = await db.scalar(
        select(func.count(Position.id)).where(Position.status == "closed")
    )
    realized = await db.scalar(
        select(func.sum(Position.realized)).where(Position.status == "closed")
    )
    last_signal_at = await db.scalar(select(func.max(Signal.posted_at)))
    return {
        "positions_open": open_positions or 0,
        "positions_closed": closed_positions or 0,
        "realized_closed": round(float(realized or 0.0), 2),
        "signals": await db.scalar(select(func.count(Signal.id))) or 0,
        "events": await db.scalar(select(func.count(PositionEvent.id))) or 0,
        "last_signal_at": last_signal_at,
    }
