"""Telegram source API: status, dialog discovery, follow/unfollow, messages.

The collector is a background singleton; these endpoints are how the operator
sees whether it is alive and which chats it is actually following.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User, utcnow
from app.security import current_user
from app.telegram_collector import get_collector
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


class DialogItem(BaseModel):
    id: int
    chat_id: int
    title: str
    kind: str
    username: str
    enabled: bool
    last_message_id: int
    last_synced_at: datetime | None
    messages: int = 0


class MessageRevisionItem(BaseModel):
    text: str
    media_kind: str
    replaced_at: datetime


class MessageItem(BaseModel):
    id: int
    chat_id: int
    dialog_title: str
    message_id: int
    sender_name: str
    text: str
    media_kind: str
    posted_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    revisions: list[MessageRevisionItem] = Field(default_factory=list)


class DiscoveryItem(BaseModel):
    chat_id: int
    title: str
    kind: str
    username: str
    followed: bool


async def _primary_account(db: AsyncSession) -> TelegramAccount | None:
    return await db.scalar(select(TelegramAccount).order_by(TelegramAccount.id).limit(1))


@router.get("/status")
async def telegram_status(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> dict[str, Any]:
    collector = get_collector()
    account = await _primary_account(db)
    dialog_count = await db.scalar(select(func.count()).select_from(TelegramDialog))
    followed = await db.scalar(
        select(func.count()).select_from(TelegramDialog).where(TelegramDialog.enabled.is_(True))
    )
    messages = await db.scalar(select(func.count()).select_from(TelegramMessage))
    return {
        "collector": collector.status.as_dict(),
        "account": None
        if account is None
        else {
            "id": account.id,
            "label": account.label,
            "phone": account.phone,
            "username": account.tg_username,
            "display_name": account.display_name,
            "last_connected_at": account.last_connected_at.isoformat()
            if account.last_connected_at
            else None,
            "last_error": account.last_error,
        },
        "dialogs": int(dialog_count or 0),
        "followed": int(followed or 0),
        "messages": int(messages or 0),
    }


@router.post("/start")
async def start_collector(user: User = Depends(current_user)) -> dict[str, Any]:
    collector = get_collector()
    result = await collector.start()
    return {"ok": result.state == "running", "collector": result.as_dict()}


@router.post("/stop")
async def stop_collector(user: User = Depends(current_user)) -> dict[str, Any]:
    collector = get_collector()
    result = await collector.stop()
    return {"ok": True, "collector": result.as_dict()}


@router.get("/dialogs", response_model=list[DialogItem])
async def list_dialogs(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> list[DialogItem]:
    rows = list(await db.scalars(select(TelegramDialog).order_by(TelegramDialog.created_at)))
    counts = dict(
        (
            await db.execute(
                select(TelegramMessage.dialog_id, func.count()).group_by(TelegramMessage.dialog_id)
            )
        ).all()
    )
    return [
        DialogItem(
            id=row.id,
            chat_id=row.chat_id,
            title=row.title or str(row.chat_id),
            kind=row.kind,
            username=row.username,
            enabled=row.enabled,
            last_message_id=row.last_message_id,
            last_synced_at=row.last_synced_at,
            messages=int(counts.get(row.id, 0)),
        )
        for row in rows
    ]


@router.get("/discover", response_model=list[DiscoveryItem])
async def discover_dialogs(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> list[DiscoveryItem]:
    """List the chats this account is in, so the operator can pick the 4 groups.

    Requires a running collector: discovery reads Telegram directly instead of
    guessing from the database.
    """

    collector = get_collector()
    client = collector._client  # noqa: SLF001 - deliberate read-only peek
    if client is None or not collector.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "采集器未运行，先启动 Telegram 采集")
    try:
        chats = await client.get_dialogs(limit=200)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"读取会话列表失败：{exc}") from exc

    followed = set(await db.scalars(select(TelegramDialog.chat_id)))

    out: list[DiscoveryItem] = []
    for chat in chats:
        chat_id = getattr(chat, "id", None)
        if chat_id is None:
            continue
        entity = getattr(chat, "entity", chat)
        out.append(
            DiscoveryItem(
                chat_id=int(chat_id),
                title=str(getattr(chat, "title", None) or getattr(entity, "title", "") or chat_id),
                kind=_kind_of(entity),
                username=str(getattr(entity, "username", "") or ""),
                followed=int(chat_id) in followed,
            )
        )
    return out


@router.post("/dialogs/{chat_id}/follow")
async def follow_dialog(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    dialog = await db.scalar(select(TelegramDialog).where(TelegramDialog.chat_id == chat_id))
    if dialog is None:
        account = await _primary_account(db)
        if account is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "还没有 Telegram 账号，先完成登录")
        dialog = TelegramDialog(
            account_id=account.id,
            chat_id=chat_id,
            title=str(chat_id),
            kind="group",
        )
        db.add(dialog)
    else:
        dialog.enabled = True
    await db.commit()
    await db.refresh(dialog)
    # Telethon bakes the chat list into the event filter, so the live listener
    # has to be rebuilt or this chat would only start streaming after a restart.
    collector = get_collector()
    if collector.running:
        await collector.refresh_handlers()
    return {"ok": True, "dialog_id": dialog.id, "enabled": dialog.enabled}


@router.delete("/dialogs/{chat_id}/follow")
async def unfollow_dialog(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    dialog = await db.scalar(select(TelegramDialog).where(TelegramDialog.chat_id == chat_id))
    if dialog is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "没有关注这个会话")
    dialog.enabled = False
    await db.commit()
    collector = get_collector()
    if collector.running:
        await collector.refresh_handlers()
    return {"ok": True, "enabled": False}


@router.get("/messages")
async def list_messages(
    limit: int = 50,
    before_id: int | None = None,
    chat_id: int | None = None,
    include_deleted: bool = False,
    include_revisions: bool = False,
    kind: str | None = None,
    since: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """Feed for the timeline page.

    `kind` narrows to what the operator is looking for — `media`, `edited`,
    `deleted` or empty for everything. `since` is an ISO timestamp produced by
    the client so the "today / last 7 days" switch needs no server-side clock
    arithmetic.
    """

    limit = max(1, min(limit, 200))
    stmt = select(TelegramMessage, TelegramDialog.title).join(
        TelegramDialog, TelegramDialog.id == TelegramMessage.dialog_id
    )
    if chat_id is not None:
        stmt = stmt.where(TelegramMessage.chat_id == chat_id)
    if before_id is not None:
        stmt = stmt.where(TelegramMessage.id < before_id)
    if since is not None:
        stmt = stmt.where(TelegramMessage.posted_at >= since)
    if kind == "media":
        stmt = stmt.where(TelegramMessage.media_kind != "")
    elif kind == "edited":
        stmt = stmt.where(TelegramMessage.edited_at.is_not(None))
    elif kind == "deleted":
        include_deleted = True
        stmt = stmt.where(TelegramMessage.deleted_at.is_not(None))
    elif kind:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"未知的消息类型筛选：{kind}")
    if not include_deleted:
        stmt = stmt.where(TelegramMessage.deleted_at.is_(None))
    stmt = stmt.order_by(TelegramMessage.id.desc()).limit(limit)

    rows = (await db.execute(stmt)).all()

    revisions: dict[tuple[int, int], list[MessageRevisionItem]] = {}
    if include_revisions and rows:
        from app.telegram_store import revisions_of

        grouped: dict[int, list[tuple[int, TelegramMessage]]] = {}
        for message, _title in rows:
            grouped.setdefault(message.dialog_id, []).append((message.message_id, message))
        for dialog_id, pairs in grouped.items():
            by_id = await revisions_of(db, dialog_id, [mid for mid, _ in pairs])
            for message_id, history in by_id.items():
                revisions[(dialog_id, message_id)] = [
                    MessageRevisionItem(
                        text=item.text,
                        media_kind=item.media_kind,
                        replaced_at=item.replaced_at,
                    )
                    for item in history
                ]

    items = [
        MessageItem(
            id=message.id,
            chat_id=message.chat_id,
            dialog_title=title or str(message.chat_id),
            message_id=message.message_id,
            sender_name=message.sender_name,
            text=message.text,
            media_kind=message.media_kind,
            posted_at=message.posted_at,
            edited_at=message.edited_at,
            deleted_at=message.deleted_at,
            revisions=revisions.get((message.dialog_id, message.message_id), []),
        ).model_dump()
        for message, title in rows
    ]
    return {"messages": items, "count": len(items)}


@router.post("/sync")
async def sync_now(
    background: BackgroundTasks, user: User = Depends(current_user)
) -> dict[str, Any]:
    """Kick off a catch-up pass and return immediately.

    A chat with 200 unseen messages takes too long to hold an HTTP request open,
    and the browser would time out before the pass finished.
    """

    collector = get_collector()
    if not collector.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "采集器未运行")
    background.add_task(collector.sync_once)
    return {"ok": True, "started_at": utcnow().isoformat()}


def _kind_of(entity: Any) -> str:
    name = type(entity).__name__
    if "Channel" in name:
        return "channel"
    if "Chat" in name:
        return "group"
    if "User" in name:
        return "user"
    return "unknown"
