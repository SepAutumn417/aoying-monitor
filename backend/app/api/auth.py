"""Login, refresh, logout and the single-use websocket ticket."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.events import append_event
from app.models import Device, DeviceSession, User, WsTicket, utcnow
from app.security import (
    create_access_token,
    current_user,
    hash_secret,
    new_secret,
    verify_password,
)

router = APIRouter(prefix="/api", tags=["auth"])


class DevicePayload(BaseModel):
    name: str = Field(default="未命名设备", max_length=80)
    platform: str = Field(default="android", max_length=24)
    fingerprint: str = Field(default="", max_length=128)
    app_version: str = Field(default="", max_length=32)
    push_mode: str = Field(default="local", max_length=24)


class LoginPayload(BaseModel):
    username: str
    password: str
    device: DevicePayload = Field(default_factory=DevicePayload)


class RefreshPayload(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str

    @classmethod
    def of(cls, user: User) -> UserOut:
        return cls(id=user.id, username=user.username, display_name=user.display_name)


class DeviceOut(BaseModel):
    id: int
    name: str
    platform: str
    fingerprint: str
    app_version: str
    push_mode: str
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None

    @classmethod
    def of(cls, device: Device) -> DeviceOut:
        return cls(
            id=device.id,
            name=device.name,
            platform=device.platform,
            fingerprint=device.fingerprint,
            app_version=device.app_version,
            push_mode=device.push_mode,
            created_at=device.created_at,
            last_seen_at=device.last_seen_at,
            revoked_at=device.revoked_at,
        )


class SessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    user: UserOut
    device: DeviceOut


class TicketOut(BaseModel):
    ticket: str
    expires_in: int
    ws_url: str


async def _resolve_device(
    db: AsyncSession, user: User, payload: DevicePayload, request: Request
) -> Device:
    """Reuse the row for a known fingerprint, otherwise register a new device."""
    device: Device | None = None
    if payload.fingerprint:
        device = await db.scalar(
            select(Device).where(
                Device.user_id == user.id,
                Device.fingerprint == payload.fingerprint,
            )
        )
    if device is None:
        device = Device(
            user_id=user.id,
            name=payload.name or "未命名设备",
            platform=payload.platform or "android",
            fingerprint=payload.fingerprint,
            app_version=payload.app_version,
            push_mode=payload.push_mode or "local",
        )
        db.add(device)
        await db.flush()
        await append_event(
            db,
            "device.registered",
            {
                "device_id": device.id,
                "name": device.name,
                "platform": device.platform,
                "user_agent": request.headers.get("user-agent", "")[:200],
            },
        )
    else:
        device.name = payload.name or device.name
        device.platform = payload.platform or device.platform
        device.app_version = payload.app_version or device.app_version
        device.push_mode = payload.push_mode or device.push_mode
        device.last_seen_at = utcnow()
        if device.revoked_at is not None:
            device.revoked_at = None
    return device


def _issue_refresh(
    db: AsyncSession, user: User, device: Device, request: Request, settings: Settings
) -> str:
    raw = new_secret(32)
    db.add(
        DeviceSession(
            user_id=user.id,
            device_id=device.id,
            token_hash=hash_secret(raw),
            user_agent=request.headers.get("user-agent", "")[:200],
            expires_at=utcnow() + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    return raw


@router.post("/auth/login", response_model=SessionOut)
async def login(
    payload: LoginPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SessionOut:
    user = await db.scalar(select(User).where(User.username == payload.username.strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        # Same message for both branches so the endpoint cannot enumerate users.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码不正确")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "账号已停用")

    device = await _resolve_device(db, user, payload.device, request)
    access, expires_in = create_access_token(user.id, user.username, settings)
    refresh_raw = _issue_refresh(db, user, device, request, settings)
    await db.commit()
    await db.refresh(device)
    return SessionOut(
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh_raw,
        user=UserOut.of(user),
        device=DeviceOut.of(device),
    )


@router.post("/auth/refresh", response_model=SessionOut)
async def refresh(
    payload: RefreshPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SessionOut:
    session = await db.scalar(
        select(DeviceSession).where(DeviceSession.token_hash == hash_secret(payload.refresh_token))
    )
    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已失效，请重新登录")

    user = await db.get(User, session.user_id)
    device = await db.get(Device, session.device_id)
    if user is None or not user.is_active or device is None or device.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "登录已失效，请重新登录")

    # Rotation: the presented token dies with this request.
    session.revoked_at = now
    device.last_seen_at = utcnow()
    access, expires_in = create_access_token(user.id, user.username, settings)
    refresh_raw = _issue_refresh(db, user, device, request, settings)
    await db.commit()
    return SessionOut(
        access_token=access,
        expires_in=expires_in,
        refresh_token=refresh_raw,
        user=UserOut.of(user),
        device=DeviceOut.of(device),
    )


@router.post("/auth/logout")
async def logout(
    payload: RefreshPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_user),
) -> dict[str, bool]:
    session = await db.scalar(
        select(DeviceSession).where(
            DeviceSession.token_hash == hash_secret(payload.refresh_token),
            DeviceSession.user_id == user.id,
        )
    )
    if session is not None and session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        await db.commit()
    return {"ok": True}


@router.get("/auth/me")
async def me(user: User = Depends(current_user)) -> dict[str, object]:
    return {"user": UserOut.of(user).model_dump()}


@router.post("/ws/ticket", response_model=TicketOut)
async def issue_ticket(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: User = Depends(current_user),
) -> TicketOut:
    device = await db.scalar(
        select(Device)
        .where(Device.user_id == user.id, Device.revoked_at.is_(None))
        .order_by(Device.last_seen_at.desc())
        .limit(1)
    )
    if device is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "请先登录一台设备")

    raw = new_secret(24)
    db.add(
        WsTicket(
            user_id=user.id,
            device_id=device.id,
            ticket=hash_secret(raw),
            expires_at=utcnow() + timedelta(seconds=settings.ws_ticket_ttl_seconds),
        )
    )
    await db.commit()

    scheme = "wss" if request.url.scheme == "https" else "ws"
    host = request.headers.get("host", request.url.netloc)
    return TicketOut(
        ticket=raw,
        expires_in=settings.ws_ticket_ttl_seconds,
        ws_url=f"{scheme}://{host}/ws?ticket={raw}",
    )
