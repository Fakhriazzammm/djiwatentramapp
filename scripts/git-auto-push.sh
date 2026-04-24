#!/bin/bash
# Auto-push script untuk mengirim perubahan dari VPS ke GitHub
# Dijalankan via cron job

cd /opt/djiwatentramapp || exit 1

# Log file
LOG_FILE="/opt/djiwatentramapp/logs/auto-push.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== $(date) ===" >> "$LOG_FILE"

# Pull dulu untuk mengambil update terbaru (opsional, tapi disarankan)
echo "Memastikan repository up-to-date..." >> "$LOG_FILE"
git pull origin $(git rev-parse --abbrev-ref HEAD) --rebase >> "$LOG_FILE" 2>&1

# Cek apakah ada perubahan yang belum di-commit
if [[ -z $(git status --porcelain) ]]; then
    echo "Tidak ada perubahan yang perlu dipush." >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 0
fi

echo "Menemukan perubahan lokal..." >> "$LOG_FILE"
git status --short >> "$LOG_FILE"

# Tambahkan semua perubahan
echo "Menambahkan perubahan..." >> "$LOG_FILE"
git add . >> "$LOG_FILE" 2>&1

# Commit dengan pesan otomatis
COMMIT_MSG="Auto-commit from VPS $(date '+%Y-%m-%d %H:%M:%S')"
echo "Commit: $COMMIT_MSG" >> "$LOG_FILE"
git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1

# Push ke GitHub
echo "Push ke GitHub..." >> "$LOG_FILE"
git push origin $(git rev-parse --abbrev-ref HEAD) >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "Push berhasil pada $(date)" >> "$LOG_FILE"
else
    echo "Push gagal! Cek log untuk detail." >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
