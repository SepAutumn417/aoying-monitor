"""Fetch backend dependencies without pip.

The Windows host this project is developed on has two problems that make
`pip install` unusable:

* `pip` unpacks into a `tempfile.mkdtemp()` directory (mode 0700) and this host
  denies every later operation on such a directory, so installs die with
  `PermissionError` on the wheel metadata;
* `backend/.vendor/` (an older vendored copy) has an ACL that denies reads, so
  tests cannot import from it either.

This script does the minimum `pip install --target` would do: resolve each
requirement against the PyPI JSON API, pick the wheel matching the running
interpreter, download it, and unzip it into `backend/.pylib`. `conftest.py`
puts that directory on `sys.path` when it exists.

Usage::

    python scripts/fetch_deps.py                # default set below
    python scripts/fetch_deps.py sqlalchemy aiosqlite
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "backend" / ".pylib"

# Only packages that are missing from the host interpreter. Everything else
# (fastapi, pydantic, pyjwt, bcrypt, httpx, pytest, telethon) is already there.
DEFAULT_REQUIREMENTS = ["sqlalchemy"]

WHEEL_CACHE = ROOT / ".tools" / "tmp" / "wheel"


def _platform_tags() -> list[str]:
    """Wheel tags that can be installed on the running interpreter, best first."""
    tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
    if sys.platform == "win32":
        arch = "win_amd64" if sys.maxsize > 2**32 else "win32"
        platforms = [arch]
    elif sys.platform == "darwin":
        platforms = ["macosx_11_0_arm64", "macosx_11_0_x86_64"]
    else:
        arch = "aarch64" if os.uname().machine in {"aarch64", "arm64"} else "x86_64"
        platforms = [f"manylinux_2_17_{arch}", f"manylinux2014_{arch}", f"linux_{arch}"]

    tags = [f"{tag}-{tag}-{platform}" for platform in platforms]
    tags.append("py3-none-any")
    return tags


def _pick_wheel(spec: str) -> dict[str, str]:
    package, _, version = spec.partition("==")
    url = f"https://pypi.org/pypi/{package}/{version}/json" if version else (
        f"https://pypi.org/pypi/{package}/json"
    )
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = json.load(response)

    tags = _platform_tags()
    files = payload["urls"]
    for wanted in tags:
        for item in files:
            if not item["filename"].endswith(".whl"):
                continue
            if item["filename"].endswith(f"-{wanted}.whl"):
                return {"url": item["url"], "filename": item["filename"]}
    available = ", ".join(item["filename"] for item in files if item["filename"].endswith(".whl"))
    raise SystemExit(f"{package}: no wheel for {tags[0]}. candidates: {available}")


def _download(url: str, filename: str) -> Path:
    WHEEL_CACHE.mkdir(parents=True, exist_ok=True)
    destination = WHEEL_CACHE / filename
    if destination.is_file() and destination.stat().st_size > 0:
        return destination
    with urllib.request.urlopen(url, timeout=120) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    return destination


def install(package: str) -> None:
    wheel = _pick_wheel(package)
    archive = _download(wheel["url"], wheel["filename"])
    TARGET.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(TARGET)
    print(f"{package}: {wheel['filename']} -> {TARGET}")


def main(argv: list[str]) -> int:
    for package in argv or DEFAULT_REQUIREMENTS:
        install(package)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
