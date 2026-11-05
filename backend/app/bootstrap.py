"""Create the admin account on startup.

Credentials come from ADMIN_PASSWORD; when it is empty a random password is
generated once and printed to the container log, so the first login is possible
without shipping a default password in the repo.
"""

from __future__ import annotations

import logging
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import User
from app.security import hash_password

log = logging.getLogger("aoying.bootstrap")


async def ensure_admin(db: AsyncSession, settings: Settings) -> None:
    existing = await db.scalar(select(User).where(User.username == settings.admin_username))
    if existing is not None:
        return

    password = settings.admin_password
    generated = False
    if not password:
        password = secrets.token_urlsafe(12)
        generated = True

    db.add(
        User(
            username=settings.admin_username,
            password_hash=hash_password(password),
            display_name="管理员",
        )
    )
    await db.commit()

    if generated:
        log.warning(
            "已创建管理员 %s，初始密码：%s（仅本次输出，请立即登录后修改）",
            settings.admin_username,
            password,
        )
        print(
            f"[aoying] initialized admin '{settings.admin_username}' with password: {password}",
            flush=True,
        )
