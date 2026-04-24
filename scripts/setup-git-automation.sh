#!/bin/bash
# Setup cron jobs untuk auto-pull dan auto-push

echo "Setting up git automation for djiwatentramapp..."

# Buat script executable
chmod +x /opt/djiwatentramapp/scripts/git-auto-pull.sh
chmod +x /opt/djiwatentramapp/scripts/git-auto-push.sh
chmod +x /opt/djiwatentramapp/scripts/git-smart-push.sh

# Buat logs directory
mkdir -p /opt/djiwatentramapp/logs

# Backup crontab
crontab -l > /tmp/crontab-backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null

# Tambahkan cron jobs
(
  # Pull setiap 5 menit
  echo "*/5 * * * * /opt/djiwatentramapp/scripts/git-auto-pull.sh"
  
  # Smart push setiap 10 menit (hanya push commit manual)
  echo "*/10 * * * * /opt/djiwatentramapp/scripts/git-smart-push.sh"
  
  # Auto push (semua perubahan) - di-comment secara default, gunakan dengan hati-hati
  # echo "*/15 * * * * /opt/djiwatentramapp/scripts/git-auto-push.sh"
) | crontab -

echo "Cron jobs setup selesai!"
echo ""
echo "Aktif cron jobs:"
crontab -l | grep git-auto
echo ""
echo "Log files:"
echo "  - Pull log: /opt/djiwatentramapp/logs/auto-pull.log"
echo "  - Smart push log: /opt/djiwatentramapp/logs/smart-auto-push.log"
echo "  - Auto push log: /opt/djiwatentramapp/logs/auto-push.log"
echo ""
echo "CATATAN:"
echo "1. git-auto-pull.sh - Pull setiap 5 menit, otomatis stash perubahan lokal"
echo "2. git-smart-push.sh - Push hanya commit yang sudah dibuat manual (setiap 10 menit)"
echo "3. git-auto-push.sh - Push otomatis semua perubahan (HATI-HATI, default dimatikan)"
echo ""
echo "Untuk mengubah interval, edit crontab: crontab -e"
