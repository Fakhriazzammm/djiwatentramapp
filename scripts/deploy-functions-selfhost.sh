#!/bin/bash
# Deploy Edge Functions to Self-Hosted Supabase
# Usage: bash scripts/deploy-functions-selfhost.sh [function_name]
#   - Without args: sync ALL functions
#   - With args: sync only specified function(s)

set -euo pipefail

SELFHOST_DIR="/opt/supabase-selfhost/volumes/functions"
LOCAL_DIR="/opt/djiwatentramapp/supabase/functions"
RESTART_NEEDED=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🚀 Deploying Edge Functions to Self-Hosted Supabase..."
echo "   Local:      $LOCAL_DIR"
echo "   Self-Host:  $SELFHOST_DIR"
echo ""

sync_function() {
    local fn=$1
    local src="$LOCAL_DIR/$fn"
    local dst="$SELFHOST_DIR/$fn"
    
    if [ ! -d "$src" ]; then
        echo -e "${RED}✗${NC} $fn — not found in local functions/"
        return 1
    fi
    
    # Check if update needed
    if [ -d "$dst" ]; then
        local diff=$(diff -rq "$src" "$dst" 2>/dev/null | grep -v '.npmrc' || true)
        if [ -z "$diff" ]; then
            echo -e "  ${GREEN}✓${NC} $fn — unchanged, skipped"
            return 0
        fi
    fi
    
    # Sync
    mkdir -p "$dst"
    rsync -a --delete --exclude='.npmrc' "$src/" "$dst/"
    echo -e "  ${YELLOW}⟳${NC} $fn — synced!"
    RESTART_NEEDED=true
}

# Determine which functions to sync
if [ $# -gt 0 ]; then
    for fn in "$@"; do
        sync_function "$fn"
    done
else
    echo "Syncing all functions..."
    for fn_dir in "$LOCAL_DIR"/*/; do
        fn=$(basename "$fn_dir")
        sync_function "$fn"
    done
fi

echo ""

# Restart edge-runtime if any function was updated
if [ "$RESTART_NEEDED" = true ]; then
    echo -e "${YELLOW}⟳${NC} Restarting Supabase Edge Runtime..."
    docker restart supabase-edge-functions
    sleep 3
    echo -e "${GREEN}✓${NC} Edge Runtime restarted"
else
    echo -e "${GREEN}✓${NC} No updates needed — Edge Runtime not restarted"
fi

echo ""
echo "✅ Deploy complete!"
echo "   Functions available at: https://supabase.yumme.id/functions/v1/"
