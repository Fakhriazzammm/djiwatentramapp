#!/usr/bin/env bash
# Sync apps/djiwapay-api to the VPS and restart it. Secrets live only in /etc/djiwatentramapp/djiwapay-api.env.
# Dependencies are installed here (the VPS npm mirror is unreliable) and shipped as node_modules.
set -euo pipefail
HOST="${DEPLOY_HOST:-vps-djiwa-tentram}"
SRC="$(cd "$(dirname "$0")/../apps/djiwapay-api" && pwd)"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC/src" "$SRC/migrations" "$SRC/package.json" "$STAGE/"
rm -f "$STAGE"/src/*.test.ts
node -e 'const p=require(process.argv[1]);delete p.devDependencies;require("fs").writeFileSync(process.argv[1],JSON.stringify(p,null,2))' "$STAGE/package.json"
(cd "$STAGE" && PATH="$HOME/.bun/bin:$PATH" bun install --production --silent)
rsync -az --delete "$STAGE/" "$HOST:/opt/djiwapay-api/"
ssh "$HOST" "sudo bash -c 'set -a; . /etc/djiwatentramapp/djiwapay-api.env; set +a; cd /opt/djiwapay-api && /usr/local/bin/bun src/migrate.ts' && sudo systemctl restart djiwapay-api.service && sleep 2 && systemctl is-active djiwapay-api.service && curl -fsS http://127.0.0.1:3011/api/finance/health"
