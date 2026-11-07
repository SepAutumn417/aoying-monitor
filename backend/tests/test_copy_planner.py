"""Shadow sizing + planner tests.

Three layers are checked: contract rounding (`sizing`), a single signal turned
into a planned order (`planner.plan_signal`), and the whole archive replayed
through the shadow book (`planner.replay`). The last one is the acceptance
criterion for I3b, so it reads the production SQLite file when present and
skips otherwise.

The sizing rule comes from the product owner: **mirror his actual leverage, not
his capital**. Our notional is `his 实际杠杆 × our USDT-FUTURES equity`, so a
small account takes smaller positions at the same liquidation distance instead
of a wilder one.
"""

from __future__ import annotations

import asyncio
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import func, select

from app.copy import contracts, ledger
from app.copy import planner as shadow
from app.copy.sizing import size_for
from app.copy_models import CopyIntent, CopyPosition, Position, PositionEvent, Signal
from app.db import SessionLocal
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage

REPO = Path(__file__).resolve().parents[2]
PROD_DB = REPO / "aoying.db"


def run(coro: Any) -> Any:
    return asyncio.run(coro)


# --------------------------------------------------------------------------- #
# contract rounding
# --------------------------------------------------------------------------- #


def test_floor_qty_never_rounds_up() -> None:
    spec = contracts.ContractSpec(size_multiplier=0.0001, min_trade_num=0.0001)
    assert spec.floor_qty(0.00014) == 0.0001
    assert spec.floor_qty(0.00019) == 0.0001
    assert spec.floor_qty(1.23456) == 1.2345
    assert spec.floor_qty(3.0) == 3.0


def test_floor_qty_returns_zero_below_one_step() -> None:
    spec = contracts.ContractSpec(size_multiplier=0.01, min_trade_num=0.01)
    assert spec.floor_qty(0.004) == 0.0


def test_known_contracts_are_measured_not_assumed() -> None:
    spec, measured = contracts.spec_for("BTCUSDT")
    assert measured is True
    assert spec.size_multiplier == 0.0001

    spec, measured = contracts.spec_for("NOTLISTEDUSDT")
    assert measured is False
    assert spec.size_multiplier == contracts.DEFAULT.size_multiplier


# --------------------------------------------------------------------------- #
# sizing
# --------------------------------------------------------------------------- #


def test_notional_is_actual_leverage_times_equity() -> None:
    sized = size_for(equity=1000.0, lev_actual=5.0, price=2500.0, symbol="ETHUSDT")
    assert sized is not None
    assert sized.target_notional == 5000.0
    # 5000 / 2500 = 2.0 ETH, already on the 0.01 grid
    assert sized.target_qty == 2.0


def test_size_is_floored_to_the_contract_step() -> None:
    sized = size_for(equity=1000.0, lev_actual=3.0, price=837.76, symbol="SNDKUSDT")
    assert sized is not None
    assert sized.target_notional == 3000.0
    raw = 3000.0 / 837.76
    assert sized.target_qty < raw
    assert sized.target_qty == contracts.spec_for("SNDKUSDT")[0].floor_qty(raw)


def test_small_equity_can_round_down_to_nothing() -> None:
    # 1 USDT of equity at 1x on a 75k coin is below one satoshi-step of BTC
    sized = size_for(equity=1.0, lev_actual=1.0, price=75000.0, symbol="BTCUSDT")
    assert sized is not None
    assert sized.target_qty == 0.0
    assert "below_min_trade_num" in sized.note


def test_size_without_a_price_is_none() -> None:
    assert size_for(equity=1000.0, lev_actual=5.0, price=0.0, symbol="BTCUSDT") is None


def test_close_sizes_to_zero_because_it_exits_everything() -> None:
    """A close is not re-priced: the order is simply "unwind what we hold"."""

    sized = size_for(
        equity=1000.0, lev_actual=2.5, price=84780.57, symbol="BTCUSDT", closing=True
    )
    assert sized is not None
    assert sized.target_notional == 0.0
    assert sized.target_qty == 0.0


# --------------------------------------------------------------------------- #
# planner
# --------------------------------------------------------------------------- #


async def _dialog(db: Any) -> tuple[TelegramAccount, TelegramDialog]:
    account = TelegramAccount(label="test", phone="1")
    db.add(account)
    await db.flush()
    dialog = TelegramDialog(account_id=account.id, chat_id=-100778, title="交易区")
    db.add(dialog)
    await db.commit()
    return account, dialog


async def _drop(db: Any, account: TelegramAccount, dialog: TelegramDialog) -> None:
    """Other suites resolve "the" account as the lowest id, so this must not linger."""

    # SQLite does not enforce ON DELETE CASCADE unless the pragma is on, so the
    # derived rows are cleared explicitly; the next replay then starts from zero.
    for model in (CopyIntent, CopyPosition, PositionEvent, Position, Signal):
        await db.execute(model.__table__.delete())
    await db.execute(
        TelegramMessage.__table__.delete().where(TelegramMessage.dialog_id == dialog.id)
    )
    await db.delete(dialog)
    await db.delete(account)
    await db.commit()


def test_open_signal_is_planned_but_not_sent() -> None:
    async def scenario() -> tuple[str, float, float, str]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            await ledger.ingest(
                db,
                dialog_id=dialog.id,
                message_id=9101,
                text=OPEN_TEXT,
                posted_at=datetime(2026, 9, 28, 3, 0, tzinfo=UTC),
            )
            await db.commit()
            signal = await db.scalar(select(Signal).where(Signal.message_id == 9101))
            assert signal is not None

            intent = await shadow.plan_signal(db, signal, equity=1000.0)
            await db.commit()
            book = await db.scalar(
                select(CopyPosition).where(CopyPosition.source_position_id.is_not(None))
            )
            result = (
                intent.status,
                intent.target_notional,
                intent.target_qty,
                book.status if book else "missing",
            )
            await _drop(db, account, dialog)
            return result

    # his 实际杠杆 is 2.50x on this message
    status, notional, qty, book_status = run(scenario())
    assert status == "shadow"
    assert notional == 2500.0
    assert qty > 0
    assert book_status == "open"


def test_close_signal_books_the_same_percentage_at_our_size() -> None:
    async def scenario() -> tuple[str, float, float]:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            for message_id, text, at in (
                (9201, OPEN_TEXT, datetime(2026, 9, 28, 3, 0, tzinfo=UTC)),
                (9202, CLOSE_TEXT, datetime(2026, 9, 29, 3, 0, tzinfo=UTC)),
            ):
                await ledger.ingest(
                    db, dialog_id=dialog.id, message_id=message_id, text=text, posted_at=at
                )
            await db.commit()

            stats = await shadow.replay(db, equity=1000.0)
            book = await db.scalar(select(CopyPosition))
            result = (
                book.status if book else "missing",
                book.realized if book else 0.0,
                book.notional if book else 0.0,
            )
            assert stats.intents == 2
            await _drop(db, account, dialog)
            return result[0], result[1], result[2]

    status, realized, notional = run(scenario())
    assert status == "closed"
    # his -9822.74 on 194334.01×... basis, scaled to our 2500 USDT notional
    assert realized < 0
    assert notional == 2500.0


def test_signal_without_an_open_book_is_skipped() -> None:
    async def scenario() -> str:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            # a reduce that arrives with no opening message in the archive
            await ledger.ingest(
                db,
                dialog_id=dialog.id,
                message_id=9301,
                text=REDUCE_TEXT,
                posted_at=datetime(2026, 10, 3, 22, 12, tzinfo=UTC),
            )
            await db.commit()
            signal = await db.scalar(select(Signal).where(Signal.message_id == 9301))
            assert signal is not None
            intent = await shadow.plan_signal(db, signal, equity=1000.0)
            await db.commit()
            note = intent.note
            await _drop(db, account, dialog)
            return note

    assert "no_open_position" in run(scenario())


def test_shadow_book_never_holds_two_rows_for_one_position() -> None:
    async def scenario() -> int:
        async with SessionLocal() as db:
            account, dialog = await _dialog(db)
            await ledger.ingest(
                db,
                dialog_id=dialog.id,
                message_id=9401,
                text=OPEN_TEXT,
                posted_at=datetime(2026, 9, 28, 3, 0, tzinfo=UTC),
            )
            await db.commit()
            await shadow.replay(db, equity=1000.0)
            await shadow.replay(db, equity=1000.0)
            count = await db.scalar(select(func.count(CopyPosition.id)))
            await _drop(db, account, dialog)
            return int(count or 0)

    assert run(scenario()) == 1


# --------------------------------------------------------------------------- #
# acceptance: the real archive
# --------------------------------------------------------------------------- #


@pytest.mark.skipif(not PROD_DB.exists(), reason="需要生产库 aoying.db 才能重放真实历史")
def test_shadow_replay_of_the_real_archive() -> None:
    """Acceptance for I3b: 100 signals → 100 intents, 4 orphan skips, 17 books."""

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
            # rowids get reused after a delete, so a previous scenario's messages
            # may still sit on this dialog_id; clear before seeding the archive
            await db.execute(
                TelegramMessage.__table__.delete().where(
                    TelegramMessage.dialog_id == dialog.id
                )
            )
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

            await ledger.rebuild_from_messages(db)
            await db.commit()
            stats = await shadow.replay(db, equity=1000.0)
            books = await db.scalar(select(func.count(CopyPosition.id)))
            result = (stats.intents, stats.skipped, int(books or 0), stats.realized)
            await _drop(db, account, dialog)
            return result

    intents, skipped, books, realized = run(scenario())
    assert intents == 100
    assert skipped == 4
    assert books == 17
    assert realized == 8866.08


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
更新时间：2026-09-28 03:00:34 UTC+8"""

CLOSE_TEXT = """熬鹰交易信号

📉 注意，平仓
币种：BTCUSDT 永续 | 全仓 | 5x
方向：做空 🟥
平仓数量：11.46 BTC
开仓均价：84768.06 USDT
当前价格：85625.00 USDT
标记价格：85625.00 USDT
保证金：0.00 USDT (全仓)
实际杠杆：0.00x
强平价格：0.00 USDT
浮动收益：0.00 USDT (0.00%)
已实现盈亏：-9822.74 USDT (-1.01%)
更新时间：2026-09-29 03:00:00 UTC+8"""

REDUCE_TEXT = """熬鹰交易信号

📉 注意，减仓
币种：ZECUSDT 永续 | 全仓 | 3x
方向：做多 🟩
原仓位：3059.78 ZEC
现仓位：2264.24 ZEC
开仓均价：1368.00 USDT
当前价格：1293.00 USDT
标记价格：1293.00 USDT
保证金：585350.00 USDT (全仓)
实际杠杆：5.12x
强平价格：1069.00 USDT
浮动收益：-188813.00 USDT (-22.20%)
已实现盈亏：-62851.70 USDT (-6.50%)
更新时间：2026-10-03 22:12:00 UTC+8"""
