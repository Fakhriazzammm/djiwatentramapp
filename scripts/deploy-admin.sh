#!/bin/bash
# Deploy script for Admin subdomain (admindjiwatentram.yumme.id)
# Admin app = build dari apps/pos (Opsi A: kode share pos, deploy terpisah)
# Flow: build pos -> copy dist ke webroot admin domain
#
# Usage: ./scripts/deploy-admin.sh
#   (opsional) DEBUG=1 ./scripts/deploy-admin.sh   # skip copy, hanya build

set -eo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

ADMIN_DOMAIN="admindjiwatentram.yumme.id"
POS_DOMAIN="pos.yumme.id"
DEBUG="${DEBUG:-0}"

echo "🚀 Deploying Admin subdomain -> https://$ADMIN_DOMAIN"
echo "Mode: Opsi A (build pos, copy ke domain admin)"

# ── Pre-flight: disk check ──
check_disk() {
	local avail_kb avail_gb
	avail_kb=$(df / --output=avail 2>/dev/null | tail -1)
	avail_gb=$((avail_kb / 1024 / 1024))
	if [ "$avail_gb" -lt 3 ]; then
		echo "⚠️  Disk space low: ${avail_gb}G available (need >= 3G)"
		echo "   Run cleanup: sudo docker system prune -af && journalctl --vacuum-time=3d"
		return 1
	fi
	echo "✅ Disk: ${avail_gb}G available"
}
check_disk

# ── Build pos (admin = build pos) ──
echo ""
echo "📦 Building pos (source for admin app)..."
rm -rf ".turbo" "apps/pos/.turbo" "apps/pos/dist"
bun run build:pos
echo "✅ Build pos succeeded"

if [ "$DEBUG" = "1" ]; then
	echo "🐛 DEBUG mode: skip copy. Dist ada di apps/pos/dist/"
	exit 0
fi

# ── Copy ke domain admin ──
echo ""
echo "📁 Copying pos dist -> /var/www/$ADMIN_DOMAIN/..."
sudo rm -rf "/var/www/$ADMIN_DOMAIN/"*
sudo cp -r "apps/pos/dist/"* "/var/www/$ADMIN_DOMAIN/"
sudo chown -R www-data:www-data "/var/www/$ADMIN_DOMAIN/"
echo "✅ Admin deployed to https://$ADMIN_DOMAIN/"

# ── Verifikasi ──
echo ""
echo "🔍 Verifying..."
ADMIN_LOGIN=$(curl -s -o /dev/null -w '%{http_code}' "https://$ADMIN_DOMAIN/admin/login")
ADMIN_CUSTOMERS=$(curl -s -o /dev/null -w '%{http_code}' "https://$ADMIN_DOMAIN/admin/customers")
POS_REGRESSION=$(curl -s -o /dev/null -w '%{http_code}' "https://$POS_DOMAIN/admin")
SUPABASE_API=$(curl -s -o /dev/null -w '%{http_code}' "https://supabase.yumme.id/rest/v1/")

echo "  admin/login        -> $ADMIN_LOGIN"
echo "  admin/customers    -> $ADMIN_CUSTOMERS"
echo "  pos /admin (regress) -> $POS_REGRESSION"
echo "  supabase /rest/v1  -> $SUPABASE_API"

if [ "$ADMIN_LOGIN" = "200" ] && [ "$ADMIN_CUSTOMERS" = "200" ] && [ "$POS_REGRESSION" = "200" ] && [ "$SUPABASE_API" = "200" ]; then
	echo "✅ All checks passed — admin live & data connected"
else
	echo "⚠️  Some checks failed — review above"
fi

# ── Cleanup ──
echo ""
echo "🧹 Cleanup..."
sudo docker system prune -f 2>/dev/null && echo "  ✅ Docker pruned" || echo "  ⚠️  Docker prune skipped"
sudo journalctl --vacuum-time=3d 2>/dev/null && echo "  ✅ Journals rotated" || echo "  ⚠️  Journal rotate skipped"

echo ""
echo "✅ Admin deploy done! $(date)"
