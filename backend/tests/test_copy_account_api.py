"""Account status endpoint: live equity and contract specs, still GET-only."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.copy.bitget import BitgetClient
from app.main import app

ADMIN = {"username": "admin", "password": "test-password-123"}


def auth(client: TestClient) -> dict[str, str]:
    response = client.post("/api/auth/login", json={**ADMIN, "device": {"name": "acct"}})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _settings(**overrides: Any) -> Settings:
    return Settings().model_copy(update=overrides)


def _patch_bitget(monkeypatch: pytest.MonkeyPatch, handler: Any) -> None:
    """Point the adapter at a MockTransport, keeping the real signing code."""
    monkeypatch.setattr(
        "app.copy.account.BitgetClient",
        lambda **kwargs: BitgetClient(**{**kwargs, "transport": httpx.MockTransport(handler)}),
    )


def test_account_requires_auth() -> None:
    with TestClient(app) as client:
        assert client.get("/api/copy/account").status_code == 401


def test_account_reports_config_equity_when_bitget_is_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No credentials means shadow mode: the configured stand-in is the answer."""
    settings = _settings(bitget_api_key="", bitget_secret="", bitget_passphrase="")
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    with TestClient(app) as client:
        body = client.get("/api/copy/account", headers=auth(client)).json()
    assert body["configured"] is False
    assert body["source"] == "config"
    assert body["equity"] == pytest.approx(settings.copy_equity_usdt)
    assert body["detail"] == "bitget_not_configured"


def test_account_reads_live_equity_and_specs(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v2/mix/account/accounts":
            return httpx.Response(
                200,
                json={
                    "code": "00000",
                    "data": [{"marginCoin": "USDT", "accountEquity": "2750.5"}],
                },
            )
        return httpx.Response(
            200,
            json={
                "code": "00000",
                "data": [
                    {"symbol": "BTCUSDT", "sizeMultiplier": "0.0001", "pricePlace": "1"}
                ],
            },
        )

    settings = _settings(
        bitget_api_key="k", bitget_secret="s", bitget_passphrase="p"
    )
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    _patch_bitget(monkeypatch, handler)
    with TestClient(app) as client:
        body = client.get("/api/copy/account", headers=auth(client)).json()
    assert body["configured"] is True
    assert body["source"] == "bitget"
    assert body["equity"] == pytest.approx(2750.5)
    assert body["contracts_measured"] == 1


def test_account_reports_unknown_instead_of_a_fake_number_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _settings(
        bitget_api_key="k", bitget_secret="s", bitget_passphrase="p"
    )
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    _patch_bitget(monkeypatch, lambda request: httpx.Response(500, text="boom"))
    with TestClient(app) as client:
        body = client.get("/api/copy/account", headers=auth(client)).json()
    assert body["configured"] is True
    assert body["equity"] is None
    assert body["detail"] == "http_error"


def _equity_then_specs(equity: str) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v2/mix/account/accounts":
            return httpx.Response(
                200,
                json={"code": "00000", "data": [{"marginCoin": "USDT", "accountEquity": equity}]},
            )
        return httpx.Response(
            200,
            json={
                "code": "00000",
                "data": [
                    {"symbol": "BTCUSDT", "sizeMultiplier": "0.0001", "pricePlace": "1"}
                ],
            },
        )

    return handler


def test_replay_uses_live_equity_and_measured_specs(monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole point of I4a: replay sizes off the real account, not a constant."""
    settings = _settings(
        bitget_api_key="k", bitget_secret="s", bitget_passphrase="p", copy_equity_usdt=1000.0
    )
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    _patch_bitget(monkeypatch, _equity_then_specs("2750.5"))
    with TestClient(app) as client:
        response = client.post("/api/copy/replay", headers=auth(client))
        assert response.status_code == 200, response.text
        body = response.json()
    assert body["equity"] == pytest.approx(2750.5)
    assert body["equity_source"] == "bitget"
    assert body["contracts_measured"] == 1


def test_replay_lets_an_explicit_equity_win_without_calling_the_exchange(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A what-if run must not depend on credentials or the network at all."""
    settings = _settings(
        bitget_api_key="k", bitget_secret="s", bitget_passphrase="p"
    )
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    _patch_bitget(
        monkeypatch, lambda request: pytest.fail("An explicit equity must not hit Bitget")
    )
    with TestClient(app) as client:
        body = client.post(
            "/api/copy/replay", json={"equity": 5000.0}, headers=auth(client)
        ).json()
    assert body["equity"] == pytest.approx(5000.0)
    assert body["equity_source"] == "request"
    assert body["contracts_measured"] == 0


def test_replay_fails_loudly_when_a_configured_account_cannot_be_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Silently replaying on the stale constant would misstate every size."""
    settings = _settings(
        bitget_api_key="k", bitget_secret="s", bitget_passphrase="p"
    )
    monkeypatch.setattr("app.api.copy.get_settings", lambda: settings)
    _patch_bitget(monkeypatch, lambda request: httpx.Response(500, text="boom"))
    with TestClient(app) as client:
        response = client.post("/api/copy/replay", headers=auth(client))
    assert response.status_code == 409
    assert response.json()["detail"] == "http_error"

