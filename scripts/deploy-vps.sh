#!/bin/bash
# Auto-deploy script for Djiwa Tentram apps (VPS)
# Run after git pull to rebuild and redeploy all apps
# Usage: ./scripts/deploy-vps.sh [pos|karyawan|customer|all]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

APP="${1:-all}"

echo "🚀 Deploying Djiwa Tentram apps to VPS..."
echo "Target: $APP"

deploy_app() {
	local name=$1
	local domain=$2
	echo ""
	echo "📦 Building $name ($domain)..."

	# Ponytail: clear turbo cache so .env vars are picked up fresh
	rm -rf "apps/$name/.turbo" "apps/$name/dist"
	
	if [ "$name" = "customer" ]; then
		bun run build:customer 2>&1 | tail -3
	else
		bun run "build:$name" 2>&1 | tail -3
	fi
	
	# Hapus dulu file lama, lalu copy yang baru
	sudo rm -rf "/var/www/$domain/"*
	echo "📁 Copying to /var/www/$domain/..."
	sudo cp -r "apps/$name/dist/"* "/var/www/$domain/"
	sudo chown -R www-data:www-data "/var/www/$domain/"
	echo "✅ $name deployed to https://$domain/"
}

deploy_edge_function() {
	local name=$1
	echo ""
	echo "⚡ Deploying Edge Function: $name..."
	mkdir -p "/opt/supabase-selfhost/volumes/functions/$name"
	cp "supabase/functions/$name/index.ts" "/opt/supabase-selfhost/volumes/functions/$name/index.ts"
	cd /opt/supabase-selfhost && docker compose up --detach functions 2>&1 | tail -1
	cd "$SCRIPT_DIR"
	echo "✅ Edge Function $name deployed"
}

SELFHOST_FUNCTIONS="/opt/supabase-selfhost/volumes/functions"

case "$APP" in
	pos)
		deploy_app "pos" "pos.yumme.id"
		;;
	karyawan)
		deploy_app "karyawan" "karyawan.yumme.id"
		;;
	customer)
		deploy_app "customer" "djiwatentram.yumme.id"
		deploy_edge_function "customer-auth"
		;;
	all|*)
		deploy_app "pos" "pos.yumme.id"
		deploy_app "karyawan" "karyawan.yumme.id"
		deploy_app "customer" "djiwatentram.yumme.id"
		deploy_edge_function "customer-auth"
		;;
esac

echo ""
echo "✅ All done! $(date)"
