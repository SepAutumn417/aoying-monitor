"""Read-only Bitget account translation: equity, contract specs, fallbacks.

Every test drives MockTransport, so no request can leave the machine.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from app.copy.account import (
    ContractBook,
    EquityUnavailable,
    equity_of,
    load_contracts,
    read_equity,
    resolve_equity,
    spec_of,
)
from app.copy.bitget import BitgetClient, BitgetError
from app.copy.contracts import ContractSpec, spec_for

CREDS = {"api_key": "k", "secret": "s", "passphrase": "p"}


def client(handler: Any, **credentials: Any) -> BitgetClient:
    return BitgetClient(
        **{**CREDS, **credentials},
        transport=httpx.MockTransport(handler),
        clock=lambda: 1700000000.0,
    )


def ok(data: Any) -> httpx.Response:
    return httpx.Response(200, json={"code": "00000", "data": data})


# --- equity_of -------------------------------------------------------------


def test_equity_reads_the_usdt_row() -> None:
    rows = [
        {"marginCoin": "USDC", "accountEquity": "999"},
        {"marginCoin": "USDT", "accountEquity": "1234.56"},
    ]
    assert equity_of(rows) == pytest.approx(1234.56)


def test_equity_ignores_zero_and_negative_rows() -> None:
    assert equity_of([{"marginCoin": "USDT", "accountEquity": "0"}]) is None
    assert equity_of([{"marginCoin": "USDT", "accountEquity": "-5"}]) is None


def test_equity_returns_none_rather_than_zero_when_unparseable() -> None:
    """A zero would make sizing produce nothing; None forces a loud refusal."""
    assert equity_of([{"marginCoin": "USDT", "accountEquity": "n/a"}]) is None
    assert equity_of([{"marginCoin": "USDT"}]) is None
    assert equity_of([]) is None


# --- spec_of ---------------------------------------------------------------


def test_spec_of_reads_the_measured_contract_row() -> None:
    spec = spec_of(
        {"sizeMultiplier": "0.0001", "minTradeNum": "0.0001", "pricePlace": "1"}
    )
    assert spec == ContractSpec(size_multiplier=0.0001, min_trade_num=0.0001, price_place=1)


def test_spec_of_defaults_minimum_to_the_step() -> None:
    spec = spec_of({"sizeMultiplier": "0.01", "pricePlace": "2"})
    assert spec is not None
    assert spec.min_trade_num == pytest.approx(0.01)


def test_spec_of_rejects_a_missing_or_zero_step() -> None:
    assert spec_of({}) is None
    assert spec_of({"sizeMultiplier": "0"}) is None
    assert spec_of({"sizeMultiplier": "abc"}) is None


def test_spec_of_never_returns_a_negative_price_place() -> None:
    spec = spec_of({"sizeMultiplier": "0.01", "pricePlace": "-3"})
    assert spec is not None
    assert spec.price_place == 0


# --- read_equity / resolve_equity ------------------------------------------


def test_read_equity_raises_when_the_exchange_says_nothing_usable() -> None:
    with pytest.raises(EquityUnavailable):
        asyncio.run(read_equity(client(lambda request: ok([]))))


def test_read_equity_returns_the_live_number() -> None:
    handler = lambda request: ok([{"marginCoin": "USDT", "accountEquity": "812.5"}])  # noqa: E731
    assert asyncio.run(read_equity(client(handler))) == pytest.approx(812.5)


def test_resolve_equity_uses_config_when_bitget_is_unconfigured() -> None:
    snapshot = asyncio.run(resolve_equity(None, 1000.0))
    assert snapshot.equity == pytest.approx(1000.0)
    assert snapshot.source == "config"
    assert snapshot.from_exchange is False


def test_resolve_equity_prefers_the_exchange_when_configured() -> None:
    handler = lambda request: ok([{"marginCoin": "USDT", "accountEquity": "4321"}])  # noqa: E731
    snapshot = asyncio.run(resolve_equity(client(handler), 1000.0))
    assert snapshot.equity == pytest.approx(4321)
    assert snapshot.from_exchange is True


def test_resolve_equity_refuses_to_fall_back_on_a_configured_failure() -> None:
    """A configured account that errors must not quietly size from the constant."""
    handler = lambda request: httpx.Response(500, text="boom")  # noqa: E731
    with pytest.raises(EquityUnavailable) as caught:
        asyncio.run(resolve_equity(client(handler), 1000.0))
    assert "http_error" in str(caught.value)


def test_resolve_equity_surfaces_the_local_error_code_only() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("secret-sentinel")

    with pytest.raises(EquityUnavailable) as caught:
        asyncio.run(resolve_equity(client(handler), 1000.0))
    assert "secret-sentinel" not in str(caught.value)
    assert caught.value.__cause__ is None


# --- load_contracts --------------------------------------------------------


def test_load_contracts_marks_measured_symbols_as_trusted() -> None:
    handler = lambda request: ok(  # noqa: E731
        [{"symbol": "BTCUSDT", "sizeMultiplier": "0.0001", "pricePlace": "1"}]
    )
    book = asyncio.run(load_contracts(client(handler)))
    spec, measured = book.spec_for("BTCUSDT")
    assert measured is True
    assert spec.size_multiplier == pytest.approx(0.0001)


def test_load_contracts_falls_back_to_the_static_table_for_missing_symbols() -> None:
    handler = lambda request: ok([])  # noqa: E731
    book = asyncio.run(load_contracts(client(handler)))
    spec, measured = book.spec_for("ETHUSDT")
    static, _ = spec_for("ETHUSDT")
    assert measured is False
    assert spec == static


def test_load_contracts_records_which_requested_symbols_were_assumed() -> None:
    handler = lambda request: ok([{"symbol": "BTCUSDT", "sizeMultiplier": "0.0001"}])  # noqa: E731
    book = asyncio.run(load_contracts(client(handler), ["BTCUSDT", "ZECUSDT"]))
    assert book.assumed == {"ZECUSDT"}
    assert isinstance(book, ContractBook)


def test_load_contracts_skips_rows_with_an_unusable_step() -> None:
    handler = lambda request: ok(  # noqa: E731
        [
            {"symbol": "BTCUSDT", "sizeMultiplier": "0"},
            {"symbol": "ETHUSDT", "sizeMultiplier": "0.01"},
        ]
    )
    book = asyncio.run(load_contracts(client(handler), ["BTCUSDT", "ETHUSDT"]))
    assert "BTCUSDT" not in book.specs
    assert "ETHUSDT" in book.specs
    assert book.assumed == {"BTCUSDT"}


def test_contract_book_defaults_never_claim_to_be_measured() -> None:
    book = ContractBook(specs={}, assumed=set())
    spec, measured = book.spec_for("SNDKUSDT")
    assert measured is False
    assert spec.size_multiplier > 0


def test_bitget_error_stays_sanitized_through_the_account_layer() -> None:
    handler = lambda request: httpx.Response(401, text="private-key-sentinel")  # noqa: E731
    with pytest.raises(BitgetError):
        asyncio.run(load_contracts(client(handler)))
