#!/bin/bash
# Deploy script for Admin subdomain (admin.djiwatentram.web.id)
# Admin app = build eksklusif dari apps/admin (jangan pernah memakai artifact apps/pos)
# Flow: build admin -> validasi marker route Admin -> copy dist ke webroot admin domain
#
# Usage: ./scripts/deploy-admin.sh
#   (opsional) DEBUG=1 ./scripts/deploy-admin.sh   # skip copy, hanya build

set -eo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

ADMIN_DOMAIN="admin.djiwatentram.web.id"
CANONICAL_CHECKOUT="/opt/djiwatentramapp"
ADMIN_WEBROOT="$CANONICAL_CHECKOUT/apps/admin/dist"
POS_DOMAIN="pos.djiwatentram.web.id"
DEBUG="${DEBUG:-0}"

DEPLOY_FROM_WORKTREE="${DEPLOY_FROM_WORKTREE:-0}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

if [ "$SCRIPT_DIR" != "$CANONICAL_CHECKOUT" ] && [ "$DEPLOY_FROM_WORKTREE" != "1" ]; then
	echo "❌ Deploy Admin wajib dijalankan dari checkout canonical $CANONICAL_CHECKOUT (host djiwa-vps)."
	echo "   Dari worktree bersih: DEPLOY_FROM_WORKTREE=1 $0"
	exit 1
fi

# ── Guard: artifact harus dibangun dari main yang bersih ──
# Insiden: dist admin pernah dibangun dari working tree tertinggal beberapa commit,
# sehingga dashboard kembali memakai read lama dan menampilkan
# "Dashboard belum dapat memuat data" walau kode di main sudah benar.
if [ "$ALLOW_DIRTY" != "1" ]; then
	if [ -n "$(git status --porcelain)" ]; then
		echo "❌ Working tree kotor — artifact akan dibangun dari kode yang salah."
		echo "   Commit/stash dulu, atau deploy dari worktree bersih:"
		echo "     git worktree add /tmp/deploy-main origin/main"
		echo "     DEPLOY_FROM_WORKTREE=1 /tmp/deploy-main/scripts/deploy-admin.sh"
		echo "   Override (tidak disarankan): ALLOW_DIRTY=1 $0"
		exit 1
	fi
	echo "✅ Source: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD) — tree bersih"
fi

echo "🚀 Deploying Admin subdomain -> https://$ADMIN_DOMAIN"
echo "Source artifact: apps/admin/dist (isolated dari apps/pos)"

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

# ── Build admin app (apps/admin) ──
echo ""
echo "📦 Building admin (apps/admin)..."
rm -rf ".turbo" "apps/admin/.turbo" "apps/admin/dist"
bun run build --filter=admin 2>/dev/null || bun run --cwd apps/admin build
echo "✅ Build admin succeeded"

# Guard: jangan pernah deploy bundle POS/partial sebagai Admin.
for marker in '/admin/kol' '/admin/community' '/admin/customers'; do
	if ! grep -Rqs -- "$marker" apps/admin/dist/assets; then
		echo "❌ Artifact Admin tidak valid: marker $marker tidak ditemukan"
		exit 1
	fi
done

# Guard fungsional: dashboard wajib membaca lewat admin-protected-read.
if ! grep -Rqs -- 'admin-protected-read' apps/admin/dist/assets; then
	echo "❌ Artifact Admin tidak valid: jalur baca admin-protected-read tidak ada."
	echo "   Dashboard akan fallback ke PostgREST anon dan gagal memuat data."
	exit 1
fi
echo "✅ Artifact guard passed: route Admin lengkap + protected read aktif"

if [ "$DEBUG" = "1" ]; then
	echo "🐛 DEBUG mode: skip copy. Dist ada di apps/admin/dist/"
	exit 0
fi

# ── Artifact sudah berada di webroot canonical ──
echo ""
if [ "$ADMIN_WEBROOT" != "$SCRIPT_DIR/apps/admin/dist" ]; then
	echo "📁 Syncing admin dist -> $ADMIN_WEBROOT..."
	mkdir -p "$ADMIN_WEBROOT"
	rsync -a --delete "apps/admin/dist/" "$ADMIN_WEBROOT/"
fi
test -f "$ADMIN_WEBROOT/index.html"
echo "✅ Admin deployed to https://$ADMIN_DOMAIN/ from $ADMIN_WEBROOT"

# ── Verifikasi ──
echo ""
echo "🔍 Verifying..."
ADMIN_LOGIN=$(curl -s -o /dev/null -w '%{http_code}' "https://$ADMIN_DOMAIN/admin/login")
ADMIN_CUSTOMERS=$(curl -s -o /dev/null -w '%{http_code}' "https://$ADMIN_DOMAIN/admin/customers")
POS_REGRESSION=$(curl -s -o /dev/null -w '%{http_code}' "https://$POS_DOMAIN/admin")
SUPABASE_API=$(curl -s -o /dev/null -w '%{http_code}' "https://supabase.djiwatentram.web.id/rest/v1/")

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
