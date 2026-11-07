from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def create_all() -> None:
    """Create tables when no migration runner has been applied yet.

    The deployment path uses Alembic; this keeps `uvicorn app.main:app` usable
    on a bare laptop and inside the test suite without a migration step.
    """
    from app import telegram_models  # noqa: F401 - register ingestion tables
    from app.copy_models import (  # noqa: F401 - signal + shadow book
        CopyIntent,
        CopyPosition,
        Position,
        PositionEvent,
        Signal,
    )
    from app.models import Base
    from app.telegram_migrations import upgrade_telegram_schema

    async with engine.begin() as conn:
        await conn.run_sync(upgrade_telegram_schema)
        await conn.run_sync(Base.metadata.create_all)
