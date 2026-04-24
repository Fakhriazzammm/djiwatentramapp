# Yumi AI Telegram Bot

Bot Telegram untuk membaca data YumiPOS dari Supabase dan menjawab KPI operasional harian.

## Lokasi
- Directory: `/opt/djiwatentramapp/yumi-ai-bot`
- Service: `yumi-ai-bot.service`

## Command
- `/kpi_hari_ini`
- `/top_produk`
- `/stok_menipis`
- `/absen_hari_ini`
- `/booking_aktif`
- `/briefing_hari_ini`

## Operasional Service
```bash
sudo systemctl status yumi-ai-bot.service
sudo systemctl restart yumi-ai-bot.service
journalctl -u yumi-ai-bot.service -f
```

## Konfigurasi
File env: `.env`
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ALLOWED_USERS` (comma-separated telegram user IDs)
