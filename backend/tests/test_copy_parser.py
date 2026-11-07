"""Signal parser + ledger tests.

Two layers are checked: the parser against the exact wording the bot uses, and
the ledger against the whole real archive (200 messages → 17 positions → 96
events). The second one is the acceptance criterion for I3a, so it reads the
production SQLite file when it is present and skips otherwise.
"""

from __future__ import annotations

import asyncio
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.copy import ledger
from app.copy import parser as sig_parser
from app.copy_models import Position, PositionEvent, Signal
from app.db import SessionLocal
from app.main import app
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage

REPO = Path(__file__).resolve().parents[2]
PROD_DB = REPO / "aoying.db"

OPEN_TEXT = """熬鹰交易信号

📈 注意，新开仓
币种：BTCUSDT 永续 | 全仓 | 5x
方向：做空 🟥
持仓量：11.46 BTC
开仓均价：84768.06 USDT
当前价格：84780.57 USDT
标记价格：84780.57 USDT
保证金：194334.01 USDT (全仓)
实际杠杆：2.50x
强平价格：118053.71 USDT
浮动收益：-143.30 USDT (-0.07%)
已实现盈亏：0.00 USDT
更新时间：2026-09-28 03:00:34 UTC+8
"""

REDUCE_TEXT = """熬鹰交易信号

📈 注意，减仓
币种：ZECUSDT 永续 | 全仓 | 3x
方向：做多 🟩
原仓位：597.44 ZEC
现仓位：448.08 ZEC
开仓均价：1563.54 USDT
当前价格：1556.54 USDT
标记价格：1556.54 USDT
保证金：232484.81 USDT (全仓)
实际杠杆：1.76x
强平价格：682.91 USDT
浮动收益：-3134.89 USDT (-1.35%)
已实现盈亏：561.22 USDT
更新时间：2026-09-25 22:44:41 UTC+8
"""

LEVERAGE_TEXT = """熬鹰交易信号

📈 注意，持仓更新（杠杆 5x -> 10x）
币种：BTCUSDT 永续 | 全仓 | 10x
方向：做空 🟥
原仓位：22.21 BTC
现仓位：22.21 BTC
开仓均价：84722.06 USDT
当前价格：84725.47 USDT
标记价格：84725.47 USDT
保证金：188141.38 USDT (全仓)
实际杠杆：4.84x
强平价格：101626.74 USDT
浮动收益：-75.62 USDT (-0.04%)
已实现盈亏：0.00 USDT
更新时间：2026-09-28 03:53:30 UTC+8
"""

CLOSE_TEXT = """熬鹰交易信号

📈 注意，平仓
币种：ZECUSDT 永续 | 全仓 | 3x
方向：做多 🟩
平仓数量：336.06 ZEC
开仓均价：1563.54 USDT
当前价格：1534.10 USDT
标记价格：1534.10 USDT
保证金：171849.82 USDT (全仓)
实际杠杆：1.32x
强平价格：377.81 USDT
已实现盈亏：-9822.74 USDT (-5.72%)
更新时间：2026-09-26 01:30:24 UTC+8
"""

CLOSE_BTC_TEXT = """熬鹰交易信号

📈 注意，平仓
币种：BTCUSDT 永续 | 全仓 | 5x
方向：做空 🟥
平仓数量：11.46 BTC
开仓均价：84768.06 USDT
当前价格：85620.30 USDT
标记价格：85620.30 USDT
保证金：194334.01 USDT (全仓)
实际杠杆：2.50x
强平价格：118053.71 USDT
已实现盈亏：-9822.74 USDT (-5.72%)
更新时间：2026-09-29 03:30:24 UTC+8
"""

SNAPSHOT_TEXT = """熬鹰当前全部持仓

持仓数量：1

1. 币种：ZECUSDT 永续 | 全仓 | 3x
方向：做多 🟩
持仓量：597.44 ZEC
开仓均价：1563.54 USDT
当前价格：1569.08 USDT
标记价格：1569.08 USDT
保证金：312477.88 USDT (全仓)
实际杠杆：2.33x
强平价格：911.90 USDT
浮动收益：3314.54 USDT (1.06%)
已实现盈亏：0.00 USDT

总保证金：312477.88 USDT
总浮动收益：3314.54 USDT
总已实现盈亏：0.00 USDT
更新时间：2026-09-25 22:43:35 UTC+8
"""

EMPTY_SNAPSHOT = """熬鹰当前全部持仓

持仓数量：0

当前无持仓

总保证金：0.00 USDT
总浮动收益：0.00 USDT
总已实现盈亏：0.00 USDT
更新时间：2026-11-06 12:50:50 UTC+8
"""

CHATTER = "今天这个行情，梭哈三次对一次就好了"


def run(coro: Any) -> Any:
    return asyncio.run(coro)


# --------------------------------------------------------------------------- #
# parser
# --------------------------------------------------------------------------- #


def test_parse_open_reads_every_field() -> None:
    parsed = sig_parser.parse_signal(OPEN_TEXT)
    assert parsed is not None
    assert parsed.kind == "open"
    assert parsed.symbol == "BTCUSDT"
    assert parsed.side == "short"
    assert parsed.leverage == 5.0
    assert parsed.qty == 11.46
    assert parsed.entry == 84768.06
    assert parsed.mark == 84780.57
    assert parsed.margin == 194334.01
    assert parsed.lev_actual == 2.50
    assert parsed.liq == 118053.71
    assert parsed.floating == -143.30
    assert parsed.realized == 0.0
    # 2026-09-28 03:00:34 +08:00 == 2026-09-27 19:00:34 UTC
    assert parsed.reported_at == datetime(2026, 9, 27, 19, 0, 34, tzinfo=UTC)


def test_parse_reduce_keeps_the_cumulative_realized() -> None:
    """已实现盈亏 is the position's running total, so it must not be summed."""

    parsed = sig_parser.parse_signal(REDUCE_TEXT)
    assert parsed is not None
    assert parsed.kind == "reduce"
    assert parsed.qty_before == 597.44
    assert parsed.qty_after == 448.08
    assert parsed.realized == 561.22


def test_parse_leverage_move_reads_both_sides() -> None:
    parsed = sig_parser.parse_signal(LEVERAGE_TEXT)
    assert parsed is not None
    assert parsed.kind == "leverage"
    assert parsed.leverage_from == 5.0
    assert parsed.leverage_to == 10.0
    assert parsed.leverage == 10.0
    # a leverage change moves no contracts
    assert parsed.qty_before == parsed.qty_after == 22.21


def test_parse_close_reads_the_closed_quantity() -> None:
    parsed = sig_parser.parse_signal(CLOSE_TEXT)
    assert parsed is not None
    assert parsed.kind == "close"
    assert parsed.qty == 336.06
    assert parsed.qty_after == 0.0
    assert parsed.realized == -9822.74


def test_parse_snapshot_reads_holdings_and_totals() -> None:
    parsed = sig_parser.parse_snapshot(SNAPSHOT_TEXT)
    assert parsed is not None
    assert parsed.count == 1
    assert len(parsed.holdings) == 1
    holding = parsed.holdings[0]
    assert holding.symbol == "ZECUSDT"
    assert holding.side == "long"
    assert holding.qty == 597.44
    assert holding.leverage == 3.0
    assert parsed.total_margin == 312477.88
    assert parsed.total_floating == 3314.54


def test_parse_snapshot_with_no_positions() -> None:
    parsed = sig_parser.parse_snapshot(EMPTY_SNAPSHOT)
    assert parsed is not None
    assert parsed.count == 0
    assert parsed.holdings == []
    assert parsed.total_realized == 0.0


def test_plain_chatter_is_not_a_signal() -> None:
    assert sig_parser.parse(CHATTER) is None


# --------------------------------------------------------------------------- #
# ledger
# --------------------------------------------------------------------------- #


async def _dialog(db: Any) -> tuple[TelegramAccount, TelegramDialog]:
    account = TelegramAccount(label="test", phone="1")
    db.add(account)
    await db.flush()
    dialog = TelegramDialog(account_id=account.id, chat_id=-100777, title="交易区")
    db.add(dialog)
    await db.commit()
    return account, dialog


async def _drop(db: Any, account: TelegramAccount, dialog: TelegramDialog) -> None:
    """Other suites resolve "the" account as the lowest id, so this must not linger."""

    await db.delete(dialog)
    await db.delete(account)
    await db.commit()


def test_ledger_opens_and_closes_one_position() -> None:
    async def scenario() -> tuple[int, float]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            at = datetime(2026, 9, 28, 3, 0, tzinfo=UTC)
            opened = await ledger.ingest(
                db, dialog_id=dialog.id, message_id=9001, text=OPEN_TEXT, posted_at=at
            )
            assert opened is not None
            await ledger.ingest(
                db,
                dialog_id=dialog.id,
                message_id=9002,
                text=CLOSE_BTC_TEXT,
                posted_at=datetime(2026, 9, 29, 3, 0, tzinfo=UTC),
            )
            await db.commit()
            position = await db.scalar(
                select(Position).where(Position.open_signal_id == opened.id)
            )
            assert position is not None
            events = await db.scalar(
                select(func.count(PositionEvent.id)).where(
                    PositionEvent.position_id == position.id
                )
            )
            realized = position.realized
            await _drop(db, account, dialog)
            return int(events or 0), realized

    events, realized = run(scenario())
    assert events == 2
    assert realized == -9822.74


def test_ledger_is_idempotent_per_message() -> None:
    async def scenario() -> tuple[int, int]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            first = await ledger.ingest(
                db, dialog_id=dialog.id, message_id=9101, text=OPEN_TEXT
            )
            assert first is not None
            for _ in range(2):
                again = await ledger.ingest(
                    db, dialog_id=dialog.id, message_id=9101, text=OPEN_TEXT
                )
                assert again is not None and again.id == first.id
            await db.commit()
            signals = await db.scalar(
                select(func.count(Signal.id)).where(Signal.message_id == 9101)
            )
            positions = await db.scalar(
                select(func.count(Position.id)).where(Position.open_signal_id == first.id)
            )
            await _drop(db, account, dialog)
            return int(signals or 0), int(positions or 0)

    signals, positions = run(scenario())
    assert signals == 1
    assert positions == 1


def test_orphan_signal_is_stored_but_creates_no_event() -> None:
    """A reduce whose 新开仓 predates the archive must not invent a position."""

    async def scenario() -> tuple[int, int]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            before = await db.scalar(select(func.count(PositionEvent.id)))
            await ledger.ingest(db, dialog_id=dialog.id, message_id=9201, text=REDUCE_TEXT)
            await db.commit()
            signal = await db.scalar(select(Signal).where(Signal.message_id == 9201))
            after = await db.scalar(select(func.count(PositionEvent.id)))
            assert signal is not None
            assert signal.kind == "reduce"
            await _drop(db, account, dialog)
            return int(before or 0), int(after or 0)

    before, after = run(scenario())
    assert before == after


@pytest.mark.skipif(not PROD_DB.exists(), reason="需要生产库 aoying.db 才能重放真实历史")
def test_rebuild_replays_the_real_archive() -> None:
    """Acceptance for I3a: the 200 archived messages must reproduce the history."""

    con = sqlite3.connect(f"file:{PROD_DB}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "select message_id, text, posted_at from telegram_messages "
            "where topic_id = 926111 and text <> '' order by posted_at, message_id"
        ).fetchall()
    finally:
        con.close()
    assert len(rows) == 200

    async def scenario() -> tuple[int, int, int, float]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            for message_id, text, posted in rows:
                stamp = datetime.fromisoformat(posted)
                if stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=UTC)
                db.add(
                    TelegramMessage(
                        dialog_id=dialog.id,
                        chat_id=dialog.chat_id,
                        message_id=message_id,
                        topic_id=926111,
                        text=text,
                        posted_at=stamp,
                    )
                )
            await db.commit()

            stats = await ledger.rebuild_from_messages(db)
            await db.commit()
            closed = await db.scalar(
                select(func.sum(Position.realized)).where(Position.status == "closed")
            )
            result = (stats.signals, stats.positions, stats.events, float(closed or 0.0))
            await _drop(db, account, dialog)
            return result

    signals, positions, events, realized = run(scenario())
    assert signals == 100
    assert positions == 17
    assert events == 96
    assert round(realized, 2) == 800776.04


# --------------------------------------------------------------------------- #
# api
# --------------------------------------------------------------------------- #


def test_signal_endpoints_require_auth() -> None:
    with TestClient(app) as client:
        assert client.get("/api/signals").status_code == 401
        assert client.get("/api/positions").status_code == 401
        assert client.get("/api/copy/status").status_code == 401
