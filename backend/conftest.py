"""Shared pytest setup.

The app is a single global object whose engine is built at import time, so the
database URL must be set before `app.main` is imported anywhere.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / ".vendor"
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))
sys.path.insert(0, str(ROOT))

_TMP = Path(tempfile.mkdtemp(prefix="aoying-test-"))
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}")
os.environ.setdefault("JWT_SECRET", "test-secret-key-not-for-production-use")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "test-password-123")
