"""Read-only Bitget adapter contract; all HTTP traffic uses MockTransport."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import importlib
import traceback
from typing import Any

import httpx
import pytest

CREDS = {
    "api_key": "private-key-sentinel",
    "secret": "secret-sentinel",
    "passphrase": "passphrase-sentinel",
}


def adapter(**kwargs: Any) -> Any:
    return importlib.import_module("app.copy.bitget").BitgetClient(**kwargs)


def test_configured_requires_every_credential() -> None:
    assert adapter(**CREDS).configured is True
    for missing in CREDS:
        assert adapter(**{**CREDS, missing: ""}).configured is False
    assert adapter().configured is False


@pytest.mark.parametrize(
    "method,path,query",
    [
        ("accounts", "/api/v2/mix/account/accounts", "productType=USDT-FUTURES"),
        (
            "positions",
            "/api/v2/mix/position/all-position",
            "productType=USDT-FUTURES&marginCoin=USDT",
        ),
    ],
)
def test_private_get_signs_exact_encoded_query(method: str, path: str, query: str) -> None:
    requests = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.method == "GET"
        assert str(request.url) == f"https://api.bitget.com{path}?{query}"
        assert request.content == b""
        timestamp = "1700000000123"
        prehash = f"{timestamp}GET{path}?{query}".encode()
        signature = base64.b64encode(
            hmac.new(CREDS["secret"].encode(), prehash, hashlib.sha256).digest()
        ).decode()
        assert request.headers["ACCESS-KEY"] == CREDS["api_key"]
        assert request.headers["ACCESS-PASSPHRASE"] == CREDS["passphrase"]
        assert request.headers["ACCESS-TIMESTAMP"] == timestamp
        assert request.headers["ACCESS-SIGN"] == signature
        timeout = request.extensions["timeout"]
        assert all(isinstance(value, (int, float)) and value > 0 for value in timeout.values())
        return httpx.Response(200, json={"code": "00000", "data": [{"equity": "123"}]})

    client = adapter(**CREDS, clock=lambda: 1700000000.123, transport=httpx.MockTransport(handle))
    assert asyncio.run(getattr(client, method)()) == [{"equity": "123"}]
    assert len(requests) == 1


@pytest.mark.parametrize("credentials", [{}, CREDS, {"api_key": CREDS["api_key"]}])
@pytest.mark.parametrize("symbol", [None, "BTCUSDT", "A/B &?=USDT"])
def test_contracts_are_public_and_symbol_is_only_query_data(
    credentials: dict[str, str],
    symbol: str | None,
) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        expected = {"productType": "USDT-FUTURES"}
        if symbol is not None:
            expected["symbol"] = symbol
        assert request.method == "GET"
        assert request.url.scheme == "https"
        assert request.url.host == "api.bitget.com"
        assert request.url.path == "/api/v2/mix/market/contracts"
        assert dict(request.url.params) == expected
        assert not any(name.lower().startswith("access-") for name in request.headers)
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"code": "00000", "data": []})

    def forbidden_clock() -> float:
        pytest.fail("Public requests must not prepare authentication")

    client = adapter(**credentials, transport=httpx.MockTransport(handle), clock=forbidden_clock)
    assert asyncio.run(client.contracts(symbol)) == []


@pytest.mark.parametrize("method", ["accounts", "positions"])
@pytest.mark.parametrize("missing", list(CREDS))
def test_missing_credentials_fail_before_network(method: str, missing: str) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        pytest.fail("Missing credentials must never issue a request")

    client = adapter(**{**CREDS, missing: ""}, transport=httpx.MockTransport(handle))
    error_type = importlib.import_module("app.copy.bitget").BitgetError
    with pytest.raises(error_type) as caught:
        asyncio.run(getattr(client, method)())
    assert caught.value.code == "not_configured"


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        "upstream-secret",
        {},
        {"code": 0, "data": []},
        {"code": "00000"},
        {"code": "00000", "data": None},
        {"code": "00000", "data": {}},
        {"code": "00000", "data": [1]},
        {"code": "00000", "data": [{}, "bad"]},
    ],
)
def test_malformed_envelopes_are_sanitized(payload: Any) -> None:
    _assert_safe_error(httpx.Response(200, json=payload), "invalid_response")


def test_invalid_json_is_sanitized() -> None:
    _assert_safe_error(httpx.Response(200, content=b"not-json secret-sentinel"), "invalid_response")


@pytest.mark.parametrize("code", ["40009", "secret-sentinel\nPRIVATE", None, 40009])
def test_upstream_api_errors_never_expose_upstream_code_or_message(code: Any) -> None:
    expected = "api_error" if isinstance(code, str) else "invalid_response"
    _assert_safe_error(
        httpx.Response(
            200,
            json={
                "code": code,
                "msg": "private-key-sentinel secret-sentinel passphrase-sentinel",
                "data": [],
            },
        ),
        expected,
    )


@pytest.mark.parametrize("status", [201, 301, 302, 400, 401, 429, 500, 503])
def test_non_200_is_sanitized_without_redirects_or_retries(status: int) -> None:
    _assert_safe_error(
        httpx.Response(
            status, headers={"location": "https://evil.invalid/"}, text="secret-sentinel"
        ),
        "http_error",
    )


@pytest.mark.parametrize(
    "error_class", [httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError]
)
def test_transport_errors_are_sanitized_without_retries(
    error_class: type[httpx.RequestError],
) -> None:
    _assert_safe_error(
        error_class("private-key-sentinel secret-sentinel passphrase-sentinel"), "network_error"
    )


def _assert_safe_error(response: httpx.Response | Exception, code: str) -> None:
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if isinstance(response, Exception):
            raise response
        return response

    client = adapter(**CREDS, transport=httpx.MockTransport(handle))
    error_type = importlib.import_module("app.copy.bitget").BitgetError
    with pytest.raises(error_type) as caught:
        asyncio.run(client.accounts())
    error = caught.value
    assert error.code == code
    assert error.args == (code,)
    rendered = "".join(traceback.format_exception(error))
    for secret in CREDS.values():
        assert secret not in str(error)
        assert secret not in repr(error)
        assert secret not in rendered
    assert error.__cause__ is None
    assert len(calls) == 1
