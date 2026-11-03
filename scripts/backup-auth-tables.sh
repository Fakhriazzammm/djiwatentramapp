#!/bin/bash
# Backup harian tabel auth + pelanggan (user/account/investor/customers). Dipasang di /usr/local/sbin
# dan dijalankan root via /etc/cron.d/djiwa-auth-backup. Retensi 14 hari.
# Tidak memangkas backup lama bila jumlah user mencurigakan (< 50% pelanggan), supaya backup
# sehat tidak tergantikan oleh backup kosong.
set -euo pipefail
DIR=/opt/backups/auth-daily; KEEP=14
mkdir -p "$DIR"; chmod 700 "$DIR"
P="docker exec supabase-db psql -U supabase_admin -d postgres -At"
users=$($P -c 'select count(*) from public."user"'); cust=$($P -c 'select count(*) from pos.customers')
out="$DIR/auth-$(date +%Y%m%d-%H%M%S)-u${users}-c${cust}.dump"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc \
	-t public.user -t public.account -t public.investor_leads -t public.investor_memberships \
	-t public.customer_google_calendar_connections -t pos.customers > "$out"
chmod 600 "$out"
if [ "$users" -lt $((cust / 2)) ]; then
	echo "$(date -Is) PERINGATAN: user=$users jauh di bawah customers=$cust; backup lama TIDAK dipangkas ($out)" | tee -a /var/log/djiwa-auth-backup.log >&2
	exit 1
fi
ls -1t "$DIR"/auth-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date -Is) ok user=$users customers=$cust $out" >> /var/log/djiwa-auth-backup.log
