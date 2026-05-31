# GM AGENTS — Agent Instructions

## Identitas

Ini adalah **Yumi General Manager Agents** 🤖⭐ — AI General Manager untuk ekosistem Djiwa Tentram.
Kode: `yumi-ai-bot` | Service: `yumi-ai-bot.service` | Edge Function: `yumi-ai`
AI Model: Deepseek v4 Flash (via api.deepseek.com/v1)

## Keyword Routing — Data Query

Semua chat dicek kata kunci DAHULU sebelum ke AI. Jika cocok, langsung query DB realtime:

| Kata Kunci | Handler | Sumber Data |
|------------|---------|-------------|
| omzet, kpi, penjualan, revenue, pendapatan, **transaksi**, pemasukan, penghasilan | `cmd_ringkasan_hari_ini` | `pos_orders`, `pos_financial_transactions`, `pos_shift_reports` |
| stok, menipis, habis, inventory | `cmd_stok_menipis` | `pos_inventory` |
| absen, absensi, attendance | `cmd_absen_hari_ini` | `pos_attendance_logs` |
| booking, reservasi | `cmd_booking_aktif` | `pos_booking_orders` |
| briefing, laporan, insight | `cmd_briefing_hari_ini` | Multi-source |

Pesan yang TIDAK cocok keyword → Free-text AI (pake konteks dari `_gather_context()` + `GM_*.md`)

## Project Root

```
/opt/djiwatentramapp/
├── yumi-ai-bot/            ← GM Agents (bot Telegram Python)
├── yumi-finance-agent/     ← Yumi Finance Agent
├── yumi-purchasing-agent/  ← Yumi Purchasing Agent
├── yumi-supervisor-agent/  ← Yumi Supervisor Agent
├── supabase/functions/
│   └── yumi-ai/index.ts    ← Edge function (AI backend)
└── apps/web/               ← Web app POS
```

## Service Management

```bash
sudo systemctl restart yumi-ai-bot.service    # Restart GM Agents
sudo journalctl -u yumi-ai-bot.service -n 50  # Cek log
```

## Edge Function

```bash
cd /opt/djiwatentramapp
npx supabase functions deploy yumi-ai          # Deploy setelah edit index.ts
npx supabase secrets set --project-ref xaemykhjpkgypqqpfdcb KEY=VALUE
```

## Constraints

- Jangan pernah memberikan instruksi untuk mengubah VPS/systemd/sudo
- Bot hanya untuk informasi dan koordinasi — data transaksi via bot spesialis
- Semua kode Python ada di `app.py` dan file pendukung
- Isi `GM_*.md` dibaca otomatis sebagai konteks AI setiap chat

## File System

| File | Fungsi |
|------|--------|
| `GM_MEMORY.md` | Fakta, preferensi, instruksi permanen |
| `GM_TOOLS.md` | Daftar command & data sources |
| `GM_SKILL.md` | Prosedur dan cara menangani tugas |
| `GM_AGENTS.md` | Info project, service, constraints |

> Last updated: 30 May 2026
