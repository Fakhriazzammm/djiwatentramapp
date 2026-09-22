#!/usr/bin/env bash
# Deploy dedicated KOL Marketing workspace to kolmarketing.yumme.id.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
DOMAIN="kolmarketing.yumme.id"
WEBROOT="/var/www/$DOMAIN"
SITE="/etc/nginx/sites-available/kolmarketing"
ENABLED="/etc/nginx/sites-enabled/kolmarketing"
BACKUP_ROOT="/var/backups/$DOMAIN"
STAMP="$(date +%Y%m%d-%H%M%S)"

printf 'Building %s…\n' "$DOMAIN"
bun run --cwd apps/kolmarketing build

for marker in "KOL Marketing" "/functions/v1/kol-public"; do
  if ! python3 - "$marker" <<'PY'
import sys
from pathlib import Path
needle = sys.argv[1]
print(any(needle in p.read_text(errors="ignore") for p in Path("apps/kolmarketing/dist/assets").glob("*.js")))
PY
  then
    printf 'Artifact guard failed: %s\n' "$marker" >&2
    exit 1
  fi
done

if [[ ! -f "$SITE" ]]; then
  printf 'Missing Nginx site config: %s\n' "$SITE" >&2
  exit 1
fi

sudo mkdir -p "$BACKUP_ROOT/$STAMP" "$WEBROOT"
sudo cp -a "$WEBROOT/." "$BACKUP_ROOT/$STAMP/" 2>/dev/null || true
sudo find "$WEBROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
sudo cp -a apps/kolmarketing/dist/. "$WEBROOT/"
sudo chown -R www-data:www-data "$WEBROOT"

if [[ ! -e "$ENABLED" ]]; then
  sudo ln -s "$SITE" "$ENABLED"
fi
sudo nginx -t
sudo systemctl reload nginx

printf 'HTTP %s\n' "$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/")"
printf 'Dashboard %s\n' "$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/dashboard")"
printf 'Data %s\n' "$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/data")"
printf 'Settings %s\n' "$(curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN/settings")"
printf 'Backup %s\n' "$BACKUP_ROOT/$STAMP"
