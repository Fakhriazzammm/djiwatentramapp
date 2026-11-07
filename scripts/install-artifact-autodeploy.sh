#!/usr/bin/env bash
# Install/refresh the pull-only artifact auto-deploy on the Djiwa Tentram VPS. Run ON the VPS:
#
#   sudo bash scripts/install-artifact-autodeploy.sh
#
# Needs /etc/djiwatentramapp/artifact-autodeploy.env (mode 600) containing GITHUB_TOKEN=...
# (fine-grained, read-only Actions on this repo). The token is never written by this script.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "ERROR: jalankan dengan sudo" >&2; exit 2; }
ROOT=/opt/djiwatentramapp
ENV_FILE=/etc/djiwatentramapp/artifact-autodeploy.env
[ "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" = "$ROOT" ] || { echo "ERROR: harus dari $ROOT" >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE belum ada (isi GITHUB_TOKEN=...)" >&2; exit 2; }
grep -q '^GITHUB_TOKEN=.' "$ENV_FILE" || { echo "ERROR: GITHUB_TOKEN kosong di $ENV_FILE" >&2; exit 2; }
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
command -v unzip >/dev/null || { echo "ERROR: unzip belum terpasang" >&2; exit 2; }
install -d -m 755 /var/lib/djiwa-autodeploy
install -m 644 "$ROOT/scripts/systemd/djiwa-artifact-deploy.service" /etc/systemd/system/
install -m 644 "$ROOT/scripts/systemd/djiwa-artifact-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
echo "--- dry check ---"
set -a; . "$ENV_FILE"; set +a
node "$ROOT/scripts/artifact-autodeploy.mjs" --check
systemctl enable --now djiwa-artifact-deploy.timer
systemctl list-timers djiwa-artifact-deploy.timer --no-pager
echo "ARTIFACT_AUTODEPLOY_OK"
