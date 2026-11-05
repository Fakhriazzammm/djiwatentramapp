#!/bin/sh
set -eu

# A stalled request must not accumulate another cron invocation.
exec 9>/run/lock/djiwa-pos-notifications.lock
flock -n 9 || exit 0

ENV_FILE="/opt/supabase-selfhost/.env"
ENDPOINT="http://127.0.0.1:8099/functions/v1/pos-notifications"

[ -r "$ENV_FILE" ] || exit 0
SERVICE_KEY="$(grep -E '^(SERVICE_KEY|YUMI_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
[ -n "$SERVICE_KEY" ] || exit 0

# Pass credentials through stdin rather than exposing them in process argv.
printf 'header = "Authorization: Bearer %s"\n' "$SERVICE_KEY" | curl --config - --fail --silent --show-error --max-time 45 \
  -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  --data '{"action":"sync_recent"}' \
  >/dev/null
