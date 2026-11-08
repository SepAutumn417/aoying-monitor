"""Signal push tests.

The chain under test is the one a phone actually depends on:

    bot text → ledger → `signal.*` event → websocket frame

Everything here uses the real collector, the real ledger and the real event
log. Only Telegram itself is faked.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import select

from app.copy import ledger as copy_ledger
from app.copy import notify
from app.copy_models import Position, Signal
from app.db import SessionLocal
from app.models import Event
from app.telegram_collector import TelegramCollector
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage

CHAT_ID = -1001234567890

#: Fixtures are verbatim copies of what the bot actually posts (emoji included).
#: The parser is a pure function of this text, so a fixture that only resembles
#: the real thing would let a format change through unnoticed.
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

ADD_TEXT = """熬鹰交易信号

📈 注意，加仓
币种：BTCUSDT 永续 | 全仓 | 5x
方向：做空 🟥
原仓位：11.46 BTC
现仓位：22.21 BTC
开仓均价：84722.06 USDT
当前价格：84652.63 USDT
标记价格：84652.63 USDT
保证金：375959.27 USDT (全仓)
实际杠杆：4.82x
强平价格：101626.74 USDT
浮动收益：1541.82 USDT (0.41%)
已实现盈亏：0.00 USDT
更新时间：2026-09-28 03:30:44 UTC+8"""

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
更新时间：2026-09-25 22:44:41 UTC+8"""

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
更新时间：2026-09-26 01:30:24 UTC+8"""

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
更新时间：2026-09-28 03:53:30 UTC+8"""

CHATTER = "今天大盘还行，别追高。"


class FakeSender:
    def __init__(self, first: str = "", last: str = "", username: str = "") -> None:
        self.first_name = first
        self.last_name = last
        self.username = username


class FakeMessage:
    def __init__(
        self,
        message_id: int,
        text: str = "",
        chat_id: int = CHAT_ID,
        edited_at: datetime | None = None,
    ) -> None:
        self.id = message_id
        self.message = text
        self.chat_id = chat_id
        self.media = None
        self.date = datetime(2026, 11, 5, 8, 0, tzinfo=UTC)
        self.edit_date = edited_at
        self.reply_to_msg_id = None
        self.sender_id = 8797733775
        self.sender = FakeSender(first="熬鹰", last="带单", username="aoying_bot")


def run(coro: Any) -> Any:
    return asyncio.run(coro)


async def _seed() -> tuple[TelegramAccount, TelegramDialog]:
    async with SessionLocal() as db:
        account = TelegramAccount(
            label="推送测试号", phone="+8613800000001", session_path="./tmp/push.session"
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)
        dialog = TelegramDialog(
            account_id=account.id,
            chat_id=CHAT_ID,
            title="熬鹰｜交易信号",
            kind="group",
            enabled=True,
        )
        db.add(dialog)
        await db.commit()
        await db.refresh(dialog)
        return account, dialog


async def _cleanup(account: TelegramAccount, dialog: TelegramDialog) -> None:
    from app.copy_models import CopyIntent, CopyPosition, PositionEvent

    async with SessionLocal() as db:
        for model in (CopyIntent, CopyPosition, PositionEvent, Position, Signal):
            await db.execute(model.__table__.delete())
        await db.execute(
            TelegramMessage.__table__.delete().where(TelegramMessage.dialog_id == dialog.id)
        )
        await db.execute(Event.__table__.delete())
        await db.execute(
            TelegramDialog.__table__.delete().where(TelegramDialog.id == dialog.id)
        )
        await db.execute(
            TelegramAccount.__table__.delete().where(TelegramAccount.id == account.id)
        )
        await db.commit()


def _collector() -> TelegramCollector:
    return TelegramCollector(client_factory=lambda: None, download_media=False)


def test_open_signal_pushes_a_signal_event() -> None:
    """The bot's 新开仓 must reach clients as `signal.open`, not just as text."""

    async def scenario() -> dict[str, Any]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5001, OPEN_TEXT), CHAT_ID, edited=False)
            async with SessionLocal() as db:
                rows = list(await db.scalars(select(Event).order_by(Event.id)))
            payloads = [
                (row.kind, __import__("json").loads(row.payload))
                for row in rows
                if row.kind.startswith("signal.")
            ]
            return {"kinds": [row.kind for row in rows], "signals": payloads}
        finally:
            await _cleanup(account, dialog)

    result = run(scenario())
    assert "telegram.message" in result["kinds"]
    assert "signal.open" in result["kinds"]
    assert len(result["signals"]) == 1

    kind, payload = result["signals"][0]
    assert kind == "signal.open"
    assert payload["symbol"] == "BTCUSDT"
    assert payload["side"] == "short"
    assert payload["side_label"] == "空"
    assert payload["action"] == "open"
    assert payload["action_label"] == "新开仓"
    assert payload["leverage"] == 5.0
    assert payload["leverage_actual"] == 2.5
    assert payload["entry"] == 84768.06
    assert payload["qty"] == 11.46
    assert payload["liq"] == 118053.71
    assert payload["position_status"] == "open"
    assert payload["headline"] == "新开仓 空 BTCUSDT 5x"


def test_each_action_pushes_its_own_kind() -> None:
    """Different actions must be distinguishable from the kind alone."""

    async def scenario() -> list[str]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            for index, text in enumerate(
                (OPEN_TEXT, ADD_TEXT, REDUCE_TEXT, CLOSE_TEXT), start=1
            ):
                await collector.ingest_message(
                    FakeMessage(5100 + index, text), CHAT_ID, edited=False
                )
            async with SessionLocal() as db:
                rows = list(await db.scalars(select(Event).order_by(Event.id)))
            return [row.kind for row in rows if row.kind.startswith("signal.")]
        finally:
            await _cleanup(account, dialog)

    kinds = run(scenario())
    assert kinds == ["signal.open", "signal.add", "signal.reduce", "signal.close"]


def test_leverage_change_pushes_signal_leverage() -> None:
    """A leverage-only move is still news: it changes liquidation distance."""

    async def scenario() -> dict[str, Any]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5200, LEVERAGE_TEXT), CHAT_ID, edited=False)
            async with SessionLocal() as db:
                rows = list(await db.scalars(select(Event).order_by(Event.id)))
            signals = [row for row in rows if row.kind.startswith("signal.")]
            assert len(signals) == 1
            return {
                "kind": signals[0].kind,
                "payload": __import__("json").loads(signals[0].payload),
            }
        finally:
            await _cleanup(account, dialog)

    result = run(scenario())
    # No open position exists for this symbol, so the signal is stored as an
    # orphan but still pushed: the phone should know the bot touched the pair.
    assert result["kind"] == "signal.leverage"
    assert result["payload"]["leverage_from"] == 5.0
    assert result["payload"]["leverage_to"] == 10.0
    assert result["payload"]["headline"] == "调杠杆 BTCUSDT → 10x"


def test_chatter_pushes_no_signal_event() -> None:
    """Ordinary group talk must not ring a phone."""

    async def scenario() -> list[str]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5300, CHATTER), CHAT_ID, edited=False)
            async with SessionLocal() as db:
                rows = list(await db.scalars(select(Event).order_by(Event.id)))
            return [row.kind for row in rows]
        finally:
            await _cleanup(account, dialog)

    kinds = run(scenario())
    assert "telegram.message" in kinds
    assert not [kind for kind in kinds if kind.startswith("signal.")]


def test_reingesting_the_same_message_does_not_push_twice() -> None:
    """An edit or a backfill over covered ground must not ring twice."""

    async def scenario() -> list[str]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5400, OPEN_TEXT), CHAT_ID, edited=False)
            # A real edit: the text changes, so the archive records a revision
            # and the collector emits `telegram.message.edited`. The signal
            # already exists for this message id, so it must not be re-pushed.
            edited_text = OPEN_TEXT.replace("0.00 USDT", "0.00 USDT ")
            await collector.ingest_message(
                FakeMessage(
                    5400,
                    edited_text,
                    edited_at=datetime(2026, 11, 5, 9, 0, tzinfo=UTC),
                ),
                CHAT_ID,
                edited=True,
            )
            async with SessionLocal() as db:
                rows = list(await db.scalars(select(Event).order_by(Event.id)))
            return [row.kind for row in rows]
        finally:
            await _cleanup(account, dialog)

    kinds = run(scenario())
    assert kinds.count("signal.open") == 1
    assert "telegram.message.edited" in kinds


def test_signal_event_payload_carries_the_reported_realized() -> None:
    """`realized` is copied verbatim; recomputing it client-side would drift.

    The bot's figure is cumulative for the position, so a client that summed
    the numbers it happened to see would be wrong after any missed frame.
    """

    async def scenario() -> dict[str, Any]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5502, REDUCE_TEXT), CHAT_ID, edited=False)
            async with SessionLocal() as db:
                row = await db.scalar(select(Event).where(Event.kind == "signal.reduce"))
            assert row is not None
            return __import__("json").loads(row.payload)
        finally:
            await _cleanup(account, dialog)

    payload = run(scenario())
    assert payload["realized"] == 561.22
    assert payload["qty_before"] == 597.44
    assert payload["qty_after"] == 448.08
    # No 新开仓 for ZECUSDT was seen in this test, so the signal is an orphan
    # but still worth pushing: the phone should know the bot touched the pair.
    assert payload["position_status"] is None


def test_add_signal_carries_the_position_it_landed_on() -> None:
    """The push must say which position the action changed, not just the symbol."""

    async def scenario() -> dict[str, Any]:
        account, dialog = await _seed()
        try:
            collector = _collector()
            await collector.ingest_message(FakeMessage(5551, OPEN_TEXT), CHAT_ID, edited=False)
            await collector.ingest_message(FakeMessage(5552, ADD_TEXT), CHAT_ID, edited=False)
            async with SessionLocal() as db:
                row = await db.scalar(select(Event).where(Event.kind == "signal.add"))
            assert row is not None
            return __import__("json").loads(row.payload)
        finally:
            await _cleanup(account, dialog)

    payload = run(scenario())
    assert payload["position_id"] is not None
    assert payload["position_status"] == "open"
    assert payload["position_qty"] == 22.21
    assert payload["qty_before"] == 11.46
    assert payload["qty_after"] == 22.21
    assert payload["leverage_actual"] == 4.82
    assert payload["headline"] == "加仓 空 BTCUSDT 5x"


def test_ledger_reports_created_flag() -> None:
    """The collector's dedupe hinges on this flag being honest."""

    async def scenario() -> tuple[bool, bool]:
        account, dialog = await _seed()
        try:
            async with SessionLocal() as db:
                signal, position, created = await copy_ledger.ingest_result(
                    db, dialog_id=dialog.id, message_id=5600, text=OPEN_TEXT
                )
                assert signal is not None and position is not None
                await db.commit()
                again_signal, again_position, again_created = await copy_ledger.ingest_result(
                    db, dialog_id=dialog.id, message_id=5600, text=OPEN_TEXT
                )
                assert again_signal is not None and again_signal.id == signal.id
                assert again_position is None
                return created, again_created
        finally:
            await _cleanup(account, dialog)

    first, second = run(scenario())
    assert first is True
    assert second is False


@pytest.mark.parametrize(
    ("action", "expected"),
    [
        ("open", "signal.open"),
        ("add", "signal.add"),
        ("reduce", "signal.reduce"),
        ("close", "signal.close"),
        ("leverage", "signal.leverage"),
    ],
)
def test_event_kind_covers_every_action(action: str, expected: str) -> None:
    assert notify.event_kind(action) == expected
    assert notify.is_signal_event(expected)


def test_every_action_has_a_chinese_label() -> None:
    """A phone shows the label; a missing one would surface a bare English key."""

    for action in notify.ACTIONS:
        assert action in notify.ACTION_LABEL
        assert notify.ACTION_LABEL[action]


@pytest.mark.parametrize("action", notify.ACTIONS)
def test_test_signal_looks_like_a_real_one_but_is_flagged(action: str) -> None:
    """The rehearsal must exercise the same client path as a live signal.

    It therefore carries every field a real payload does, so a client that
    renders one renders the other. What keeps it honest is `test: true`, a
    symbol no exchange lists, and a 测试 prefix -- a rehearsal that looked
    exactly like a trade would be worse than no rehearsal.
    """

    payload = notify.test_signal_payload(action)
    assert payload["action"] == action
    assert payload["test"] is True
    assert payload["symbol"] == notify.TEST_SYMBOL
    assert payload["headline"].startswith("测试 · ")
    assert payload["headline"] != notify.ACTION_LABEL[action]

    # The same keys a live push has: a missing field would make the two
    # payloads diverge and the rehearsal would stop proving anything.
    live = notify.signal_payload(
        Signal(
            dialog_id=1,
            message_id=1,
            kind=action,
            action="",
            symbol="BTCUSDT",
            side="long",
        )
    )
    assert set(payload) == set(live)


def test_test_signal_rejects_an_unknown_action() -> None:
    """A typo must fail loudly here, not silently push something unringable."""

    with pytest.raises(ValueError):
        notify.test_signal_payload("open_typo")


def test_test_event_endpoint_pushes_the_chosen_action() -> None:
    """`发送测试推送` has to reach the same sound path as a live signal."""

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        session = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "test-password-123", "device": {}},
        ).json()
        headers = {"Authorization": f"Bearer {session['access_token']}"}

        response = client.post("/api/events/test?action=close", headers=headers)
        assert response.status_code == 200, response.text
        event = response.json()["event"]
        assert event["kind"] == "signal.close"
        payload = event["payload"]
        assert payload["test"] is True
        assert payload["action"] == "close"
        assert payload["headline"].startswith("测试 · ")

        bad = client.post("/api/events/test?action=nope", headers=headers)
        assert bad.status_code == 422

        # No action keeps the old event, which the pre-signal UI still reads.
        legacy = client.post("/api/events/test", headers=headers).json()["event"]
        assert legacy["kind"] == "system.test"
