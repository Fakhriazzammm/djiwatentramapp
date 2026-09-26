#!/bin/sh
set -eu

ENV_FILE="/opt/supabase-selfhost/.env"
ENDPOINT="https://supabase.yumme.id/functions/v1/pos-notifications"

[ -r "$ENV_FILE" ] || exit 0
SERVICE_KEY="$(grep -E '^(YUMI_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$SERVICE_KEY" ] || exit 0

curl --fail --silent --show-error --max-time 45 \
  -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  --data '{"action":"sync_recent"}' \
  >/dev/null
