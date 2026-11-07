"""Signal and position API.

Read-only except for `rebuild`, which re-derives the three derived tables from
the archived Telegram text after a parser change.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.copy import ledger, planner
from app.copy_models import CopyIntent, CopyPosition, Position, PositionEvent, Signal
from app.db import get_db
from app.models import User
from app.security import current_user

router = APIRouter(prefix="/api", tags=["copy"])


class SignalItem(BaseModel):
    id: int
    message_id: int
    kind: str
    action: str
    symbol: str
    side: str
    lev_target: float | None = None
    lev_actual: float | None = None
    qty: float | None = None
    qty_before: float | None = None
    qty_after: float | None = None
    entry: float | None = None
    mark: float | None = None
    margin: float | None = None
    liq: float | None = None
    floating: float | None = None
    realized: float | None = None
    posted_at: datetime
    reported_at: datetime | None = None


class PositionEventItem(BaseModel):
    id: int
    kind: str
    at: datetime
    qty_before: float | None = None
    qty_after: float | None = None
    entry: float | None = None
    mark: float | None = None
    margin: float | None = None
    lev: float | None = None
    floating: float | None = None
    realized: float | None = None


class PositionItem(BaseModel):
    id: int
    symbol: str
    side: str
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    entry: float | None = None
    qty_open: float | None = None
    qty_current: float | None = None
    lev: float | None = None
    margin: float | None = None
    realized: float = 0.0
    held_seconds: int = 0
    events: list[PositionEventItem] = Field(default_factory=list)


class SignalList(BaseModel):
    signals: list[SignalItem]
    count: int


class PositionList(BaseModel):
    positions: list[PositionItem]
    count: int


class CopyStatus(BaseModel):
    positions_open: int
    positions_closed: int
    realized_closed: float
    signals: int
    events: int
    last_signal_at: datetime | None = None


class RebuildResult(BaseModel):
    messages: int
    signals: int
    positions: int
    events: int
    orphans: int


def _signal_item(row: Signal) -> SignalItem:
    return SignalItem(
        id=row.id,
        message_id=row.message_id,
        kind=row.kind,
        action=row.action,
        symbol=row.symbol,
        side=row.side,
        lev_target=row.lev_target,
        lev_actual=row.lev_actual,
        qty=row.qty,
        qty_before=row.qty_before,
        qty_after=row.qty_after,
        entry=row.entry,
        mark=row.mark,
        margin=row.margin,
        liq=row.liq,
        floating=row.floating,
        realized=row.realized,
        posted_at=row.posted_at,
        reported_at=row.reported_at,
    )


def _event_item(row: PositionEvent) -> PositionEventItem:
    return PositionEventItem(
        id=row.id,
        kind=row.kind,
        at=row.at,
        qty_before=row.qty_before,
        qty_after=row.qty_after,
        entry=row.entry,
        mark=row.mark,
        margin=row.margin,
        lev=row.lev,
        floating=row.floating,
        realized=row.realized,
    )


def _position_item(row: Position, with_events: bool) -> PositionItem:
    end = row.closed_at or datetime.now(row.opened_at.tzinfo)
    return PositionItem(
        id=row.id,
        symbol=row.symbol,
        side=row.side,
        status=row.status,
        opened_at=row.opened_at,
        closed_at=row.closed_at,
        entry=row.entry,
        qty_open=row.qty_open,
        qty_current=row.qty_current,
        lev=row.lev,
        margin=row.margin,
        realized=row.realized or 0.0,
        held_seconds=max(0, int((end - row.opened_at).total_seconds())),
        events=[_event_item(e) for e in row.events] if with_events else [],
    )


@router.get("/signals", response_model=SignalList)
async def list_signals(
    limit: int = Query(50, ge=1, le=500),
    before_id: int | None = None,
    kind: str | None = None,
    symbol: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> SignalList:
    stmt = select(Signal).order_by(Signal.posted_at.desc(), Signal.id.desc()).limit(limit)
    if before_id is not None:
        stmt = stmt.where(Signal.id < before_id)
    if kind:
        stmt = stmt.where(Signal.kind == kind)
    if symbol:
        stmt = stmt.where(Signal.symbol == symbol.upper())
    rows = (await db.scalars(stmt)).all()
    return SignalList(signals=[_signal_item(r) for r in rows], count=len(rows))


@router.get("/positions", response_model=PositionList)
async def list_positions(
    status_filter: str | None = Query(None, alias="status"),
    symbol: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    include_events: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> PositionList:
    if status_filter and status_filter not in {"open", "closed"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"未知的仓位状态：{status_filter}")

    stmt = (
        select(Position)
        .options(selectinload(Position.events))
        .order_by(Position.opened_at.desc(), Position.id.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(Position.status == status_filter)
    if symbol:
        stmt = stmt.where(Position.symbol == symbol.upper())
    rows = (await db.scalars(stmt)).all()
    return PositionList(
        positions=[_position_item(r, include_events) for r in rows],
        count=len(rows),
    )


@router.get("/copy/status", response_model=CopyStatus)
async def copy_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CopyStatus:
    return CopyStatus(**await ledger.summary(db))


@router.post("/signals/rebuild", response_model=RebuildResult)
async def rebuild_signals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> RebuildResult:
    stats = await ledger.rebuild_from_messages(db)
    await db.commit()
    return RebuildResult(
        messages=stats.messages,
        signals=stats.signals,
        positions=stats.positions,
        events=stats.events,
        orphans=stats.orphans,
    )


class CopyIntentItem(BaseModel):
    id: int
    signal_id: int
    action: str
    symbol: str
    side: str
    equity: float
    lev_actual: float | None
    target_notional: float
    target_qty: float
    qty_before: float
    delta_qty: float
    price: float | None
    status: str
    note: str
    created_at: datetime


class CopyIntentList(BaseModel):
    intents: list[CopyIntentItem]
    count: int


class CopyBookItem(BaseModel):
    id: int
    symbol: str
    side: str
    status: str
    qty: float
    entry: float | None
    notional: float
    lev: float | None
    realized: float
    opened_at: datetime
    closed_at: datetime | None


class CopyBook(BaseModel):
    positions: list[CopyBookItem]
    count: int
    realized: float


class ReplayRequest(BaseModel):
    equity: float | None = None


class ReplayResult(BaseModel):
    signals: int
    intents: int
    skipped: int
    realized: float


@router.get("/copy/intents", response_model=CopyIntentList)
async def list_intents(
    limit: int = Query(default=100, ge=1, le=500),
    symbol: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CopyIntentList:
    stmt = select(CopyIntent).order_by(CopyIntent.id.desc()).limit(limit)
    if symbol:
        stmt = stmt.where(CopyIntent.symbol == symbol.upper())
    if status_filter:
        stmt = stmt.where(CopyIntent.status == status_filter)
    rows = (await db.scalars(stmt)).all()
    return CopyIntentList(
        intents=[
            CopyIntentItem(
                id=r.id,
                signal_id=r.signal_id,
                action=r.action,
                symbol=r.symbol,
                side=r.side,
                equity=r.equity,
                lev_actual=r.lev_actual,
                target_notional=r.target_notional,
                target_qty=r.target_qty,
                qty_before=r.qty_before,
                delta_qty=r.delta_qty,
                price=r.price,
                status=r.status,
                note=r.note,
                created_at=r.created_at,
            )
            for r in rows
        ],
        count=len(rows),
    )


@router.get("/copy/book", response_model=CopyBook)
async def copy_book(
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> CopyBook:
    stmt = select(CopyPosition).order_by(CopyPosition.opened_at.desc())
    if status_filter:
        stmt = stmt.where(CopyPosition.status == status_filter)
    rows = (await db.scalars(stmt)).all()
    closed = [r for r in rows if r.status == "closed"]
    return CopyBook(
        positions=[
            CopyBookItem(
                id=r.id,
                symbol=r.symbol,
                side=r.side,
                status=r.status,
                qty=r.qty,
                entry=r.entry,
                notional=r.notional,
                lev=r.lev,
                realized=r.realized,
                opened_at=r.opened_at,
                closed_at=r.closed_at,
            )
            for r in rows
        ],
        count=len(rows),
        realized=round(sum(r.realized for r in closed), 2),
    )


@router.post("/copy/replay", response_model=ReplayResult)
async def replay_copy(
    body: ReplayRequest | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> ReplayResult:
    equity = (body.equity if body and body.equity else None) or get_settings().copy_equity_usdt
    stats = await planner.replay(db, equity=equity)
    return ReplayResult(
        signals=stats.signals,
        intents=stats.intents,
        skipped=stats.skipped,
        realized=stats.realized,
    )
