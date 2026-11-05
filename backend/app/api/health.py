from fastapi import APIRouter
from sqlalchemy import text

from ..db import SessionLocal, engine
from ..events import latest_id

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, object]:
    database = "ok"
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - health must never raise
        database = "error"

    cursor: int | None = None
    if database == "ok":
        try:
            async with SessionLocal() as db:
                cursor = await latest_id(db)
        except Exception:  # noqa: BLE001
            cursor = None

    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": "aoying-monitor",
        "version": "0.2.0",
        "database": database,
        "latest_event_id": cursor,
    }


@router.get("/api/health")
async def api_health() -> dict[str, object]:
    return await healthz()
