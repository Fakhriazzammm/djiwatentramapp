#!/usr/bin/env bash
# Build origin/main on THIS machine (not the VPS) and upload the artifacts to the VPS inbox.
# The VPS timer (djiwa-artifact-deploy) then publishes them automatically, only if the commit is
# still the head of origin/main.
#
#   scripts/ship-artifacts.sh                 # all apps
#   scripts/ship-artifacts.sh customer pos    # selected apps
#
# Needs on the build machine: git, bun 1.3.4, node 22, rsync, ssh access to the VPS.
# Public build config per app lives OUTSIDE the repo: $DJIWA_BUILD_ENV_DIR/<app>.env
# (default ~/.djiwa-build). Only VITE_* public values; admin also needs VITE_ADMIN_SECRET.
set -euo pipefail

HOST="${DJIWA_DEPLOY_HOST:-vps-djiwa-tentram}"
INBOX="${DJIWA_INBOX:-/var/lib/djiwa-autodeploy/incoming}"
ENV_DIR="${DJIWA_BUILD_ENV_DIR:-$HOME/.djiwa-build}"
BRANCH="${DJIWA_BRANCH:-main}"
ALL=(admin customer pos karyawan djiwapay manager)
APPS=("$@"); [ ${#APPS[@]} -gt 0 ] || APPS=("${ALL[@]}")

[ ! -f /opt/supabase-selfhost/docker-compose.yml ] || { echo "ERROR: jangan build di VPS production" >&2; exit 2; }
for app in "${APPS[@]}"; do
  case " ${ALL[*]} " in *" $app "*) ;; *) echo "ERROR: app tidak dikenal: $app" >&2; exit 2 ;; esac
  [ -f "$ENV_DIR/$app.env" ] || { echo "ERROR: $ENV_DIR/$app.env belum ada" >&2; exit 2; }
done

REPO="$(git rev-parse --show-toplevel)"
git -C "$REPO" fetch --quiet origin "$BRANCH"
SHA="$(git -C "$REPO" rev-parse "origin/$BRANCH")"
echo "build commit $SHA"

WORK="$(mktemp -d)"
trap 'git -C "$REPO" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
git -C "$REPO" worktree add --detach --quiet "$WORK/src" "$SHA"
cd "$WORK/src"
bun install --frozen-lockfile

for app in "${APPS[@]}"; do
  echo "=== $app ==="
  cp "$ENV_DIR/$app.env" "apps/$app/.env.production.local"
  bun run "build:$app"
  APP="$app" SHA="$SHA" node --input-type=module -e '
    import {readFileSync,writeFileSync} from "node:fs";
    const dir=`apps/${process.env.APP}/dist`;
    const v=JSON.parse(readFileSync(`${dir}/version.json`));
    if(!v.commitHash||!process.env.SHA.startsWith(v.commitHash)) throw Error("version.json bukan commit "+process.env.SHA);
    writeFileSync(`${dir}/.djiwa-artifact.json`,JSON.stringify({app:process.env.APP,commit:process.env.SHA}));'
  # Upload to .partial, then rename: the VPS timer never sees a half-copied artifact.
  NAME="$app-$SHA"
  ssh "$HOST" "mkdir -p '$INBOX' && rm -rf '$INBOX/$NAME.partial'"
  rsync -a --delete "apps/$app/dist/" "$HOST:$INBOX/$NAME.partial/"
  ssh "$HOST" "rm -rf '$INBOX/$NAME' && mv '$INBOX/$NAME.partial' '$INBOX/$NAME'"
  echo "$app uploaded; VPS akan publish dalam <=3 menit"
done
