"""Signal, position and position-event tables.

`signals` is the audit trail: one row per bot message we understood, holding the
numbers exactly as the bot printed them. `positions` is the derived state: one
row per open→close lifecycle. `position_events` joins the two so a position can
be replayed step by step without re-parsing text.

A note on `realized`: the bot prints 已实现盈亏 as the position's **cumulative**
realised PnL at that moment, not the amount this single action banked. Verified
against the 2026-10-02 ZEC long position, whose four reductions read
-62,851.70 → -136,850.23 → -173,895.41 → -214,696.67. Never sum these.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base, UtcDateTime, utcnow


class Signal(Base):
    """One parsed bot action."""

    __tablename__ = "signals"
    __table_args__ = (
        UniqueConstraint("dialog_id", "message_id", name="uq_signal_message"),
        Index("ix_signal_posted", "posted_at"),
        Index("ix_signal_symbol", "symbol", "side"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dialog_id: Mapped[int] = mapped_column(
        ForeignKey("telegram_dialogs.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[int] = mapped_column(Integer)

    kind: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(120), default="")
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(8))

    lev_target: Mapped[float | None] = mapped_column(Float, default=None)
    lev_from: Mapped[float | None] = mapped_column(Float, default=None)
    lev_to: Mapped[float | None] = mapped_column(Float, default=None)
    lev_actual: Mapped[float | None] = mapped_column(Float, default=None)

    qty: Mapped[float | None] = mapped_column(Float, default=None)
    qty_before: Mapped[float | None] = mapped_column(Float, default=None)
    qty_after: Mapped[float | None] = mapped_column(Float, default=None)

    entry: Mapped[float | None] = mapped_column(Float, default=None)
    mark: Mapped[float | None] = mapped_column(Float, default=None)
    margin: Mapped[float | None] = mapped_column(Float, default=None)
    liq: Mapped[float | None] = mapped_column(Float, default=None)
    floating: Mapped[float | None] = mapped_column(Float, default=None)
    realized: Mapped[float | None] = mapped_column(Float, default=None)

    posted_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    reported_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    parsed_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)


class Position(Base):
    """One open→close lifecycle of a symbol/side pair."""

    __tablename__ = "positions"
    __table_args__ = (Index("ix_position_symbol_side", "symbol", "side", "status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default="open")

    opened_at: Mapped[datetime] = mapped_column(UtcDateTime)
    closed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)

    entry: Mapped[float | None] = mapped_column(Float, default=None)
    qty_open: Mapped[float | None] = mapped_column(Float, default=None)
    qty_current: Mapped[float | None] = mapped_column(Float, default=None)
    lev: Mapped[float | None] = mapped_column(Float, default=None)
    margin: Mapped[float | None] = mapped_column(Float, default=None)
    #: cumulative realised PnL as last reported by the bot, not a sum
    realized: Mapped[float] = mapped_column(Float, default=0.0)

    open_signal_id: Mapped[int | None] = mapped_column(
        ForeignKey("signals.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)

    events: Mapped[list[PositionEvent]] = relationship(
        back_populates="position", order_by="PositionEvent.at"
    )


class PositionEvent(Base):
    """A signal applied to a position; one signal can only land once."""

    __tablename__ = "position_events"
    __table_args__ = (UniqueConstraint("signal_id", name="uq_position_event_signal"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="CASCADE"), index=True
    )
    signal_id: Mapped[int] = mapped_column(ForeignKey("signals.id", ondelete="CASCADE"))

    kind: Mapped[str] = mapped_column(String(16))
    at: Mapped[datetime] = mapped_column(UtcDateTime)

    qty_before: Mapped[float | None] = mapped_column(Float, default=None)
    qty_after: Mapped[float | None] = mapped_column(Float, default=None)
    entry: Mapped[float | None] = mapped_column(Float, default=None)
    mark: Mapped[float | None] = mapped_column(Float, default=None)
    margin: Mapped[float | None] = mapped_column(Float, default=None)
    lev: Mapped[float | None] = mapped_column(Float, default=None)
    floating: Mapped[float | None] = mapped_column(Float, default=None)
    #: cumulative realised PnL for the whole position at this point
    realized: Mapped[float | None] = mapped_column(Float, default=None)

    position: Mapped[Position] = relationship(back_populates="events")
