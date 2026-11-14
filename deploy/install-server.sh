#!/usr/bin/env bash
set -euo pipefail
umask 077
base=/opt/aoying-monitor
release="$base/releases/20261110-0940"
# Never replace persistent database/config on a repeat deployment.
id aoying >/dev/null 2>&1 || useradd --system --home-dir /var/lib/aoying --shell /usr/sbin/nologin aoying
install -d -m 755 "$base/releases" "$release" /var/lib/aoying-downloads
install -d -m 700 -o aoying -g aoying /var/lib/aoying /var/lib/aoying/media
install -d -m 750 -o root -g aoying /etc/aoying
if [ -e "$release/backend/pyproject.toml" ]; then echo 'Release already extracted'; else
    tar -xzf /root/aoying-deploy/application.tar.gz -C "$release"
fi
if [ ! -e /var/lib/aoying/aoying.db ]; then
    install -m 600 -o aoying -g aoying "$release/initial-data/aoying.db" /var/lib/aoying/aoying.db
fi
if [ ! -e /etc/aoying/production.env ]; then
    install -m 640 -o root -g aoying "$release/initial-data/production.env" /etc/aoying/production.env
fi
# Source files are readable by the service and nginx; initial-data stays root-only.
chmod 755 "$base" "$base/releases" "$release" "$release/backend"
find "$release/backend/app" "$release/backend/tests" "$release/web" -type d -exec chmod 755 {} +
find "$release/backend/app" "$release/backend/tests" "$release/web" -type f -exec chmod 644 {} +
python3 -m venv "$base/venv"
"$base/venv/bin/python" -m pip install --disable-pip-version-check --no-cache-dir "$release/backend[dev]" python-dotenv
chmod -R a+rX "$base/venv"
# Single worker is intentional: in-process WS fanout and one Telegram collector.
ln -sfn "$release" "$base/current"
install -m 644 /root/aoying-deploy/aoying-api.service /etc/systemd/system/aoying-api.service
systemctl daemon-reload
systemctl enable --now aoying-api.service
curl --fail --silent --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:8000/healthz
backup=/root/aoying-deploy/nginx-https.before-20261110
if [ ! -e "$backup" ]; then cp -L /etc/nginx/sites-enabled/aoying-https "$backup"; fi
install -m 644 /root/aoying-deploy/nginx-https.conf /etc/nginx/sites-available/aoying-https
nginx -t
systemctl reload nginx
systemctl is-active aoying-api nginx
