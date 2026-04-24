#!/bin/bash
# Smart auto-push: hanya push perubahan yang sudah di-commit manual
# Hindari push perubahan yang belum di-review

cd /opt/djiwatentramapp || exit 1

# Log file
LOG_FILE="/opt/djiwatentramapp/logs/smart-auto-push.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== $(date) ===" >> "$LOG_FILE"

# Cek apakah ada commit yang belum di-push
UNPUSHED=$(git log origin/$(git rev-parse --abbrev-ref HEAD)..HEAD --oneline | wc -l)

if [ "$UNPUSHED" -eq 0 ]; then
    echo "Tidak ada commit yang perlu dipush." >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 0
fi

echo "Menemukan $UNPUSHED commit yang belum dipush:" >> "$LOG_FILE"
git log origin/$(git rev-parse --abbrev-ref HEAD)..HEAD --oneline >> "$LOG_FILE"

# Cek apakah ada perubahan yang belum di-commit
if [[ -n $(git status --porcelain) ]]; then
    echo "Warning: Ada perubahan uncommitted. Tidak akan push." >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 1
fi

# Pull dulu dengan rebase untuk menjaga history bersih
echo "Melakukan rebase dengan update terbaru..." >> "$LOG_FILE"
git pull --rebase origin $(git rev-parse --abbrev-ref HEAD) >> "$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
    echo "Rebase gagal! Ada konflik yang perlu diselesaikan manual." >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    exit 1
fi

# Push ke GitHub
echo "Push ke GitHub..." >> "$LOG_FILE"
git push origin $(git rev-parse --abbrev-ref HEAD) >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "Push $UNPUSHED commit berhasil pada $(date)" >> "$LOG_FILE"
else
    echo "Push gagal! Cek log untuk detail." >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
