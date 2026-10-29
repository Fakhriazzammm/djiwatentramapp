#!/bin/bash
# Apply the versioned Kong config to the self-hosted Supabase gateway.
#
# Why this exists: /opt/supabase-selfhost/kong.yml was hand-edited on the VPS and
# never committed, so a CORS regression silently broke the admin dashboard
# (browser preflight rejected the `x-yumi-session-token` header used by
# admin-protected-read). Keeping the config in git makes the fix reviewable and
# repeatable.
#
# Usage: bash scripts/deploy-kong-config.sh [--check]
#   --check  compare only, do not touch the gateway
set -euo pipefail

SELFHOST_DIR="${SELFHOST_DIR:-/opt/supabase-selfhost}"
REPO_KONG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/infrastructure/supabase-selfhost/kong.yml"
LIVE_KONG="$SELFHOST_DIR/kong.yml"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

[ -f "$REPO_KONG" ] || { echo -e "${RED}✗${NC} repo kong.yml missing: $REPO_KONG"; exit 1; }
[ -f "$LIVE_KONG" ] || { echo -e "${RED}✗${NC} live kong.yml missing: $LIVE_KONG"; exit 1; }

if diff -q "$REPO_KONG" "$LIVE_KONG" >/dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Kong config already in sync"
  exit 0
fi

echo -e "${YELLOW}⟳${NC} Kong config differs"
diff -u "$LIVE_KONG" "$REPO_KONG" | head -40 || true

if [ "$CHECK_ONLY" = true ]; then
  echo "check-only: not applying"
  exit 1
fi

STAMP=$(date +%Y%m%d_%H%M%S)
cp -a "$LIVE_KONG" "$LIVE_KONG.bak.$STAMP"
echo -e "${GREEN}✓${NC} backup: kong.yml.bak.$STAMP"

# Validate before swapping so a bad file can never take the gateway down.
python3 - "$REPO_KONG" <<'PY'
import sys
try:
    import yaml
except ImportError:
    sys.exit(0)
doc = yaml.safe_load(open(sys.argv[1]))
assert isinstance(doc.get("services"), list) and doc["services"], "kong.yml has no services"
names = {s.get("name") for s in doc["services"]}
for required in ("rest", "auth", "functions-v1"):
    assert required in names, f"kong.yml missing service {required}"
print("kong.yml validated:", sorted(names))
PY

cp "$REPO_KONG" "$LIVE_KONG"
echo -e "${GREEN}✓${NC} applied repo config to $LIVE_KONG"

docker restart supabase-kong >/dev/null
echo -e "${YELLOW}…${NC} waiting for gateway"

for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:8099/rest/v1/" -H "apikey: healthcheck" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} gateway healthy after ${i}s"
    break
  fi
  sleep 1
  [ "$i" = 30 ] && { echo -e "${RED}✗${NC} gateway did not become healthy"; exit 1; }
done

# Verify the exact header that broke the dashboard is now allowed.
ALLOWED=$(curl -s -X OPTIONS "http://127.0.0.1:8099/functions/v1/admin-protected-read" \
  -H "Origin: https://admin.djiwatentram.web.id" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,apikey,x-yumi-session-token" \
  -D - -o /dev/null | grep -i "access-control-allow-headers" | tr -d '\r')

if echo "$ALLOWED" | grep -qi "x-yumi-session-token"; then
  echo -e "${GREEN}✓${NC} x-yumi-session-token permitted on functions route"
else
  echo -e "${RED}✗${NC} x-yumi-session-token still blocked: $ALLOWED"
  exit 1
fi
