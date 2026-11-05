import os
from functools import lru_cache

from pydantic import BaseModel


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [part.strip() for part in raw.split(",") if part.strip()]


class Settings(BaseModel):
    """Runtime configuration, loaded from environment.

    I0 uses the already-installed Pydantic rather than pydantic-settings so the
    scaffold can run inside the current Windows sandbox. The settings surface is
    intentionally identical to the later pydantic-settings version.
    """

    app_env: str = os.getenv("APP_ENV", "dev")
    app_name: str = os.getenv("APP_NAME", "aoying-monitor")
    app_version: str = "0.1.0"
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://aoying:aoying@localhost:5432/aoying",
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-only-change-me")
    cors_origins: list[str] = _env_list(
        "CORS_ORIGINS",
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
