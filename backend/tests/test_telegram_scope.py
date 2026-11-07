"""The approved connection must not enumerate or follow unrelated chats."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api import telegram
from app.telegram_topics import TARGET_CHAT_ID


def test_discovery_fetches_only_the_authorized_group(monkeypatch):
    client = SimpleNamespace(
        get_entity=AsyncMock(return_value=SimpleNamespace(title="熬鹰书友会", username=None)),
        get_dialogs=AsyncMock(side_effect=AssertionError("must not enumerate private chats")),
    )
    monkeypatch.setattr(telegram, "get_collector", lambda: SimpleNamespace(
        _client=client, running=True,
    ))
    db = SimpleNamespace(scalars=AsyncMock(return_value=[]))
    rows = asyncio.run(telegram.discover_dialogs(db=db, user=None))
    assert [row.chat_id for row in rows] == [TARGET_CHAT_ID]
    client.get_entity.assert_awaited_once_with(TARGET_CHAT_ID)
    client.get_dialogs.assert_not_awaited()


def test_follow_rejects_unapproved_chat_before_any_database_access():
    with pytest.raises(HTTPException) as error:
        asyncio.run(telegram.follow_dialog(chat_id=-1002463154584, db=None, user=None))
    assert error.value.status_code == 400
