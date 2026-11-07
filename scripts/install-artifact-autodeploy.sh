#!/usr/bin/env bash
# Install/refresh the pull-only artifact auto-deploy on the Djiwa Tentram VPS. Run ON the VPS:
#   sudo bash scripts/install-artifact-autodeploy.sh
# No token needed: the VPS reads the public git head and only publishes artifacts uploaded by
# scripts/ship-artifacts.sh from a separate build machine.
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "ERROR: jalankan dengan sudo" >&2; exit 2; }
ROOT=/opt/djiwatentramapp
[ "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" = "$ROOT" ] || { echo "ERROR: harus dari $ROOT" >&2; exit 2; }
command -v node >/dev/null && command -v git >/dev/null || { echo "ERROR: node dan git diperlukan" >&2; exit 2; }
install -d -m 755 -o ubuntu -g ubuntu /var/lib/djiwa-autodeploy /var/lib/djiwa-autodeploy/incoming
install -m 644 "$ROOT/scripts/systemd/djiwa-artifact-deploy.service" /etc/systemd/system/
install -m 644 "$ROOT/scripts/systemd/djiwa-artifact-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
echo "--- dry check ---"
node "$ROOT/scripts/artifact-autodeploy.mjs" --check
systemctl enable --now djiwa-artifact-deploy.timer
systemctl list-timers djiwa-artifact-deploy.timer --no-pager
echo "ARTIFACT_AUTODEPLOY_OK"
