"""Shared pytest setup.

The app is a single global object whose engine is built at import time, so the
database URL must be set before `app.main` is imported anywhere.

Two host quirks are handled here rather than in the test bodies:

* `backend/.vendor/` is a vendored dependency copy that may be unreadable on
  this machine (an ACL denies every operation). It is only added to `sys.path`
  when it can actually be read, otherwise importing `typing_extensions` from it
  would abort test collection.
* `tempfile.mkdtemp()` creates directories with mode 0700, and this host then
  denies writing into them. The test database lives in a plain directory inside
  the repo instead.
"""

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _readable(path: Path) -> bool:
    """True when the directory can be listed *and* its contents can be read.

    `.vendor` on this host lists fine but denies reads, so listing alone is not
    enough to decide whether putting it on `sys.path` is safe.
    """

    try:
        entries = list(path.iterdir())
    except OSError:
        return False
    if not entries:
        return False

    target = next((entry for entry in entries if entry.is_file()), None)
    if target is None:
        # Wheel-installed packages are directories; probe inside one of them.
        package = next((entry for entry in entries if entry.is_dir()), None)
        if package is None:
            return False
        try:
            target = next(item for item in package.iterdir() if item.is_file())
        except (StopIteration, OSError):
            return False

    try:
        with target.open("rb") as handle:
            handle.read(1)
    except OSError:
        return False
    return True


# `scripts/fetch_deps.py` installs the packages the host interpreter lacks here.
PYLIB = ROOT / ".pylib"
if PYLIB.is_dir() and _readable(PYLIB):
    sys.path.insert(0, str(PYLIB))

VENDOR = ROOT / ".vendor"
if VENDOR.is_dir() and _readable(VENDOR):
    sys.path.insert(0, str(VENDOR))

sys.path.insert(0, str(ROOT))

# A repo-local temp dir avoids the mode-0700 mkdtemp trap described above.
_TMP = ROOT / ".pytest-tmp"
if _TMP.exists():
    shutil.rmtree(_TMP, ignore_errors=True)
_TMP.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}")
os.environ.setdefault("JWT_SECRET", "test-secret-key-not-for-production-use")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-password-123")

import asyncio  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Any:
    """Create the tables once for tests that touch the database directly.

    Tests driving the API get this for free from the app lifespan, but the
    collector tests seed rows without starting the app. The engine is disposed
    afterwards so SQLAlchemy does not warn about pooled connections at teardown.
    """
    from app.db import create_all, engine

    asyncio.run(create_all())
    yield
    asyncio.run(engine.dispose())
    shutil.rmtree(_TMP, ignore_errors=True)
