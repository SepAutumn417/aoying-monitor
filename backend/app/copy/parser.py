"""Signal layer: deterministic parsing of the copy-trade bot's messages.

Everything that can move money downstream starts from text a human wrote into
Telegram, so the parser is deliberately boring: no LLM, no heuristics that
guess, no network. It either reads the fields the bot prints, or it returns
`None` and the message is archived without becoming a signal.

Two shapes exist:

*   ``熬鹰交易信号`` — one action (open / add / reduce / close / leverage).
*   ``熬鹰当前全部持仓`` — a full snapshot, used for reconciliation only and
    never to open or close a position.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

SIGNAL_HEADER = "熬鹰交易信号"
SNAPSHOT_HEADER = "熬鹰当前全部持仓"

#: The bot prints Beijing time; the rest of the backend stores UTC.
BEIJING = timedelta(hours=8)

_NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
_ACTION = re.compile(r"注意[，,]\s*(.+)")
_LEVERAGE_MOVE = re.compile(r"(\d+(?:\.\d+)?)x\s*->\s*(\d+(?:\.\d+)?)x")

KIND_OPEN = "open"
KIND_ADD = "add"
KIND_REDUCE = "reduce"
KIND_CLOSE = "close"
KIND_LEVERAGE = "leverage"

_ACTION_PREFIXES = (
    ("新开仓", KIND_OPEN),
    ("加仓", KIND_ADD),
    ("减仓", KIND_REDUCE),
    ("平仓", KIND_CLOSE),
    ("持仓更新", KIND_LEVERAGE),
)


@dataclass(frozen=True)
class ParsedSignal:
    """One bot action, already in canonical form."""

    kind: str
    symbol: str
    side: str  # "long" | "short"
    action: str  # the raw wording, kept for the audit trail
    leverage: float | None = None
    leverage_from: float | None = None
    leverage_to: float | None = None
    qty: float | None = None
    qty_before: float | None = None
    qty_after: float | None = None
    entry: float | None = None
    mark: float | None = None
    margin: float | None = None
    lev_actual: float | None = None
    liq: float | None = None
    floating: float | None = None
    realized: float | None = None
    reported_at: datetime | None = None


@dataclass(frozen=True)
class SnapshotHolding:
    symbol: str
    side: str
    qty: float | None
    entry: float | None
    mark: float | None
    margin: float | None
    lev_actual: float | None
    liq: float | None
    floating: float | None
    realized: float | None
    leverage: float | None


@dataclass(frozen=True)
class ParsedSnapshot:
    count: int
    holdings: list[SnapshotHolding] = field(default_factory=list)
    total_margin: float | None = None
    total_floating: float | None = None
    total_realized: float | None = None
    reported_at: datetime | None = None


def _fields(text: str) -> dict[str, str]:
    """Split ``标签：值`` lines into a dict.

    The bot writes the action on its own line and then one field per line, so a
    plain ``split("：")`` is enough — values never contain a full-width colon.
    """

    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or "：" not in line:
            continue
        label, _, value = line.partition("：")
        # snapshots number their holdings ("1. 币种：..."), strip that prefix
        label = label.split(".")[-1].strip()
        out.setdefault(label, value.strip())
    return out


def _num(fields: dict[str, str], label: str) -> float | None:
    raw = fields.get(label)
    if not raw:
        return None
    match = _NUM.search(raw)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:  # pragma: no cover - regex already guarantees a number
        return None


def _symbol_and_leverage(fields: dict[str, str]) -> tuple[str, float | None]:
    raw = fields.get("币种", "")
    parts = [p.strip() for p in raw.split("|")]
    symbol = parts[0].split()[0] if parts and parts[0] else ""
    leverage = None
    if len(parts) >= 3:
        match = re.search(r"(\d+(?:\.\d+)?)x", parts[-1])
        if match:
            leverage = float(match.group(1))
    return symbol, leverage


def _side(fields: dict[str, str]) -> str:
    raw = fields.get("方向", "")
    if "空" in raw:
        return "short"
    if "多" in raw:
        return "long"
    return ""


def _reported_at(fields: dict[str, str]) -> datetime | None:
    raw = fields.get("更新时间", "")
    match = re.search(r"(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})", raw)
    if not match:
        return None
    stamp = datetime.fromisoformat(f"{match.group(1)}T{match.group(2)}")
    return (stamp - BEIJING).replace(tzinfo=UTC)


def _action_kind(action: str) -> str:
    for prefix, kind in _ACTION_PREFIXES:
        if action.startswith(prefix):
            return kind
    return ""


def parse_signal(text: str) -> ParsedSignal | None:
    """Return the action encoded in `text`, or `None` if it is not a signal."""

    if SIGNAL_HEADER not in text:
        return None
    match = _ACTION.search(text)
    if not match:
        return None
    action = match.group(1).strip()
    kind = _action_kind(action)
    if not kind:
        return None

    fields = _fields(text)
    symbol, leverage = _symbol_and_leverage(fields)
    side = _side(fields)
    if not symbol or not side:
        return None

    move = _LEVERAGE_MOVE.search(action)
    lev_from = float(move.group(1)) if move else None
    lev_to = float(move.group(2)) if move else None

    qty_before = _num(fields, "原仓位")
    qty_after = _num(fields, "现仓位")
    qty = None
    if kind == KIND_OPEN:
        qty = _num(fields, "持仓量")
        qty_after = qty
    elif kind == KIND_CLOSE:
        qty = _num(fields, "平仓数量")
        qty_before = qty
        qty_after = 0.0

    return ParsedSignal(
        kind=kind,
        symbol=symbol,
        side=side,
        action=action,
        leverage=lev_to or leverage,
        leverage_from=lev_from,
        leverage_to=lev_to,
        qty=qty,
        qty_before=qty_before,
        qty_after=qty_after,
        entry=_num(fields, "开仓均价"),
        mark=_num(fields, "标记价格"),
        margin=_num(fields, "保证金"),
        lev_actual=_num(fields, "实际杠杆"),
        liq=_num(fields, "强平价格"),
        floating=_num(fields, "浮动收益"),
        realized=_num(fields, "已实现盈亏"),
        reported_at=_reported_at(fields),
    )


def _snapshot_blocks(text: str) -> list[str]:
    """Split the numbered holdings apart; the totals live after the last one."""

    blocks: list[str] = []
    current: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^\d+\.\s", stripped):
            if current:
                blocks.append("\n".join(current))
            current = [stripped]
        elif stripped.startswith("总") or stripped.startswith("更新时间"):
            if current:
                blocks.append("\n".join(current))
                current = []
            break
        elif current:
            current.append(stripped)
    if current:
        blocks.append("\n".join(current))
    return blocks


def parse_snapshot(text: str) -> ParsedSnapshot | None:
    """Return the full position snapshot, used to reconcile the ledger."""

    if SNAPSHOT_HEADER not in text:
        return None
    fields = _fields(text)
    count = _num(fields, "持仓数量")
    holdings: list[SnapshotHolding] = []
    for block in _snapshot_blocks(text):
        part = _fields(block)
        symbol, leverage = _symbol_and_leverage(part)
        side = _side(part)
        if not symbol or not side:
            continue
        holdings.append(
            SnapshotHolding(
                symbol=symbol,
                side=side,
                qty=_num(part, "持仓量"),
                entry=_num(part, "开仓均价"),
                mark=_num(part, "标记价格"),
                margin=_num(part, "保证金"),
                lev_actual=_num(part, "实际杠杆"),
                liq=_num(part, "强平价格"),
                floating=_num(part, "浮动收益"),
                realized=_num(part, "已实现盈亏"),
                leverage=leverage,
            )
        )
    return ParsedSnapshot(
        count=int(count) if count is not None else len(holdings),
        holdings=holdings,
        total_margin=_num(fields, "总保证金"),
        total_floating=_num(fields, "总浮动收益"),
        total_realized=_num(fields, "总已实现盈亏"),
        reported_at=_reported_at(fields),
    )


def parse(text: str) -> ParsedSignal | ParsedSnapshot | None:
    """Parse either shape; ``None`` means "not ours, archive and move on"."""

    if SIGNAL_HEADER in text:
        return parse_signal(text)
    if SNAPSHOT_HEADER in text:
        return parse_snapshot(text)
    return None
