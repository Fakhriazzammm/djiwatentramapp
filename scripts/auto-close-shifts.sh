#!/bin/bash
# Auto-close shifts - triggered by scheduler (self-hosted Edge Function on this VPS)
set -euo pipefail
ENV_FILE="/opt/supabase-selfhost/.env"
ANON_KEY="$(grep -E '^ANON_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
curl -s -X POST "https://supabase.djiwatentram.web.id/functions/v1/auto-close-shifts" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
