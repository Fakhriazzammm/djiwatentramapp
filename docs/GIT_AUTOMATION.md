# Git Automation untuk djiwatentramapp

Sistem otomatisasi git sudah ter-setup di VPS untuk:

1. **Auto-Pull** - Mengambil update dari GitHub secara otomatis
2. **Smart Auto-Push** - Mengirim commit ke GitHub secara otomatis

## Script yang tersedia

### 1. git-auto-pull.sh
- Pull update dari GitHub setiap 5 menit
- Otomatis stash perubahan lokal jika ada
- Jalankan `bun install` jika package.json berubah
- Log: `/opt/djiwatentramapp/logs/auto-pull.log`

### 2. git-smart-push.sh (RECOMMENDED)
- Cek setiap 10 menit apakah ada commit yang belum di-push
- HANYA push commit yang sudah dibuat manual
- Tidak akan auto-commit perubahan
- Log: `/opt/djiwatentramapp/logs/smart-auto-push.log`

### 3. git-auto-push.sh (USE WITH CAUTION)
- Auto-commit dan push SEMUA perubahan
- Default dimatikan
- Log: `/opt/djiwatentramapp/logs/auto-push.log`

## Cara kerja

### Auto-Pull (GitHub → VPS)
Setiap 5 menit, script akan:
1. Cek perubahan lokal
2. Jika ada, stash dulu
3. Fetch dari GitHub
4. Jika ada update, pull
5. Jika package.json berubah, jalankan `bun install`
6. Selesai

### Smart Auto-Push (VPS → GitHub)
Setiap 10 menit, script akan:
1. Cek apakah ada commit yang belum di-push
2. Jika ada, pull --rebase dulu
3. Push ke GitHub
4. Selesai

**Workflow yang direkomendasikan:**
1. Di VPS, buat perubahan
2. Commit manual: `git add . && git commit -m "pesan commit"`
3. Script smart-push akan otomatis push dalam 10 menit
4. Atau push manual: `git push origin main`

## Mengelola Cron Jobs

### Lihat cron jobs aktif:
```bash
crontab -l
```

### Edit cron jobs:
```bash
crontab -e
```

### Mengubah interval:
- `*/5 * * * *` = setiap 5 menit
- `*/10 * * * *` = setiap 10 menit
- `*/30 * * * *` = setiap 30 menit
- `0 * * * *` = setiap jam

### Mematikan auto-pull/push:
Hapus atau comment line di crontab:
```bash
crontab -e
# Tambahkan # di depan line untuk comment
```

## Cek Log

```bash
# Lihat log pull terbaru
tail -f /opt/djiwatentramapp/logs/auto-pull.log

# Lihat log push terbaru
tail -f /opt/djiwatentramapp/logs/smart-auto-push.log

# Lihat semua log
ls -la /opt/djiwatentramapp/logs/
```

## Troubleshooting

### Auto-push tidak berjalan:
1. Cek log: `cat /opt/djiwatentramapp/logs/smart-auto-push.log`
2. Pastikan ada commit yang belum di-push: `git log origin/main..HEAD`
3. Pastikan tidak ada perubahan uncommitted: `git status`

### Auto-pull tidak berjalan:
1. Cek log: `cat /opt/djiwatentramapp/logs/auto-pull.log`
2. Cek cron job: `crontab -l`
3. Pastikan script executable: `ls -la /opt/djiwatentramapp/scripts/git-*.sh`

### Konflik saat pull:
Script auto-pull akan stash perubahan lokal. Konflik bisa terjadi saat:
- Ada file yang diubah di kedua tempat (GitHub dan VPS)
- Stash gagal di-apply

Solusi: resolve manual di VPS, lalu commit.

## Mengaktifkan Full Auto-Push (HATI-HATI)

Jika kamu ingin semua perubahan otomatis di-commit dan push:

1. Edit crontab: `crontab -e`
2. Uncomment line git-auto-push.sh:
   ```
   */15 * * * * /opt/djiwatentramapp/scripts/git-auto-push.sh
   ```
3. Save

**PERINGATAN:** Ini akan membuat commit dengan pesan otomatis yang tidak deskriptif. Gunakan hanya untuk project pribadi atau development.

## Setup Ulang

Jika perlu setup ulang:
```bash
/opt/djiwatentramapp/scripts/setup-git-automation.sh
```

## Dibuat pada
24 April 2026
