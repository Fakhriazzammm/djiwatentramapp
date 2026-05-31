#!/bin/bash
# Vercel Ignored Build Step — skip deployment if no relevant files changed.
# Usage: scripts/vercel-ignore.sh <app-dir> [extra-paths...]
#
# Example:
#   scripts/vercel-ignore.sh apps/pos packages/backend packages/env packages/yumipos-web-shared packages/config supabase
#
# Vercel runs ignoreCommand at the repository root.
# Exit 0 = skip build (no relevant changes).
# Exit 1 = proceed with build (changes detected).

APP_DIR="$1"
shift

# Always build if no previous SHA (first deploy)
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "[vercel-ignore] First deployment — building $APP_DIR"
  exit 1
fi

# Build the path filter: app dir + shared deps + root config
PATHS=("$APP_DIR" "$@")

# Root-level files that affect all apps
ROOT_PATHS=("package.json" "turbo.json" "bun.lock" "pnpm-lock.yaml" "yarn.lock")

echo "[vercel-ignore] Checking changes for $APP_DIR..."
echo "[vercel-ignore] Comparing $VERCEL_GIT_PREVIOUS_SHA → HEAD"

# Check app-specific paths
for p in "${PATHS[@]}"; do
  if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- "$p" 2>/dev/null; then
    :
  else
    echo "[vercel-ignore] Changes detected in $p — building"
    exit 1
  fi
done

# Check root-level config files
for p in "${ROOT_PATHS[@]}"; do
  if [ -f "$p" ]; then
    if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- "$p" 2>/dev/null; then
      :
    else
      echo "[vercel-ignore] Changes detected in $p — building"
      exit 1
    fi
  fi
done

echo "[vercel-ignore] No relevant changes — skipping build"
exit 0
