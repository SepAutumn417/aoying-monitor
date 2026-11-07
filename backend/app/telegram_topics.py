"""Verified forum scope and pure Telegram metadata helpers."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.telegram_models import TelegramDialog, TelegramTopic

TARGET_CHAT_ID = -1002568478710
TOPICS = {1: "聊天群", 748: "禁言群", 926111: "熬鹰交易信号推送", 1006930: "消息通知"}
OWNER_ID = 7460753506
SIGNAL_BOT_ID = 8797733775
ASSISTANT_ID = 8907156644


def topic_id_of(message: Any) -> int | None:
    if type(getattr(message, "action", None)).__name__ == "MessageActionTopicCreate":
        return getattr(message, "id", None)
    header = getattr(message, "reply_to", None)
    if header is None or not getattr(header, "forum_topic", False):
        return 1
    return getattr(header, "reply_to_top_id", None) or getattr(header, "reply_to_msg_id", None)


def sender_role(chat_id: int, sender_id: int | None) -> str:
    if chat_id != TARGET_CHAT_ID:
        return "member"
    return {OWNER_ID: "owner", SIGNAL_BOT_ID: "signal_bot", ASSISTANT_ID: "assistant"}.get(
        sender_id, "member"
    )


def topic_title(chat_id: int, topic_id: int | None) -> str:
    return TOPICS.get(topic_id, "未分类") if chat_id == TARGET_CHAT_ID else "未分类"


async def ensure_topics(db: AsyncSession, dialog: TelegramDialog) -> list[TelegramTopic]:
    if dialog.chat_id != TARGET_CHAT_ID:
        return []
    rows = list(await db.scalars(select(TelegramTopic).where(TelegramTopic.dialog_id == dialog.id)))
    known = {row.topic_id for row in rows}
    for topic_id, title in TOPICS.items():
        if topic_id not in known:
            row = TelegramTopic(dialog_id=dialog.id, topic_id=topic_id, title=title)
            db.add(row)
            rows.append(row)
    await db.commit()
    return rows
