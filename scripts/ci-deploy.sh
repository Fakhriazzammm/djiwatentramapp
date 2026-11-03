#!/bin/bash
# CI deploy untuk VPS vps-djiwa-tentram. Dipanggil lewat SSH forced command (lihat docs).
# Usage: ci-deploy.sh <sha> <app>[,<app>...]   app: pos|karyawan|customer|admin|djiwapay
# Build dilakukan di worktree bersih (origin/main), TIDAK menyentuh checkout produksi
# /opt/djiwatentramapp kecuali menukar apps/<app>/dist secara atomik setelah build sukses.
set -euo pipefail

CANONICAL=/opt/djiwatentramapp
RELEASE=/opt/djiwa-release
ALLOWED="pos karyawan customer admin djiwapay"
declare -A DOMAIN=([pos]=pos.djiwatentram.web.id [karyawan]=karyawan.djiwatentram.web.id \
	[customer]=djiwatentram.web.id [admin]=admin.djiwatentram.web.id [djiwapay]=djiwapay.web.id)

SHA="${1:-}"; APPS="${2:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "sha tidak valid"; exit 2; }
IFS=, read -ra LIST <<<"$APPS"
[ "${#LIST[@]}" -gt 0 ] || { echo "app kosong"; exit 2; }
for a in "${LIST[@]}"; do [[ " $ALLOWED " == *" $a "* ]] || { echo "app tidak diizinkan: $a"; exit 2; }; done

exec 9>/var/lock/djiwa-ci-deploy.lock
flock -w 1800 9 || { echo "deploy lain masih berjalan"; exit 3; }

avail_gb=$(( $(df / --output=avail | tail -1) / 1024 / 1024 ))
[ "$avail_gb" -ge 3 ] || { echo "disk rendah: ${avail_gb}G (<3G)"; exit 4; }

cd "$CANONICAL"
git fetch --quiet github-target main
git cat-file -e "$SHA^{commit}" 2>/dev/null || git fetch --quiet github-target "$SHA"
[ -d "$RELEASE/.git" ] || [ -f "$RELEASE/.git" ] || git worktree add --detach "$RELEASE" "$SHA"
cd "$RELEASE"
git checkout --quiet --force --detach "$SHA"
git clean -fdq -e node_modules -e '.turbo' -e '.env' -e '**/.env'

# .env produksi tidak ada di git; salin dari checkout produksi.
for f in .env $(cd "$CANONICAL" && find apps packages -maxdepth 3 -name '.env' -not -path '*/node_modules/*'); do
	[ -f "$CANONICAL/$f" ] && install -D -m 600 "$CANONICAL/$f" "$RELEASE/$f"
done

echo "== bun install ($SHA)"
bun install --frozen-lockfile

FAILED=0
for app in "${LIST[@]}"; do
	echo "== build $app"
	rm -rf ".turbo" "apps/$app/dist"
	if [ "$app" = admin ] && [ -f /opt/supabase-selfhost/.env ]; then
		export VITE_VAPID_PUBLIC_KEY="$(grep -E '^VAPID_PUBLIC_KEY=' /opt/supabase-selfhost/.env | cut -d= -f2- | head -n1)"
	fi
	if ! bun run "build:$app" || [ ! -f "apps/$app/dist/index.html" ]; then
		echo "BUILD GAGAL: $app (dist produksi tidak diubah)"; FAILED=1; continue
	fi
	dest="$CANONICAL/apps/$app/dist"
	rm -rf "$dest.new" "$dest.prev"
	cp -a "apps/$app/dist" "$dest.new"
	[ -e "$dest" ] && mv "$dest" "$dest.prev"
	mv "$dest.new" "$dest"
	if curl -fsS -m 20 -o /dev/null "https://${DOMAIN[$app]}/"; then
		echo "OK $app -> https://${DOMAIN[$app]}/ ($(curl -fsS -m 10 "https://${DOMAIN[$app]}/version.json" 2>/dev/null | tr -d '\n ' | cut -c1-120))"
		rm -rf "$dest.prev"
	else
		echo "VERIFIKASI GAGAL $app -> rollback"; rm -rf "$dest"; [ -e "$dest.prev" ] && mv "$dest.prev" "$dest"; FAILED=1
	fi
done

if [[ " ${LIST[*]} " == *" customer "* ]]; then
	for fn in customer-auth djiwa-run; do
		[ -f "supabase/functions/$fn/index.ts" ] || continue
		mkdir -p "/opt/supabase-selfhost/volumes/functions/$fn"
		cp "supabase/functions/$fn/index.ts" "/opt/supabase-selfhost/volumes/functions/$fn/index.ts"
	done
	(cd /opt/supabase-selfhost && docker compose up --detach functions)
fi

exit "$FAILED"
