"""Create a code-only release; never include databases, credentials or TG sessions."""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sources = [root / "backend/pyproject.toml"]
    for directory in ("backend/app", "backend/tests"):
        sources.extend(sorted((root / directory).rglob("*.py")))
    dist = root / "web/dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("Build Web first: dist/index.html is missing")
    sources.extend(sorted(path for path in dist.rglob("*") if path.is_file()))
    if args.output.exists():
        raise SystemExit("Output already exists; choose a new release archive name")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.output, "w:gz") as archive:
        for path in sources:
            if path.is_symlink():
                raise SystemExit("Refusing a symlink in release inputs")
            archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
    print(json.dumps({"files": len(sources), "bytes": args.output.stat().st_size,
                      "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
                      "persistent_data_included": False}))


if __name__ == "__main__":
    main()
