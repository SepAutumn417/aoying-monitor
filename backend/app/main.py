from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.devices import router as devices_router
from app.api.health import router as health_router
from app.api.telegram import router as telegram_router
from app.api.ws import router as ws_router
from app.bootstrap import ensure_admin
from app.config import get_settings
from app.db import SessionLocal, create_all
from app.telegram_collector import get_collector

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await create_all()
    async with SessionLocal() as db:
        await ensure_admin(db, settings)
    if settings.tg_auto_start:
        # Starting the collector is opt-in: without credentials it would only
        # add noise to the logs on every boot.
        await get_collector().start()
    yield
    await get_collector().stop()


app = FastAPI(title="AOYING Monitor API", version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(telegram_router)
app.include_router(ws_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": settings.app_name, "version": settings.app_version}
