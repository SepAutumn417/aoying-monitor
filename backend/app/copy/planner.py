"""Turn parsed signals into the orders we *would* place.

Nothing here talks to an exchange. The planner keeps a shadow book
(`copy_positions`) and records one `copy_intents` row per signal, so the whole
decision chain can be inspected before any money is at risk.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.copy.sizing import price_of, size_for
from app.copy_models import CopyIntent, CopyPosition, Position, Signal

log = logging.getLogger(__name__)

STAGE = "shadow"


@dataclass
class PlanStats:
    signals: int = 0
    intents: int = 0
    skipped: int = 0
    realized: float = 0.0


async def _open_book(db: AsyncSession, symbol: str, side: str) -> CopyPosition | None:
    return await db.scalar(
        select(CopyPosition)
        .where(
            CopyPosition.symbol == symbol,
            CopyPosition.side == side,
            CopyPosition.status == "open",
        )
        .order_by(CopyPosition.opened_at.desc())
        .limit(1)
    )


def _realised_ratio(signal: Signal, position: Position) -> float:
    """Convert his absolute PnL into the percentage he earned on his notional.

    His `realized` is cumulative for the position; his notional at open is
    `entry × qty_open`. Applying that percentage to our own notional is the only
    honest way to express "the same trade at our size".
    """

    basis = (position.entry or 0.0) * (position.qty_open or 0.0)
    if basis <= 0 or signal.realized is None:
        return 0.0
    return signal.realized / basis


async def plan_signal(db: AsyncSession, signal: Signal, *, equity: float) -> CopyIntent:
    """Plan one signal. Always returns an intent, even when it does nothing."""

    symbol, side = signal.symbol, signal.side
    price = price_of(signal.entry, signal.mark)
    book = await _open_book(db, symbol, side)
    qty_before = book.qty if book else 0.0
    notional_before = book.notional if book else 0.0

    closing = signal.kind == "close"
    sizing = size_for(
        equity=equity,
        lev_actual=signal.lev_actual,
        price=price,
        symbol=symbol,
        closing=closing,
    )

    note = sizing.note if sizing else "no_price"
    target_qty = sizing.target_qty if sizing else 0.0
    target_notional = sizing.target_notional if sizing else 0.0
    delta = round(target_qty - qty_before, 10)

    status = STAGE
    if sizing is None:
        status = "skipped"
    elif book is None and signal.kind != "open":
        # the bot's opening message predates the archive: never invent a book
        status = "skipped"
        note = ",".join(filter(None, [note, "no_open_position"]))
    elif not closing and target_qty <= 0:
        status = "skipped"
        note = ",".join(filter(None, [note, "target_zero"]))

    # keep the book in step even for a skipped order: the next signal re-anchors
    if book is None and signal.kind == "open" and status != "skipped":
        position = await db.scalar(
            select(Position).where(
                Position.open_signal_id == signal.id,
            )
        )
        book = CopyPosition(
            symbol=symbol,
            side=side,
            status="open",
            source_position_id=position.id if position else None,
            opened_at=signal.posted_at or signal.parsed_at,
            qty=0.0,
            entry=price,
            notional=0.0,
            lev=signal.lev_target,
        )
        db.add(book)
        await db.flush()

    if book is not None and status != "skipped":
        if closing:
            # the exit order is "unwind everything"; the book keeps the size it
            # actually held, because that is what the P&L is measured against
            book.qty = 0.0
            book.lev = signal.lev_target or book.lev
            source = (
                await db.get(Position, book.source_position_id)
                if book.source_position_id
                else None
            )
            if source is not None:
                ratio = _realised_ratio(signal, source)
                book.realized = round(ratio * notional_before, 2)
            book.status = "closed"
            book.closed_at = signal.posted_at or signal.parsed_at
        else:
            book.qty = target_qty
            book.notional = target_notional
            book.lev = signal.lev_target or book.lev
            if signal.kind == "open":
                book.entry = price

    intent = CopyIntent(
        signal_id=signal.id,
        copy_position_id=book.id if book else None,
        stage=STAGE,
        action=signal.kind,
        symbol=symbol,
        side=side,
        equity=equity,
        lev_actual=signal.lev_actual,
        target_notional=round(target_notional, 4),
        target_qty=target_qty,
        qty_before=qty_before,
        delta_qty=delta,
        price=price,
        status=status,
        note=note,
    )
    db.add(intent)
    return intent


async def replay(db: AsyncSession, *, equity: float) -> PlanStats:
    """Rebuild the shadow book from every signal on record, in order."""

    await db.execute(delete(CopyIntent))
    await db.execute(delete(CopyPosition))

    signals = (
        await db.scalars(select(Signal).order_by(Signal.posted_at, Signal.message_id))
    ).all()

    stats = PlanStats(signals=len(signals))
    for signal in signals:
        intent = await plan_signal(db, signal, equity=equity)
        stats.intents += 1
        if intent.status == "skipped":
            stats.skipped += 1
    await db.commit()

    closed = (
        await db.scalars(select(CopyPosition).where(CopyPosition.status == "closed"))
    ).all()
    stats.realized = round(sum(p.realized for p in closed), 2)
    return stats
