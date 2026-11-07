"""Startup and manual history sync share the same exclusion lock."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.telegram_collector import TelegramCollector


@pytest.mark.asyncio
async def test_startup_backfill_uses_sync_lock(monkeypatch):
    collector = TelegramCollector(client_factory=lambda: SimpleNamespace(), sync_interval=0)
    for name in ("_connect", "_load_account", "_touch_connected"):
        monkeypatch.setattr(collector, name, AsyncMock())
    monkeypatch.setattr(collector, "_enabled_dialogs", AsyncMock(return_value=[]))
    monkeypatch.setattr(collector, "_attach_handlers", Mock())

    async def backfill(dialogs):
        assert collector._sync_lock.locked()
        assert (await collector.sync_once())["skipped"] is True

    monkeypatch.setattr(collector, "_backfill", backfill)
    await collector.start()
    await collector._task
    await collector.stop()
