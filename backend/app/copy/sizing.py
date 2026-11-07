"""How big our order should be.

The only rule: **match his actual leverage.** The bot prints `实际杠杆`, which is
`notional / account equity`. If we size so that our own `notional / equity` equals
his, then the percentage distance to liquidation is the same for both of us —
that is what the user asked for ("他多少爆仓，我就得差不多多少爆仓").

    our_notional = his_actual_leverage × our_equity
    our_qty      = our_notional / price

Sizing targets rather than deltas: every action recomputes the size we *should*
hold, and the executor takes the difference from what we do hold. A dropped
signal or a rejected order therefore self-corrects on the next one instead of
leaving a permanent offset.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.copy.contracts import ContractSpec, spec_for


@dataclass(frozen=True)
class Sizing:
    equity: float
    lev_actual: float
    price: float
    target_notional: float
    target_qty: float
    spec: ContractSpec
    spec_measured: bool
    note: str = ""


def price_of(entry: float | None, mark: float | None) -> float | None:
    """Prefer the mark price: it is what the exchange would fill against."""

    for candidate in (mark, entry):
        if candidate and candidate > 0:
            return float(candidate)
    return None


def size_for(
    *,
    equity: float,
    lev_actual: float | None,
    price: float | None,
    symbol: str,
    closing: bool = False,
) -> Sizing | None:
    spec, measured = spec_for(symbol)
    notes: list[str] = []
    if not measured:
        notes.append("contract_spec_assumed")

    if closing:
        return Sizing(
            equity=equity,
            lev_actual=lev_actual or 0.0,
            price=price or 0.0,
            target_notional=0.0,
            target_qty=0.0,
            spec=spec,
            spec_measured=measured,
            note=",".join(notes),
        )

    if not lev_actual or lev_actual <= 0:
        return None
    if not price or price <= 0:
        return None
    if equity <= 0:
        return None

    target_notional = lev_actual * equity
    raw_qty = target_notional / price
    qty = spec.floor_qty(raw_qty)

    if qty < spec.min_trade_num:
        notes.append("below_min_trade_num")
    if qty * price < spec.min_trade_usdt:
        notes.append("below_min_trade_usdt")

    return Sizing(
        equity=equity,
        lev_actual=lev_actual,
        price=price,
        target_notional=target_notional,
        target_qty=qty,
        spec=spec,
        spec_measured=measured,
        note=",".join(notes),
    )
