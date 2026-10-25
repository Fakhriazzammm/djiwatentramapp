#!/bin/bash
# Auto-deploy script for Djiwa Tentram apps (VPS)
# Run after git pull to rebuild and redeploy all apps
# Usage: ./scripts/deploy-vps.sh [pos|karyawan|customer|admin|all]

set -eo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

APP="${1:-all}"

echo "🚀 Deploying Djiwa Tentram apps to VPS..."
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

	# Public VAPID key is safe for the browser but must be injected at build time.
	# Keep the private key server-side; only expose VAPID_PUBLIC_KEY to Vite.
	if [ "$name" = "admin" ] && [ -f "/opt/supabase-selfhost/.env" ]; then
		export VITE_VAPID_PUBLIC_KEY="$(grep -E '^VAPID_PUBLIC_KEY=' /opt/supabase-selfhost/.env | cut -d= -f2- | head -n1)"
	fi

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

install_notification_sync() {
	# Reconcile customer orders every minute so Web Push is dispatched even when
	# the Admin PWA is closed. The service-role key is read only by the script.
	sudo install -m 700 "scripts/sync-pos-notifications.sh" /usr/local/sbin/djiwa-sync-pos-notifications
	printf '*/1 * * * * root /usr/local/sbin/djiwa-sync-pos-notifications\n' | sudo tee /etc/cron.d/djiwa-pos-notifications >/dev/null
	sudo chmod 644 /etc/cron.d/djiwa-pos-notifications
}

# ── Main ──

SELFHOST_FUNCTIONS="/opt/supabase-selfhost/volumes/functions"
install_notification_sync

case "$APP" in
	pos)
		deploy_app "pos" "pos.yumme.id"
		;;
	karyawan)
		deploy_app "karyawan" "karyawan.yumme.id"
		;;
	customer)
		deploy_app "customer" "djiwatentram.web.id"
		deploy_edge_function "customer-auth"
		deploy_edge_function "djiwa-run"
		;;
	admin|web)
		# `web` dipertahankan sebagai alias legacy, tetapi sumber Admin selalu apps/admin.
		deploy_app "admin" "admindjiwatentram.yumme.id"
		;;
	all|*)
		deploy_app "pos" "pos.yumme.id"
		deploy_app "karyawan" "karyawan.yumme.id"
		deploy_app "customer" "djiwatentram.web.id"
		deploy_app "admin" "admindjiwatentram.yumme.id"
		deploy_edge_function "customer-auth"
		deploy_edge_function "djiwa-run"
		;;
esac

cleanup

echo ""
echo "✅ All done! $(date)"
