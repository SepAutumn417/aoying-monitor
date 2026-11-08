"""GET-only Bitget USDT futures reads; no trading or transfer API is exposed."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from collections.abc import Callable
from typing import Any, Literal

import httpx

ErrorCode = Literal[
    "not_configured", "http_error", "network_error", "invalid_response", "api_error"
]


class BitgetError(Exception):
    """Local error code only: never retain an upstream body, message or request."""

    def __init__(self, code: ErrorCode) -> None:
        self.code = code
        super().__init__(code)


class BitgetClient:
    """Read-only adapter. ``clock`` returns Unix seconds (converted to milliseconds).

    Credentials are supplied by the caller; this module never reads configuration.
    Each call owns its HTTP client, so callers do not need a cleanup lifecycle.
    """

    def __init__(
        self,
        api_key: str = "",
        secret: str = "",
        passphrase: str = "",
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._api_key = api_key
        self._secret = secret
        self._passphrase = passphrase
        self._transport = transport
        self._clock = clock

    @property
    def configured(self) -> bool:
        return bool(self._api_key and self._secret and self._passphrase)

    async def accounts(self) -> list[dict[str, Any]]:
        return await self._get(
            "/api/v2/mix/account/accounts", {"productType": "USDT-FUTURES"}, private=True
        )

    async def positions(self) -> list[dict[str, Any]]:
        return await self._get(
            "/api/v2/mix/position/all-position",
            {"productType": "USDT-FUTURES", "marginCoin": "USDT"},
            private=True,
        )

    async def contracts(self, symbol: str | None = None) -> list[dict[str, Any]]:
        params = {"productType": "USDT-FUTURES"}
        if symbol is not None:
            params["symbol"] = symbol
        return await self._get("/api/v2/mix/market/contracts", params, private=False)

    async def _get(
        self, path: str, params: dict[str, str], *, private: bool
    ) -> list[dict[str, Any]]:
        if private and not self.configured:
            raise BitgetError("not_configured")

        # Build once: the exact encoded path/query sent on the wire is signed.
        url = httpx.URL(f"https://api.bitget.com{path}", params=params)
        headers = {}
        if private:
            timestamp = str(int(self._clock() * 1000))
            prehash = f"{timestamp}GET".encode() + url.raw_path
            signature = base64.b64encode(
                hmac.new(self._secret.encode(), prehash, hashlib.sha256).digest()
            ).decode()
            headers = {
                "ACCESS-KEY": self._api_key,
                "ACCESS-SIGN": signature,
                "ACCESS-TIMESTAMP": timestamp,
                "ACCESS-PASSPHRASE": self._passphrase,
            }
        try:
            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=httpx.Timeout(10.0),
                follow_redirects=False,
                trust_env=False,
            ) as client:
                response = await client.get(url, headers=headers)
        except httpx.RequestError:
            raise BitgetError("network_error") from None

        if response.status_code != 200:
            raise BitgetError("http_error")
        try:
            payload = response.json()
        except (ValueError, UnicodeError):
            raise BitgetError("invalid_response") from None
        if not isinstance(payload, dict) or not isinstance(payload.get("code"), str):
            raise BitgetError("invalid_response")
        if payload["code"] != "00000":
            raise BitgetError("api_error")
        data = payload.get("data")
        if not isinstance(data, list) or not all(isinstance(row, dict) for row in data):
            raise BitgetError("invalid_response")
        return data
