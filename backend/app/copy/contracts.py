"""Exchange contract precision.

An order quantity has to land on the exchange's step grid, and a too-small order
is rejected outright. Bitget publishes those numbers per symbol; until the live
client exists (I4) only the three symbols we measured are recorded here.

Anything not listed falls back to `DEFAULT` and the intent is tagged
`contract_spec_assumed` — a deliberately loud note, because a wrong step size
means a silently different position.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ContractSpec:
    size_multiplier: float
    min_trade_num: float
    min_trade_usdt: float = 5.0
    price_place: int = 2

    def floor_qty(self, qty: float) -> float:
        """Round down to the step grid; never round up — that would oversize."""

        if qty <= 0 or self.size_multiplier <= 0:
            return 0.0
        steps = int(qty / self.size_multiplier + 1e-9)
        # keep the float clean: 4 steps of 0.0001 is 0.0004, not 0.00040000000001
        decimals = max(0, len(f"{self.size_multiplier:.10f}".rstrip("0").split(".")[-1]))
        return round(steps * self.size_multiplier, decimals)


#: measured via Bitget `futures_get_contracts`, 2026-11-07
SPECS: dict[str, ContractSpec] = {
    "BTCUSDT": ContractSpec(size_multiplier=0.0001, min_trade_num=0.0001, price_place=1),
    "ETHUSDT": ContractSpec(size_multiplier=0.01, min_trade_num=0.01, price_place=2),
    "SNDKUSDT": ContractSpec(size_multiplier=0.001, min_trade_num=0.001, price_place=2),
}

DEFAULT = ContractSpec(size_multiplier=0.001, min_trade_num=0.001)


def spec_for(symbol: str) -> tuple[ContractSpec, bool]:
    """Return the spec and whether it is the measured one."""

    spec = SPECS.get(symbol.upper())
    if spec is None:
        return DEFAULT, False
    return spec, True
