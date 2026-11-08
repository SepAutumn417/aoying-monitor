"""Translate Bitget account and contract payloads into sizing inputs.

Everything here is read-only: it answers "how much money do we have" and "what
is the smallest step this contract accepts". No order, leverage or transfer call
is ever constructed in this module.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.copy.bitget import BitgetClient, BitgetError
from app.copy.contracts import ContractSpec, spec_for

log = logging.getLogger(__name__)

PRODUCT_TYPE = "USDT-FUTURES"


def equity_of(rows: list[dict[str, Any]]) -> float | None:
    """Pick the USDT-FUTURES account equity out of `/mix/account/accounts`.

    Bitget returns one row per margin coin. `accountEquity` is what the account is
    worth right now, including unrealised PnL, which is exactly the base the user
    asked us to size from. A missing or unparseable value returns None instead of
    a zero, so callers can refuse to size rather than silently trade nothing.
    """
    for row in rows:
        if str(row.get("marginCoin", "")).upper() != "USDT":
            continue
        raw = row.get("accountEquity")
        if raw is None:
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return None


def spec_of(row: dict[str, Any]) -> ContractSpec | None:
    """Build a ContractSpec from a `/mix/market/contracts` row.

    Bitget reports `sizeMultiplier` (the trade size step), `minTradeNum` (the
    smallest order) and `pricePlace` (price decimals). Any row missing a usable
    step is rejected so the caller keeps its conservative default.
    """
    try:
        step = float(row["sizeMultiplier"])
    except (KeyError, TypeError, ValueError):
        return None
    if step <= 0:
        return None
    try:
        minimum = float(row.get("minTradeNum", step))
    except (TypeError, ValueError):
        minimum = step
    try:
        price_place = int(row.get("pricePlace", 2))
    except (TypeError, ValueError):
        price_place = 2
    return ContractSpec(
        size_multiplier=step,
        min_trade_num=minimum if minimum > 0 else step,
        price_place=max(0, price_place),
    )


@dataclass(frozen=True)
class AccountSnapshot:
    """What the sizing layer needs, plus where the number came from."""

    equity: float
    source: str  # "bitget" | "config"
    detail: str = ""

    @property
    def from_exchange(self) -> bool:
        return self.source == "bitget"


class EquityUnavailable(RuntimeError):
    """Bitget is configured but its equity could not be read right now."""


def build_client(settings: Any) -> BitgetClient | None:
    """Construct the read-only client from settings, or None when unconfigured.

    Returning None (rather than a client that always fails) lets callers say
    "shadow mode" explicitly instead of reporting a fake exchange error.
    """
    if not getattr(settings, "bitget_configured", False):
        return None
    return BitgetClient(
        api_key=settings.bitget_api_key,
        secret=settings.bitget_secret,
        passphrase=settings.bitget_passphrase,
    )


async def read_equity(client: BitgetClient) -> float:
    """Read live futures equity, or raise if the exchange gave us nothing usable."""
    rows = await client.accounts()
    equity = equity_of(rows)
    if equity is None:
        raise EquityUnavailable("bitget returned no usable USDT equity")
    return equity


async def resolve_equity(
    client: BitgetClient | None, fallback: float
) -> AccountSnapshot:
    """Live equity when credentials exist, configured stand-in otherwise.

    A configured account that fails to answer raises instead of falling back:
    silently sizing from a stale constant is how a live order ends up the wrong
    size. Only a genuinely unconfigured client uses `fallback`.
    """
    if client is None or not client.configured:
        return AccountSnapshot(equity=fallback, source="config", detail="bitget_not_configured")
    try:
        equity = await read_equity(client)
    except BitgetError as error:
        raise EquityUnavailable(error.code) from None
    return AccountSnapshot(equity=equity, source="bitget")


@dataclass
class ContractBook:
    """Per-symbol contract specs, preferring measured values over defaults."""

    specs: dict[str, ContractSpec]
    assumed: set[str]

    def spec_for(self, symbol: str) -> tuple[ContractSpec, bool]:
        """Return the spec plus whether this run actually measured it.

        The static table in `contracts.py` came from a real `futures_get_contracts`
        call, but it is a snapshot, not a live reading. Anything answered from it
        reports ``measured=False`` so a stale step never masquerades as current.
        """
        key = symbol.upper()
        if key in self.specs:
            return self.specs[key], key not in self.assumed
        static, _ = spec_for(symbol)
        return static, False


async def load_contracts(
    client: BitgetClient, symbols: list[str] | None = None
) -> ContractBook:
    """Fetch contract specs, falling back per symbol when a row is unusable."""
    rows = await client.contracts()
    wanted = {s.upper() for s in symbols} if symbols else None
    specs: dict[str, ContractSpec] = {}
    for row in rows:
        symbol = str(row.get("symbol", "")).upper()
        if not symbol or (wanted is not None and symbol not in wanted):
            continue
        spec = spec_of(row)
        if spec is not None:
            specs[symbol] = spec
    missing = (wanted or set()) - set(specs)
    if missing:
        log.info("contract spec fell back to defaults for %s", sorted(missing))
    return ContractBook(specs=specs, assumed=set(missing))
