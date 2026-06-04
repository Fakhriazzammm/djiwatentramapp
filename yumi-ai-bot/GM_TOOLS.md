# Yumi General Manager Agents — Tools & Commands

Edit file ini untuk mendokumentasikan tools/capabilities yang dimiliki GM Agents.
Isi file ini otomatis dibaca sebagai konteks AI setiap kali ada chat.

---

## Telegram Commands

| Command | Fungsi |
|---------|--------|
| `/ringkasan` atau `omzet hari ini` | Ringkasan penjualan hari ini |
| `/ringkasan kemarin` | Ringkasan kemarin |
| `/top_produk` atau `produk terlaris` | Produk terlaris periode ini |
| `/stok_menipis` atau `stok habis` | Bahan baku yang perlu di-restok |
| `/absen_hari_ini` atau `absensi` | Kehadiran staff hari ini |
| `/booking_aktif` atau `reservasi` | Booking yang aktif/konfirmasi |
| `/briefing_hari_ini` atau `laporan` | Briefing bisnis harian lengkap |
| `/purchaselog` | Log pembelian inventori |
| `/marketlist` | Daftar belanja otomatis |
| `/export_jadwal [bulan] [tahun]` | Export jadwal shift ke file Excel |
| `/broadcast <pesan>` | Kirim ke SEMUA target (channel + grup) |
| `/sebarkan channel <pesan>` | Kirim ke channel 📣 Djiwa Tentram |
| `/sebarkan report <pesan>` | Kirim ke grup Report |
| `/help` | Bantuan lengkap |

## Schedule File Import

Kirim file **Excel (.xlsx)** jadwal shift ke chat bot, dan bot akan otomatis:
1. Parse file Excel (format matrix: MINGGU KE | HARI | TANGGAL | staff1 | staff2 | ...)
2. Cocokkan nama staff dengan database (termasuk fuzzy match via AI)
3. Auto-daftarkan staff baru + role baru jika belum ada
4. Hapus jadwal bulan yang sama (replace) dan insert jadwal baru
5. Balas ringkasan hasil import

## Inline Buttons

Semua fitur bisa diakses via tombol di keyboard:
```
📊 Ringkasan  🔥 Top Produk
⚠️ Stok       🕒 Absensi
📅 Booking    📋 Briefing    📝 Purchaselog
🛒 Marketlist 📤 Export Jadwal 📥 Import Jadwal
💬 Tanya Bebas
```

## AI Chat (free-text)

Kamu bisa menjawab langsung via AI chat:
- Query data: omzet, stok, absensi, booking, shift
- Analisis: top produk, tren penjualan, insight
- OCR: foto struk → ekstrak otomatis
- Broadcast: user minta "sebarkan ke channel" → arahkan ke /sebarkan

## Bot Lain (Orchestrator)

| Bot | Handle | Urusan |
|-----|--------|--------|
| **Yumi Finance** | @YummeFinanceAIbot | Keuangan detail, OCR struk, expense/income, akuntansi |
| **Yumi Purchasing** | @YumiPurchasingBot | Restok, supplier, marketlist, stok |
| **Yumi Supervisor** | @YummeSupervisorAIbot | Notifikasi order realtime (Barista & Kitchen) |

## Data Sources

- **pos_orders** — Order/penjualan (completed, pending, cancelled)
- **pos_inventory** — Stok bahan baku
- **pos_financial_transactions** — Transaksi keuangan (income/expense)
- **pos_shift_reports** — Laporan shift (AKTIF/SELESAI)
- **pos_attendance_logs** — Absensi check-in/out
- **pos_booking_orders** — Reservasi pelanggan
- **pos_products** — Menu/produk
- **pos_categories** — Kategori menu
- **pos_users_public** — Data staff
- **pos_ai_conversation_memory** — Riwayat chat

> Last updated: 30 May 2026
