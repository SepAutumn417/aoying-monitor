#!/usr/bin/env bash
# Code-only updates: never import environment, sessions or a replacement database.
set -euo pipefail
archive=${1:?archive required}
release_name=${2:?release name required}
sha=${3:?sha256 required}
[[ "$archive" == /root/aoying-deploy/*.tar.gz && "$release_name" =~ ^[0-9]{8}-[0-9]{4}-[a-z0-9-]+$ && "$sha" =~ ^[a-f0-9]{64}$ ]] || exit 2
root=/opt/aoying-monitor
release="$root/releases/$release_name"
old=$(readlink -f "$root/current")
[[ "$old" == "$root/releases/"* && -d "$old" && ! -e "$release" ]] || exit 3
printf '%s  %s\n' "$sha" "$archive" | sha256sum --check --status
# A consistent backup is made before touching the running release.
backup="/root/aoying-deploy/before-$release_name.db"
[[ ! -e "$backup" ]] || exit 4
python3 - "$archive" "$release" "$backup" <<'PY'
import pathlib, sqlite3, sys, tarfile
archive, release, backup = map(pathlib.Path, sys.argv[1:])
with tarfile.open(archive) as tf:
    entries = tf.getmembers()
    for entry in entries:
        name = entry.name
        p = pathlib.PurePosixPath(name)
        allowed = name == 'backend/pyproject.toml' or name.startswith(('backend/app/', 'backend/tests/', 'web/dist/'))
        if not entry.isfile() or p.is_absolute() or '..' in p.parts or not allowed:
            raise SystemExit('archive contains an unexpected member')
    with sqlite3.connect('file:/var/lib/aoying/aoying.db?mode=ro', uri=True) as source:
        with sqlite3.connect(backup) as dest:
            source.backup(dest)
            if dest.execute('PRAGMA quick_check').fetchone() != ('ok',):
                raise SystemExit('database backup integrity failed')
    backup.chmod(0o600)
    release.mkdir(mode=0o755)
    tf.extractall(release, filter='data')
PY
chown -R root:root "$release"
chmod -R a+rX "$release"
switch_release() {
  python3 - "$root" "$1" <<'PY'
import os, pathlib, sys
root, target = map(pathlib.Path, sys.argv[1:])
current, pending = root / 'current', root / 'current.next'
# Explicitly verify the absolute replacement targets, never follow an arbitrary link.
assert str(root) == '/opt/aoying-monitor'
assert current.is_symlink() and current.resolve().is_relative_to(root / 'releases')
assert target.is_dir() and target.resolve().is_relative_to(root / 'releases')
assert not pending.exists() and not pending.is_symlink()
pending.symlink_to(target)
os.replace(pending, current)
PY
}
rollback() {
  status=$?
  trap - ERR
  printf 'Update failed; restoring %s\n' "$old" >&2
  switch_release "$old"
  systemctl restart aoying-api
  exit "$status"
}
trap rollback ERR
switch_release "$release"
systemctl restart aoying-api
curl -fsS --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:8000/healthz
systemctl is-active --quiet aoying-api
curl -fsS https://64.176.50.42/healthz
trap - ERR
printf '\nrelease=%s\nprevious=%s\nbackup=%s\n' "$release" "$old" "$backup"
