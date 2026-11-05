from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "aoying-monitor",
        "version": "0.1.0",
    }


@router.get("/api/health")
async def api_health() -> dict[str, str]:
    # I0 deliberately does not touch the database yet; I1 adds real checks.
    return {"status": "ok", "database": "not_checked"}
