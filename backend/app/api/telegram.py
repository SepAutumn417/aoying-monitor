"""Telegram source API: status, dialog discovery, follow/unfollow, messages.

The collector is a background singleton; these endpoints are how the operator
sees whether it is alive and which chats it is actually following.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User, utcnow
from app.security import current_user
from app.telegram_collector import get_collector
from app.telegram_models import TelegramAccount, TelegramDialog, TelegramMessage, TelegramTopic
from app.telegram_topics import (
    OWNER_ID,
    SIGNAL_BOT_ID,
    TARGET_CHAT_ID,
    ensure_topics,
    sender_role,
    topic_title,
)

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


class TopicItem(BaseModel):
    id: int
    chat_id: int
    topic_id: int
    title: str
    enabled: bool
    last_message_id: int
    last_synced_at: datetime | None
    messages: int = 0
    last_error: str = ""


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
    sender_id: int | None = None
    topic_id: int | None = None
    topic_title: str = "未分类"
    sender_role: str = "member"
    reply_to: int | None = None
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
    account_id = get_collector().account_id
    if account_id is not None:
        return await db.get(TelegramAccount, account_id)
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


@router.get("/topics", response_model=list[TopicItem])
async def list_topics(
    chat_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[TopicItem]:
    account = await _primary_account(db)
    if account is None:
        return []
    stmt = (
        select(TelegramTopic, TelegramDialog.chat_id)
        .join(TelegramDialog, TelegramDialog.id == TelegramTopic.dialog_id)
        .where(TelegramDialog.account_id == account.id)
    )
    if chat_id is not None:
        stmt = stmt.where(TelegramDialog.chat_id == chat_id)
    rows = (await db.execute(stmt.order_by(TelegramTopic.topic_id))).all()
    counts: dict[tuple[int, int | None], int] = {}
    for dialog_id, topic_id, count in (
        await db.execute(
            select(TelegramMessage.dialog_id, TelegramMessage.topic_id, func.count()).group_by(
                TelegramMessage.dialog_id, TelegramMessage.topic_id
            )
        )
    ).all():
        counts[(dialog_id, topic_id)] = count
    return [
        TopicItem(
            id=row.id,
            chat_id=chat,
            topic_id=row.topic_id,
            title=row.title,
            enabled=row.enabled,
            last_message_id=row.last_message_id,
            last_synced_at=row.last_synced_at,
            last_error=row.last_error,
            messages=counts.get((row.dialog_id, row.topic_id), 0),
        )
        for row, chat in rows
    ]


@router.get("/discover", response_model=list[DiscoveryItem])
async def discover_dialogs(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> list[DiscoveryItem]:
    """Read only the approved forum; never enumerate unrelated private chats."""

    collector = get_collector()
    client = collector._client  # noqa: SLF001 - deliberate read-only peek
    if client is None or not collector.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "采集器未运行，先启动 Telegram 采集")
    try:
        entity = await client.get_entity(TARGET_CHAT_ID)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"读取会话列表失败：{exc}") from exc

    followed = set(await db.scalars(select(TelegramDialog.chat_id)))

    return [
        DiscoveryItem(
            chat_id=TARGET_CHAT_ID,
            title=str(getattr(entity, "title", "") or "熬鹰书友会"),
            kind=_kind_of(entity),
            username=str(getattr(entity, "username", "") or ""),
            followed=TARGET_CHAT_ID in followed,
        )
    ]


@router.post("/dialogs/{chat_id}/follow")
async def follow_dialog(
    chat_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    if chat_id != TARGET_CHAT_ID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "当前只允许关注熬鹰书友会")
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
    await ensure_topics(db, dialog)
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
    topic_id: int | None = None,
    focus: str | None = None,
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

    if focus not in (None, "all", "important", "owner"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"未知的重点筛选：{focus}")
    account = await _primary_account(db)
    if account is None:
        return {"messages": [], "count": 0}
    limit = max(1, min(limit, 200))
    stmt = (
        select(TelegramMessage, TelegramDialog.title)
        .join(TelegramDialog, TelegramDialog.id == TelegramMessage.dialog_id)
        .where(TelegramDialog.account_id == account.id)
    )
    if topic_id is not None:
        stmt = stmt.where(TelegramMessage.topic_id == topic_id)
    if focus in ("important", "owner"):
        stmt = stmt.where(TelegramMessage.chat_id == TARGET_CHAT_ID)
        if focus == "owner":
            stmt = stmt.where(TelegramMessage.sender_id == OWNER_ID)
        else:
            stmt = stmt.where(
                or_(
                    and_(
                        TelegramMessage.topic_id == 926111,
                        TelegramMessage.sender_id == SIGNAL_BOT_ID,
                    ),
                    and_(
                        TelegramMessage.topic_id.in_([1, 748]),
                        TelegramMessage.sender_id == OWNER_ID,
                    ),
                )
            )
    if chat_id is not None:
        stmt = stmt.where(TelegramMessage.chat_id == chat_id)
    sort_time = func.coalesce(TelegramMessage.posted_at, TelegramMessage.created_at)
    if before_id is not None:
        cursor = await db.scalar(
            select(TelegramMessage)
            .join(TelegramDialog, TelegramDialog.id == TelegramMessage.dialog_id)
            .where(TelegramDialog.account_id == account.id, TelegramMessage.id == before_id)
        )
        if cursor is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "无效的消息分页游标")
        cursor_time = cursor.posted_at or cursor.created_at
        stmt = stmt.where(
            or_(
                sort_time < cursor_time,
                and_(sort_time == cursor_time, TelegramMessage.id < before_id),
            )
        )
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
    stmt = stmt.order_by(sort_time.desc(), TelegramMessage.id.desc()).limit(limit)

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
            sender_id=message.sender_id,
            sender_role=sender_role(message.chat_id, message.sender_id),
            topic_id=message.topic_id,
            topic_title=topic_title(message.chat_id, message.topic_id),
            reply_to=message.reply_to,
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
