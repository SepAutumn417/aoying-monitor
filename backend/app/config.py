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

    Deliberately plain Pydantic instead of pydantic-settings: the deployment
    image installs both, but the local Windows sandbox only has Pydantic, and
    the surface here is small enough that the extra dependency buys nothing.
    """

    app_env: str = os.getenv("APP_ENV", "dev")
    app_name: str = os.getenv("APP_NAME", "aoying-monitor")
    app_version: str = "0.2.0"

    # Postgres in Docker; SQLite for a laptop run and for the test suite.
    database_url: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./aoying.db")

    jwt_secret: str = os.getenv("JWT_SECRET", "dev-only-change-me")
    jwt_issuer: str = "aoying-monitor"
    access_token_ttl_minutes: int = int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "30"))
    refresh_token_ttl_days: int = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "30"))
    ws_ticket_ttl_seconds: int = int(os.getenv("WS_TICKET_TTL_SECONDS", "60"))

    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "")

    cors_origins: list[str] = _env_list(
        "CORS_ORIGINS",
        ["http://localhost:5173", "http://127.0.0.1:5173"],
    )

    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
