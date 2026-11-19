#!/usr/bin/env bash
# Sync apps/djiwapay-api to the VPS and restart it. Secrets live only in /etc/djiwatentramapp/djiwapay-api.env.
# Dependencies are installed here (the VPS npm mirror is unreliable) and shipped as node_modules.
set -euo pipefail
HOST="${DEPLOY_HOST:-vps-djiwa-tentram}"
SRC="$(cd "$(dirname "$0")/../apps/djiwapay-api" && pwd)"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
cp -R "$SRC/src" "$SRC/migrations" "$SRC/package.json" "$SRC"/*.service "$STAGE/"
cp "$SRC/../../packages/backend/supabase/migrations/20261115180412_finance_receipt_documents.sql" "$STAGE/migrations/"
cp "$SRC/../../packages/backend/supabase/migrations/20261120095000_finance_loan_reconciliation.sql" "$STAGE/migrations/"
rm -f "$STAGE"/src/*.test.ts
node -e 'const p=require(process.argv[1]);delete p.devDependencies;require("fs").writeFileSync(process.argv[1],JSON.stringify(p,null,2))' "$STAGE/package.json"
(cd "$STAGE" && PATH="$HOME/.bun/bin:$PATH" bun install --production --silent)
# The SMTP receiver runs on Node (STARTTLS does not work under Bun): ship it as one bundled file.
(cd "$SRC" && PATH="$HOME/.bun/bin:$PATH" bun build src/mail.ts --target=node --outfile "$STAGE/dist/mail.mjs" >/dev/null)
rsync -az --delete "$STAGE/" "$HOST:/opt/djiwapay-api/"
ssh "$HOST" "sudo bash -c 'set -a; . /etc/djiwatentramapp/djiwapay-api.env; set +a; cd /opt/djiwapay-api && /usr/local/bin/bun src/migrate.ts' && sudo install -m 644 /opt/djiwapay-api/djiwapay-api.service /opt/djiwapay-api/djiwapay-mail.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable djiwapay-mail.service >/dev/null 2>&1 && sudo systemctl restart djiwapay-api.service djiwapay-mail.service && sleep 3 && systemctl is-active djiwapay-api.service djiwapay-mail.service && curl -fsS http://127.0.0.1:3011/api/finance/health"
