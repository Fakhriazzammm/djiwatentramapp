#!/bin/bash
# Auto-pull script untuk mengambil update dari GitHub
# Dijalankan via cron job

cd /opt/djiwatentramapp || exit 1

# Log file
LOG_FILE="/opt/djiwatentramapp/logs/auto-pull.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== $(date) ===" >> "$LOG_FILE"

# Cek apakah ada perubahan lokal yang belum di-commit
if [[ -n $(git status --porcelain) ]]; then
    echo "Warning: Ada perubahan lokal yang belum di-commit. Stashing..." >> "$LOG_FILE"
    git stash push -m "Auto-stash before pull $(date)" >> "$LOG_FILE" 2>&1
fi

# Fetch update dari GitHub
echo "Fetching updates..." >> "$LOG_FILE"
git fetch origin >> "$LOG_FILE" 2>&1

# Cek apakah ada update
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$(git rev-parse --abbrev-ref HEAD))

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "Update tersedia! Melakukan pull..." >> "$LOG_FILE"
    
    # Pull update
    git pull origin $(git rev-parse --abbrev-ref HEAD) >> "$LOG_FILE" 2>&1
    
    # Install dependencies jika package.json berubah
    if git diff --name-only "$LOCAL" "$REMOTE" | grep -q "package.json\|bun.lock"; then
        echo "Package.json berubah, menjalankan bun install..." >> "$LOG_FILE"
        BUN_CONFIG_REGISTRY=https://registry.npmjs.org ~/.bun/bin/bun install >> "$LOG_FILE" 2>&1
    fi
    
    # Restart services jika perlu
    export PATH="$PATH:/home/ubuntu/.bun/bin"
    cd /opt/djiwatentramapp
    bun run build:karyawan >> "$LOG_FILE" 2>&1
    # Deploy ke nginx (copy dist → /var/www/)
    bash scripts/deploy-vps.sh karyawan >> "$LOG_FILE" 2>&1
    sudo systemctl restart yumi-hrd-agent.service >> "$LOG_FILE" 2>&1

    # Juga build & deploy customer (ponytail: ensure fresh build with .env)
    bash scripts/deploy-vps.sh customer >> "$LOG_FILE" 2>&1

    echo "Pull berhasil pada $(date)" >> "$LOG_FILE"
else
    echo "Tidak ada update baru." >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
