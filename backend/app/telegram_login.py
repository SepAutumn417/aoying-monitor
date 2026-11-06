"""One-time Telegram login helper.

Run this on the server, not through the API: `python -m app.telegram_login`.
It writes `data/telegram.session`, which the collector then opens without ever
needing the login code again. Nothing here is reachable from the web UI, so the
verification code never travels over HTTP.
"""

from __future__ import annotations

import asyncio
import getpass
import os
import sys
from pathlib import Path

from app.config import get_settings
from app.db import SessionLocal, create_all
from app.models import utcnow
from app.telegram_models import TelegramAccount


async def main() -> int:
    settings = get_settings()
    if not settings.tg_api_id or not settings.tg_api_hash:
        print("缺少 TG_API_ID / TG_API_HASH。先到 https://my.telegram.org 申请，再写进 .env。")
        return 2

    try:
        from telethon import TelegramClient
    except ModuleNotFoundError:
        print("没有安装 telethon：pip install -e '.[telegram]'")
        return 2

    session_path = Path(settings.tg_session_path)
    session_path.parent.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(str(session_path), settings.tg_api_id, settings.tg_api_hash)

    await client.connect()
    if not await client.is_user_authorized():
        phone = os.getenv("TG_PHONE") or input("手机号（含国际区号，如 +8613800000000）：").strip()
        await client.send_code_request(phone)
        code = os.getenv("TG_CODE") or input("验证码：").strip()
        try:
            await client.sign_in(phone, code)
        except Exception as exc:  # noqa: BLE001 - 2FA is a normal branch, not a crash
            if "password" in str(exc).lower() or type(exc).__name__ == "SessionPasswordNeededError":
                password = os.getenv("TG_2FA") or getpass.getpass("两步验证密码：")
                await client.sign_in(password=password)
            else:
                print(f"登录失败：{exc}")
                return 1

    me = await client.get_me()
    dialogs = await client.get_dialogs(limit=200)

    await create_all()
    async with SessionLocal() as db:
        from sqlalchemy import select

        account = await db.scalar(select(TelegramAccount).order_by(TelegramAccount.id).limit(1))
        if account is None:
            account = TelegramAccount()
            db.add(account)
        account.label = "主账号"
        account.phone = getattr(me, "phone", "") or ""
        account.session_path = str(session_path)
        account.tg_user_id = getattr(me, "id", None)
        account.tg_username = getattr(me, "username", "") or ""
        account.display_name = " ".join(
            part for part in [getattr(me, "first_name", ""), getattr(me, "last_name", "")] if part
        )
        account.is_enabled = True
        account.last_connected_at = utcnow()
        account.last_error = ""
        await db.commit()

    print(f"已登录：{getattr(me, 'first_name', '')} @{getattr(me, 'username', '')}")
    print(f"会话文件：{session_path}")
    print(f"可加入的会话 {len(dialogs)} 个，前 20 个：")
    for chat in dialogs[:20]:
        title = getattr(chat, "title", None) or getattr(chat.entity, "title", "") or ""
        print(f"  {getattr(chat, 'id', 0):>16}  {title}")

    await client.disconnect()
    print("\n下一步：在网页「数据源 → Telegram」里勾选要跟的群，然后启动采集。")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
