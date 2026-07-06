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
	
	if [ "$name" = "customer" ]; then
		bun run build:customer 2>&1 | tail -3
	else
		bun run "build:$name" 2>&1 | tail -3
	fi
	
	echo "📁 Copying to /var/www/$domain/..."
	sudo cp -r "apps/$name/dist/"* "/var/www/$domain/"
	echo "✅ $name deployed to https://$domain/"
}

case "$APP" in
	pos)
		deploy_app "pos" "pos.yumme.id"
		;;
	karyawan)
		deploy_app "karyawan" "karyawan.yumme.id"
		;;
	customer)
		deploy_app "customer" "djiwatentram.yumme.id"
		;;
	all|*)
		deploy_app "pos" "pos.yumme.id"
		deploy_app "karyawan" "karyawan.yumme.id"
		deploy_app "customer" "djiwatentram.yumme.id"
		;;
esac

echo ""
echo "✅ All done! Versi: $(cat scripts/BUILD_NUMBER)"
echo "   $(cat apps/pos/src/lib/version.ts | grep semantic | head -1)"
