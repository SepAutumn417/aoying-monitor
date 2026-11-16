"""Turn a parsed signal into the event a phone or a browser can alert on.

Two decisions live here.

**The action is in the event kind**, not only in the payload: `signal.open`,
`signal.add`, `signal.reduce`, `signal.close`, `signal.leverage`. A client picks
a sound from the kind alone, without parsing numbers, and a subscription that
only cares about exits can filter on it.

**The numbers are copied, never recomputed.** `realized` is the bot's cumulative
figure for the position (see `app.copy_models`), and `qty_after` is authoritative
over anything a client could derive from earlier events it may have missed. A
notification that quietly recomputed either would be wrong exactly when the
client had a gap in its stream.
"""

from __future__ import annotations

from typing import Any

from app.copy.parser import parse_signal
from app.copy_models import Position, Signal
from app.telegram_models import TelegramMessage

SIGNAL_EVENT_PREFIX = "signal."
ACTIONS = ("open", "add", "reduce", "close", "leverage")

ACTION_LABEL = {
    "open": "新开仓",
    "add": "加仓",
    "reduce": "减仓",
    "close": "平仓",
    "leverage": "调杠杆",
}
SIDE_LABEL = {"long": "多", "short": "空"}


def event_kind(action: str) -> str:
    """`signal.open` for an open, and so on."""

    return f"{SIGNAL_EVENT_PREFIX}{action}"


def is_signal_event(kind: str) -> bool:
    return kind.startswith(SIGNAL_EVENT_PREFIX)


def headline(
    action: str,
    symbol: str,
    side: str,
    *,
    leverage: float | None = None,
    leverage_to: float | None = None,
) -> str:
    """One line, the way the bot would say it."""

    label = ACTION_LABEL.get(action, action)
    side_text = SIDE_LABEL.get(side, side)
    if action == "leverage":
        lev = leverage_to if leverage_to is not None else leverage
        if lev is None:
            return f"{label} {symbol}"
        return f"{label} {symbol} → {_num(lev)}x"
    suffix = f" {_num(leverage)}x" if leverage is not None else ""
    return f"{label} {side_text} {symbol}{suffix}".strip()


def _num(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "-"
    text = f"{value:,.{digits}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def summary(signal: Signal) -> str:
    """The second line: price, size, and money, whichever the bot printed."""

    parts: list[str] = []
    if signal.entry is not None:
        parts.append(f"开仓价 {_num(signal.entry, 4)}")
    if signal.mark is not None:
        parts.append(f"标记价 {_num(signal.mark, 4)}")
    if signal.qty_after is not None:
        parts.append(f"剩余 {_num(signal.qty_after, 4)}")
    elif signal.qty is not None:
        parts.append(f"数量 {_num(signal.qty, 4)}")
    if signal.realized is not None:
        parts.append(f"已实现 {_num(signal.realized)}")
    if signal.floating is not None:
        parts.append(f"浮盈亏 {_num(signal.floating)}")
    return " · ".join(parts)


TEST_SYMBOL = "TESTUSDT"


def test_signal_payload(action: str) -> dict[str, Any]:
    """A fake signal shaped exactly like a real one, so clients render it identically.

    Three things keep it honest. The symbol is one no exchange lists. The headline
    carries a 测试 prefix, so a notification cannot be mistaken for a live trade.
    And `test` stays true, which both clients use to badge the row and to keep it
    out of the unread count -- a rehearsal must not leave a number behind.
    """

    if action not in ACTIONS:
        raise ValueError(f"unknown action: {action}")

    leverage = 10.0 if action == "leverage" else 5.0
    headline_text = headline(
        action,
        TEST_SYMBOL,
        "long",
        leverage=None if action == "leverage" else leverage,
        leverage_to=leverage if action == "leverage" else None,
    )
    return {
        "signal_id": None,
        "message_id": None,
        "action": action,
        "action_label": ACTION_LABEL[action],
        "action_text": "",
        "symbol": TEST_SYMBOL,
        "side": "long",
        "side_label": SIDE_LABEL["long"],
        "leverage": None if action == "leverage" else leverage,
        "leverage_from": 5.0 if action == "leverage" else None,
        "leverage_to": leverage if action == "leverage" else None,
        "leverage_actual": None,
        "qty": None,
        "qty_before": None,
        "qty_after": None,
        "entry": None,
        "mark": None,
        "margin": None,
        "liq": None,
        "floating": None,
        "realized": None,
        "posted_at": None,
        "position_id": None,
        "position_status": None,
        "position_qty": None,
        "dialog": "",
        "text": "",
        "headline": f"测试 · {headline_text}",
        "summary": "这是测试信号，不是真实成交。",
        "test": True,
    }


def signal_payload(
    signal: Signal,
    *,
    position: Position | None = None,
    dialog: str = "",
    text: str = "",
    test: bool = False,
) -> dict[str, Any]:
    """Everything a client needs to render and to speak the alert."""

    return {
        "signal_id": signal.id,
        "message_id": signal.message_id,
        "action": signal.kind,
        "action_label": ACTION_LABEL.get(signal.kind, signal.kind),
        "action_text": signal.action or "",
        "symbol": signal.symbol,
        "side": signal.side,
        "side_label": SIDE_LABEL.get(signal.side, signal.side),
        "leverage": signal.lev_target,
        "leverage_from": signal.lev_from,
        "leverage_to": signal.lev_to,
        "leverage_actual": signal.lev_actual,
        "qty": signal.qty,
        "qty_before": signal.qty_before,
        "qty_after": signal.qty_after,
        "entry": signal.entry,
        "mark": signal.mark,
        "margin": signal.margin,
        "liq": signal.liq,
        "floating": signal.floating,
        "realized": signal.realized,
        "posted_at": signal.posted_at.isoformat() if signal.posted_at else None,
        "position_id": position.id if position is not None else None,
        "position_status": position.status if position is not None else None,
        "position_qty": position.qty_current if position is not None else None,
        "dialog": dialog,
        "text": (text or "")[:400],
        "headline": headline(
            signal.kind,
            signal.symbol,
            signal.side,
            leverage=signal.lev_target,
            leverage_to=signal.lev_to,
        ),
        "summary": summary(signal),
        "test": test,
    }


def source_message_alert(
    message: TelegramMessage, dialog: str = ""
) -> tuple[str, dict[str, Any]] | None:
    """Format an alert from one original message, without persisting a ledger.

    The transient object only adapts the existing client notification protocol.
    Its signal/position IDs are null; all numbers come from the source text.
    """
    parsed = parse_signal(message.text or "")
    if parsed is None:
        return None
    signal = Signal(
        id=None,
        dialog_id=message.dialog_id,
        message_id=message.message_id,
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
        posted_at=message.posted_at,
    )
    return event_kind(parsed.kind), signal_payload(signal, dialog=dialog, text=message.text or "")
