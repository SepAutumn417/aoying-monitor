"""Telegram collector: one authorised account, N followed chats.

The collector is intentionally thin around `telethon`, because everything that
decides what lands in the database lives in `telegram_store`. What is here is
the lifecycle the operator cares about: connect, backfill what was missed while
the server was down, keep listening, download attachments, and survive a
dropped connection.

Telethon is imported lazily so the rest of the app (and the test suite) keeps
working on a machine with no Telegram credentials configured.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.copy import ledger as copy_ledger
from app.copy import notify
from app.db import SessionLocal
from app.events import append_event
from app.models import utcnow
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramTopic
from app.telegram_store import media_kind_of, message_payload, normalize, upsert_message
from app.telegram_topics import TARGET_CHAT_ID, ensure_topics, topic_id_of

log = logging.getLogger("aoying.telegram")

# How many messages to pull per chat when catching up. Chat history is mostly
# noise, and the operator only ever needs what arrived while the server was down.
BACKFILL_LIMIT = 200

# Spec §5: fill gaps every five minutes on top of the live listener, because a
# dropped socket can silently skip messages.
SYNC_INTERVAL_SECONDS = 300


@dataclass
class CollectorStatus:
    state: str = "stopped"  # stopped | connecting | running | error
    detail: str = ""
    started_at: datetime | None = None
    last_message_at: datetime | None = None
    messages_total: int = 0
    dialogs: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "detail": self.detail,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "messages_total": self.messages_total,
            "dialogs": self.dialogs,
        }


class TelegramNotConfigured(RuntimeError):
    """Raised when api_id/api_hash are missing, so the UI can say why."""


@dataclass
class TelegramCollector:
    """Owns the Telethon client and the persistence callbacks.

    `client_factory` is injectable so the ingestion path can be exercised with a
    fake source; production passes `None` and Telethon is built from settings.
    """

    api_id: int | None = None
    api_hash: str = ""
    session_path: str = ""
    media_dir: str = ""
    account_id: int | None = None
    client_factory: Callable[[], Any] | None = None
    download_media: bool = True
    backfill_limit: int = BACKFILL_LIMIT
    sync_interval: int = SYNC_INTERVAL_SECONDS

    status: CollectorStatus = field(default_factory=CollectorStatus)
    _client: Any = None
    _task: asyncio.Task[None] | None = None
    _sync_task: asyncio.Task[None] | None = None
    _handlers: list[Any] = field(default_factory=list)
    _sync_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    # -- lifecycle ---------------------------------------------------------

    async def start(self) -> CollectorStatus:
        async with self._lock:
            if self.status.state == "running":
                return self.status

            self.status = CollectorStatus(state="connecting", started_at=utcnow())
            try:
                if self.client_factory is not None:
                    client = self.client_factory()
                else:
                    if not self.api_id or not self.api_hash:
                        raise TelegramNotConfigured(
                            "缺少 TG_API_ID / TG_API_HASH，先在服务器上配置好再启动采集"
                        )
                    client = await self._build_client()

                await self._connect(client)
                self._client = client
                await self._load_account()
                dialogs = await self._enabled_dialogs()
                self._attach_handlers(client, dialogs)

                self.status.state = "running"
                self.status.detail = f"已连接 {len(dialogs)} 个会话"
                self.status.dialogs = len(dialogs)

                self._task = asyncio.create_task(
                    self._initial_backfill(dialogs), name="tg-backfill"
                )
                if self.sync_interval > 0:
                    self._sync_task = asyncio.create_task(self._sync_loop(), name="tg-sync")
                await self._touch_connected()
            except Exception as exc:  # noqa: BLE001 - surface anything to the UI
                log.exception("telegram start failed")
                self.status.state = "error"
                self.status.detail = str(exc)
                await self._record_error(str(exc))
            return self.status

    async def _initial_backfill(self, dialogs: list[TelegramDialog]) -> None:
        async with self._sync_lock:
            await self._backfill(dialogs)

    async def stop(self) -> CollectorStatus:
        async with self._lock:
            for task in (self._task, self._sync_task):
                if task is not None:
                    task.cancel()
            self._task = None
            self._sync_task = None
            if self._client is not None:
                self._detach_handlers()
                try:
                    await self._client.disconnect()
                except Exception:  # noqa: BLE001
                    log.warning("telegram disconnect failed", exc_info=True)
                self._client = None
            self.status.state = "stopped"
            self.status.detail = "已停止"
            return self.status

    @property
    def running(self) -> bool:
        return self.status.state == "running"

    # -- telethon plumbing -------------------------------------------------

    async def _build_client(self) -> Any:
        from telethon import TelegramClient  # imported lazily on purpose

        Path(self.session_path).parent.mkdir(parents=True, exist_ok=True)
        client = TelegramClient(self.session_path, self.api_id, self.api_hash)
        return client

    async def _connect(self, client: Any) -> None:
        connect = getattr(client, "connect", None)
        if connect is not None:
            await connect()
        authorized = getattr(client, "is_user_authorized", None)
        if authorized is not None:
            ok = authorized()
            if asyncio.iscoroutine(ok):
                ok = await ok
            if not ok:
                raise TelegramNotConfigured(
                    "会话文件未登录，先在服务器上运行 `python -m app.telegram_login` 完成登录"
                )

    def _attach_handlers(self, client: Any, dialogs: list[TelegramDialog]) -> None:
        try:
            from telethon import events
        except ModuleNotFoundError:  # fake client in tests
            return

        chats = [dialog.chat_id for dialog in dialogs]
        if not chats:
            return

        @client.on(events.NewMessage(chats=chats))
        async def _on_new(event: Any) -> None:  # noqa: ANN202
            await self.ingest_event(event.message, edited=False)

        @client.on(events.MessageEdited(chats=chats))
        async def _on_edit(event: Any) -> None:  # noqa: ANN202
            await self.ingest_event(event.message, edited=True)

        @client.on(events.MessageDeleted())
        async def _on_delete(event: Any) -> None:  # noqa: ANN202
            await self.ingest_deleted(getattr(event, "chat_id", None), list(event.deleted_ids))

        self._handlers = [_on_new, _on_edit, _on_delete]

    def _detach_handlers(self) -> None:
        client = self._client
        remove = getattr(client, "remove_event_handler", None) if client is not None else None
        for callback in self._handlers:
            if remove is None:
                break
            try:
                remove(callback)
            except Exception:  # noqa: BLE001 - a stale handler is not fatal
                log.debug("could not detach telegram handler", exc_info=True)
        self._handlers = []

    async def refresh_handlers(self, dialogs: list[TelegramDialog] | None = None) -> int:
        """Re-register the live filters so a newly followed chat starts streaming.

        Telethon bakes the chat list into the event filter, so following a chat
        with the collector already running would otherwise only take effect
        after a restart.
        """

        if self._client is None:
            return 0
        if dialogs is None:
            dialogs = await self._enabled_dialogs()
        self._detach_handlers()
        self._attach_handlers(self._client, dialogs)
        self.status.dialogs = len(dialogs)
        return len(dialogs)

    # -- persistence -------------------------------------------------------

    async def _load_account(self) -> None:
        async with SessionLocal() as db:
            if self.account_id is None:
                account = await db.scalar(
                    select(TelegramAccount)
                    .where(TelegramAccount.is_enabled.is_(True))
                    .order_by(TelegramAccount.id)
                    .limit(1)
                )
                if account is not None:
                    self.account_id = account.id
            else:
                account = await db.get(TelegramAccount, self.account_id)
            if account is not None:
                account.last_connected_at = utcnow()
                account.last_error = ""
                await db.commit()

    async def _touch_connected(self) -> None:
        await self._load_account()

    async def _record_error(self, message: str) -> None:
        if self.account_id is None:
            return
        async with SessionLocal() as db:
            account = await db.get(TelegramAccount, self.account_id)
            if account is not None:
                account.last_error = message[:1000]
                await db.commit()

    async def _enabled_dialogs(self) -> list[TelegramDialog]:
        async with SessionLocal() as db:
            stmt = select(TelegramDialog).where(TelegramDialog.enabled.is_(True))
            if self.account_id is not None:
                stmt = stmt.where(TelegramDialog.account_id == self.account_id)
            rows = list(await db.scalars(stmt))
            if self.client_factory is None:
                for row in rows:
                    if row.chat_id != TARGET_CHAT_ID:
                        row.enabled = False
                await db.commit()
                rows = [row for row in rows if row.chat_id == TARGET_CHAT_ID]
            for row in rows:
                await ensure_topics(db, row)
            return rows

    async def _dialog_for(self, db: AsyncSession, chat_id: int) -> TelegramDialog | None:
        if self.client_factory is None and chat_id != TARGET_CHAT_ID:
            return None
        stmt = select(TelegramDialog).where(
            TelegramDialog.chat_id == chat_id, TelegramDialog.enabled.is_(True)
        )
        if self.account_id is not None:
            stmt = stmt.where(TelegramDialog.account_id == self.account_id)
        return await db.scalar(stmt)

    async def _backfill(self, dialogs: list[TelegramDialog]) -> None:
        client = self._client
        if client is None:
            return
        for dialog in dialogs:
            try:
                await self._backfill_dialog(client, dialog)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - one bad chat must not stop the rest
                log.warning("backfill failed for %s: %s", dialog.title, exc)
        self.status.detail = f"已连接 {self.status.dialogs} 个会话，补拉完成"

    async def _sync_loop(self) -> None:
        """Gap fill every `sync_interval` seconds (spec §5).

        The live listener can miss messages when the socket drops without an
        error; polling `min_id` per chat is the safety net.
        """

        while True:
            try:
                await asyncio.sleep(self.sync_interval)
                await self.sync_once()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - never let the loop die
                log.warning("telegram periodic sync failed", exc_info=True)

    async def sync_once(self) -> dict[str, Any]:
        """Catch up every enabled chat once. Safe to call while running.

        A sync already in flight is not queued: the periodic loop and the manual
        button would otherwise stampede the same chats.
        """

        if self._client is None:
            raise TelegramNotConfigured("采集器未运行")
        if self._sync_lock.locked():
            return {"skipped": True, "dialogs": self.status.dialogs}

        async with self._sync_lock:
            dialogs = await self._enabled_dialogs()
            # Re-register first so a chat followed a second ago starts streaming
            # immediately, not after the next restart.
            await self.refresh_handlers(dialogs)
            await self._backfill(dialogs)
        return {"skipped": False, "dialogs": len(dialogs)}

    async def _backfill_dialog(self, client: Any, dialog: TelegramDialog) -> None:
        if self.client_factory is None and dialog.chat_id != TARGET_CHAT_ID:
            return
        if dialog.chat_id == TARGET_CHAT_ID:
            from app.telegram_forum_sync import sync_forum

            await sync_forum(
                client,
                dialog,
                self.backfill_limit,
                download=self._download if self.download_media else None,
            )
            return
        iter_messages = getattr(client, "iter_messages", None)
        if iter_messages is None:
            return

        min_id = dialog.last_message_id or 0
        if min_id:
            # Resuming: everything newer than what we already stored, oldest first.
            async for raw in iter_messages(
                dialog.chat_id, min_id=min_id, reverse=True, limit=self.backfill_limit
            ):
                await self.ingest_message(
                    raw, dialog.chat_id, edited=False, download=self.download_media
                )
        else:
            # First contact: take the most recent N. Asking for `reverse=True`
            # with no `min_id` would return the *oldest* messages in the chat
            # instead of the recent ones the operator cares about.
            batch = [raw async for raw in iter_messages(dialog.chat_id, limit=self.backfill_limit)]
            for raw in reversed(batch):
                await self.ingest_message(
                    raw, dialog.chat_id, edited=False, download=self.download_media
                )

        async with SessionLocal() as db:
            row = await db.get(TelegramDialog, dialog.id)
            if row is not None:
                row.last_synced_at = utcnow()
                await db.commit()

    async def ingest_event(self, raw: Any, edited: bool) -> dict[str, Any] | None:
        chat_id = int(getattr(raw, "chat_id", 0) or 0)
        return await self.ingest_message(raw, chat_id, edited=edited, download=self.download_media)

    async def ingest_message(
        self, raw: Any, chat_id: int, edited: bool, download: bool = True
    ) -> dict[str, Any] | None:
        async with SessionLocal() as db:
            dialog = await self._dialog_for(db, chat_id)
            if dialog is None:
                return None

            topic = None
            if chat_id == TARGET_CHAT_ID:
                topic = await db.scalar(
                    select(TelegramTopic).where(
                        TelegramTopic.dialog_id == dialog.id,
                        TelegramTopic.topic_id == topic_id_of(raw),
                        TelegramTopic.enabled.is_(True),
                    )
                )
                if topic is None:
                    return None
            data = normalize(raw)
            data["chat_id"] = chat_id
            row, outcome = await upsert_message(db, dialog, data)
            if outcome == "unchanged":
                return None

            if download and row.media_kind and not row.media_path:
                await self._download(db, row, raw, dialog)

            max_id = max(dialog.last_message_id or 0, row.message_id)
            if max_id != dialog.last_message_id:
                dialog.last_message_id = max_id
                dialog.last_synced_at = utcnow()
                await db.commit()

            # Derive the trading signal in the same transaction as the message
            # so the ledger can never drift from what the bot actually said.
            # A parser failure must not cost us the archive row.
            derived: tuple[Any, Any, bool] = (None, None, False)
            try:
                derived = await copy_ledger.ingest_message_result(db, row)
            except Exception:  # pragma: no cover - defensive
                log.warning(
                    "signal derivation failed for message %s", row.message_id, exc_info=True
                )

            payload = message_payload(row, dialog)
            payload["outcome"] = outcome
            kind = "telegram.message.edited" if outcome == "edited" else "telegram.message"
            event = await append_event(db, kind, payload)

            # A structured signal is what a phone can turn into "新开多 BTCUSDT
            # 10x" with its own sound. Only a first sight pushes: an edit or a
            # backfill over covered ground must not ring twice.
            signal, position, created = derived
            if created and signal is not None:
                await append_event(
                    db,
                    notify.event_kind(signal.kind),
                    notify.signal_payload(
                        signal,
                        position=position,
                        dialog=dialog.title or "",
                        text=row.text or "",
                    ),
                )

        self.status.last_message_at = utcnow()
        self.status.messages_total += 1
        return event

    async def ingest_deleted(self, chat_id: int | None, message_ids: list[int]) -> None:
        """Mark messages deleted. `chat_id` is None when Telegram does not say.

        A `None` chat id means the update was for a non-channel chat. We must not
        apply those ids across every followed chat: message ids are only unique
        within a chat, so that would delete unrelated rows.
        """

        if not message_ids:
            return
        if self.client_factory is None and chat_id is not None and chat_id != TARGET_CHAT_ID:
            return
        if chat_id is None:
            log.debug("ignoring delete update without chat_id: %s", message_ids[:10])
            return
        from app.telegram_store import mark_deleted

        async with SessionLocal() as db:
            stmt = select(TelegramDialog).where(
                TelegramDialog.enabled.is_(True),
                TelegramDialog.chat_id == int(chat_id),
            )
            if self.account_id is not None:
                stmt = stmt.where(TelegramDialog.account_id == self.account_id)
            dialog = await db.scalar(stmt)
            if dialog is None:
                return
            rows = await mark_deleted(db, dialog, message_ids)
            for row in rows:
                payload = message_payload(row, dialog)
                payload["deleted"] = True
                await append_event(db, "telegram.message.deleted", payload)

    async def _download(self, db: AsyncSession, row: Any, raw: Any, dialog: TelegramDialog) -> None:
        client = self._client
        if client is None:
            return
        target_dir = Path(self.media_dir or "./data/media") / str(dialog.chat_id)
        target_dir.mkdir(parents=True, exist_ok=True)
        download_media = getattr(client, "download_media", None)
        if download_media is None:
            return
        try:
            path = await download_media(raw, file=str(target_dir))
        except Exception as exc:  # noqa: BLE001 - media is best effort
            log.warning(
                "media download failed for %s/%s: %s", chat_id_safe(dialog), row.message_id, exc
            )
            return
        if not path:
            return
        p = Path(path)
        row.media_path = str(p)
        try:
            row.media_size = p.stat().st_size
        except OSError:
            row.media_size = 0
        if not row.media_kind:
            row.media_kind = media_kind_of(raw)
        await db.commit()


def chat_id_safe(dialog: TelegramDialog) -> str:
    return dialog.title or str(dialog.chat_id)


# ---------------------------------------------------------------------------
# Process-wide singleton used by the API layer.
# ---------------------------------------------------------------------------

collector: TelegramCollector | None = None


def get_collector() -> TelegramCollector:
    global collector
    if collector is None:
        from app.config import get_settings

        settings = get_settings()
        collector = TelegramCollector(
            api_id=settings.tg_api_id,
            api_hash=settings.tg_api_hash,
            session_path=settings.tg_session_path,
            media_dir=settings.tg_media_dir,
            backfill_limit=settings.tg_backfill_limit,
            sync_interval=settings.tg_sync_interval_seconds,
        )
    return collector
