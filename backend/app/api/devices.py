"""Device registry and the event feed the client pages through."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.events import append_event, latest_id, replay
from app.models import Device, User
from app.security import current_user

router = APIRouter(prefix="/api", tags=["devices"])


class DeviceItem(BaseModel):
    id: int
    name: str
    platform: str
    fingerprint: str
    app_version: str
    push_mode: str
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None


async def _owned_device(db: AsyncSession, user: User, device_id: int) -> Device:
    device = await db.scalar(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "设备不存在")
    return device


@router.get("/devices", response_model=list[DeviceItem])
async def list_devices(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> list[DeviceItem]:
    rows = await db.scalars(
        select(Device).where(Device.user_id == user.id).order_by(Device.last_seen_at.desc())
    )
    return [
        DeviceItem(
            id=row.id,
            name=row.name,
            platform=row.platform,
            fingerprint=row.fingerprint,
            app_version=row.app_version,
            push_mode=row.push_mode,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            revoked_at=row.revoked_at,
        )
        for row in rows
    ]


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, bool]:
    device = await _owned_device(db, user, device_id)
    if device.revoked_at is None:
        device.revoked_at = datetime.now(UTC)
        await db.commit()
        await append_event(
            db,
            "device.revoked",
            {"device_id": device.id, "name": device.name, "platform": device.platform},
        )
    return {"ok": True}


@router.get("/events")
async def list_events(
    after: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, object]:
    limit = max(1, min(limit, 200))
    events = await replay(db, after, limit)
    return {
        "events": events,
        "count": len(events),
        "latest_id": await latest_id(db),
    }


@router.post("/events/test")
async def publish_test_event(
    db: AsyncSession = Depends(get_db), user: User = Depends(current_user)
) -> dict[str, object]:
    """Emit one event so the delivery path can be exercised before I2 exists."""
    event = await append_event(
        db,
        "system.test",
        {
            "title": "测试提醒",
            "detail": "如果你在手机上收到了这条通知，说明推送链路是通的。",
            "level": "info",
            "triggered_by": user.username,
        },
    )
    return {"ok": True, "event": event}
