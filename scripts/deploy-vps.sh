#!/bin/bash
# Auto-deploy script for Djiwa Tentram Centrik apps (VPS)
# Run after git pull to rebuild and redeploy all apps
# Usage: ./scripts/deploy-vps.sh [pos|karyawan|customer|web|all]

set -eo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

APP="${1:-all}"

echo "🚀 Deploying Djiwa Tentram Centrik apps to VPS..."
echo "Target: $APP"

# ── Pre-flight checks ──

check_disk() {
	local avail_kb avail_gb
	avail_kb=$(df / --output=avail 2>/dev/null | tail -1)
	avail_gb=$((avail_kb / 1024 / 1024))
	if [ "$avail_gb" -lt 3 ]; then
		echo "⚠️  Disk space low: ${avail_gb}G available (need >= 3G)"
		echo "   Run cleanup first: sudo docker system prune -af && journalctl --vacuum-time=3d"
		return 1
	fi
	echo "✅ Disk: ${avail_gb}G available"
}

check_disk

# ── Build & Deploy App ──

deploy_app() {
	local name=$1
	local domain=$2
	echo ""
	echo "📦 Building $name ($domain)..."

	# Ponytail: clear ALL turbo caches so .env vars are picked up fresh
	rm -rf ".turbo" "apps/$name/.turbo" "apps/$name/dist"

	if [ "$name" = "customer" ]; then
		bun run build:customer
	else
		bun run "build:$name"
	fi

	echo "✅ Build succeeded for $name"

	# Hapus dulu file lama, lalu copy yang baru
	sudo rm -rf "/var/www/$domain/"*
	echo "📁 Copying to /var/www/$domain/..."
	sudo cp -r "apps/$name/dist/"* "/var/www/$domain/"
	sudo chown -R www-data:www-data "/var/www/$domain/"
	echo "✅ $name deployed to https://$domain/"
}

# ── Deploy Edge Function ──

deploy_edge_function() {
	local name=$1
	echo ""
	echo "⚡ Deploying Edge Function: $name..."
	mkdir -p "/opt/supabase-selfhost/volumes/functions/$name"
	cp "supabase/functions/$name/index.ts" "/opt/supabase-selfhost/volumes/functions/$name/index.ts"
	cd /opt/supabase-selfhost && docker compose up --detach functions
	cd "$SCRIPT_DIR"
	echo "✅ Edge Function $name deployed"
}

# ── Post-deploy cleanup ──

cleanup() {
	echo ""
	echo "🧹 Post-deploy cleanup..."

	# Prune dangling Docker images (keeps active images)
	sudo docker system prune -f 2>/dev/null && echo "  ✅ Docker pruned" || echo "  ⚠️  Docker prune skipped"

	# Rotate journals older than 3 days
	sudo journalctl --vacuum-time=3d 2>/dev/null && echo "  ✅ Journals rotated" || echo "  ⚠️  Journal rotate skipped"

	echo "✅ Cleanup done"
}

# ── Main ──

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
	web)
		deploy_app "web" "admindjiwatentram.yumme.id"
		;;
	all|*)
		deploy_app "pos" "pos.yumme.id"
		deploy_app "karyawan" "karyawan.yumme.id"
		deploy_app "customer" "djiwatentram.yumme.id"
		deploy_app "web" "admindjiwatentram.yumme.id"
		deploy_edge_function "customer-auth"
		;;
esac

cleanup

echo ""
echo "✅ All done! $(date)"
