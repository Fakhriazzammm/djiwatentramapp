# Smoke Test Report — Djiwa Tentram App (YumiPOS)

**Tanggal**: 28 April 2026, 14:47–14:55 WIB  
**Tester**: Hermes Agent (deepseek-v4-pro)  
**Metode**: Non-visual QA (browser tool tidak tersedia di VPS ini — Chrome sandbox restriction)  
**Scope**: Full-stack — Supabase REST API, Edge Functions, Telegram Bot, Frontend Build, POS Data Queries

---

## Executive Summary

| Severity | Count |
|----------|-------|
| PASS     | 28    |
| BUG (HIGH) | 1   |
| WARNING  | 2     |
| **TOTAL** | **31** |

**Kesimpulan**: Aplikasi berfungsi normal secara keseluruhan. **1 bug HIGH ditemukan** — Edge Function `yumi-ai` action `sendTelegram` belum ter-deploy. 2 warnings minor: stok negatif dan frontend chunk size besar.

---

## 1. Supabase REST API (Public Views)

✅ **ALL 16/16 VIEWS RETURN HTTP 200**

| View | Status |
|------|--------|
| pos_orders | ✅ 200 |
| pos_products | ✅ 200 |
| pos_categories | ✅ 200 |
| pos_inventory | ✅ 200 |
| pos_financial_transactions | ✅ 200 |
| pos_shifts | ✅ 200 |
| pos_booking_orders | ✅ 200 |
| pos_active_discounts | ✅ 200 |
| pos_users_public | ✅ 200 |
| pos_attendance_logs | ✅ 200 |
| pos_inventory_transactions | ✅ 200 |
| pos_inventory_stores | ✅ 200 |
| pos_recipes | ✅ 200 |
| pos_hpp_calculations | ✅ 200 |
| pos_minigames | ✅ 200 |
| pos_shift_reports | ✅ 200 |

---

## 2. Supabase Edge Functions

### yumi-ai

| Action | Status | Detail |
|--------|--------|--------|
| yumiChat | ✅ 200 | Response: "Halo! Saya Yumi, asisten AI untuk sistem POS..." |
| generateBusinessBriefing | ✅ 200 | Briefing harian berhasil di-generate |
| bulkScanImageData | ⚠️ Not tested | Perlu gambar struk asli |
| **sendTelegram** | **❌ 404** | **"AI action tidak dikenali" — versi deployed tidak punya handler ini** |

### yumi-auth

| Action | Status | Detail |
|--------|--------|--------|
| listPublicUsers | ✅ 200 | Return 11 users (Admin, Ayunda Putri, Dafina Sayyida, dll) |
| loginWithPin | ✅ 400 (expected) | "PIN yang Anda masukkan salah" — validasi berfungsi |
| validateSession | ✅ 200 | Return {"session": null} untuk token kosong |
| logoutSession | ⚠️ Not tested | Butuh session token valid |

### auto-close-shifts
- ✅ 401 (expected) — butuh CRON_SECRET header
- Logic: auto-close shift yang melewati jadwal + 30 menit grace period

### send-telegram-report
- ✅ 401 (expected) — butuh auth
- Logic: proxy ke HTTP endpoint bot di port 8001

---

## 3. Telegram Bot (yumi-ai-bot)

| Check | Status | Detail |
|-------|--------|--------|
| systemctl status | ✅ active (running) | PID 1511698, sejak 27 Apr 12:53 |
| getUpdates polling | ✅ 200 | Setiap ~10 detik, no errors |
| getMe | ✅ | @YummeAIbot, ID 8393791022 |
| getWebhookInfo | ✅ | Polling mode (no webhook), pending_update_count: 0 |
| sendMessage (direct) | ✅ | Terkirim ke user 323151437, message_id 71 |
| HTTP /send-report (port 8001) | ✅ | POST → {"ok": true, "message_ids": [10]} |
| Journal errors (1 jam) | ✅ | No entries — zero errors |

---

## 4. Frontend (apps/web)

| Check | Status | Detail |
|-------|--------|--------|
| bun build (production) | ✅ | Build sukses 28.46s |
| TypeScript check | ✅ | tsc --noEmit PASSED (no errors) |
| PWA generation | ✅ | 84 entries precached (5072.66 KiB) |
| Route files | ✅ | 36 route files (TanStack Router) |
| Lazy chunks | ✅ | 25+ lazy-loaded route chunks |
| dist/ index.html | ✅ | SPA shell generated |

### Route Coverage

Semua route utama ter-build sebagai lazy chunks:
- `index.lazy` (landing)
- `login` (non-lazy, dimuat upfront)
- `dashboard.lazy`
- `menu.lazy`
- `booking.lazy`
- `attendance.index.lazy` + `attendance.$username.lazy`
- `home.lazy` + `home.$section.lazy`
- `$brandSlug.lazy` + `$brandSlug.minigames.lazy`
- Admin routes: `ai-chat`, `bar`, `booking`, `customer-service`, `discounts`, `finance`, `forecasting`, `hpp-calculator`, `inventory`, `kitchen`, `minigames`, `operational-team`, `orders`, `products`, `recipe`, `settings`

### Warnings
- ⚠️ Chunk size: `index-DWiq0we0.js` = 2,565 kB (melebihi 500 kB warning threshold). FaceRecognition chunk = 663 kB. Rekomendasi: code-split lebih agresif.

---

## 5. POS Core Features (Data Queries)

### Shift Aktif
- ✅ 1 shift aktif: "Shift Pagi", status AKTIF
- order_count: 0, daily_collected: 0, shift_collected: 0 (shift baru mulai)

### Orders Hari Ini
- ✅ 0 completed orders (shift baru mulai/tidak ada transaksi)

### Inventory
- ✅ Data tersedia, query berfungsi
- ⚠️ **WARNING**: "Kemangi Instant" quantity = -10 (stok negatif!)

### Booking Aktif
- ✅ 3 confirmed bookings:
  - BK-ACFWPXW (Ceng Hisyam, 10 pax, 20 Mar 2026)
  - BK-1LTE0MC (Dewi Nopiyanti, 7 pax, 20 Mar 2026)
  - BK-1TPFA3I (Yosep Adriana, 5 pax, 19 Mar 2026)

### Attendance Hari Ini
- ✅ Query berfungsi, hasil kosong (belum ada check-in hari ini)

---

## 6. Lingkungan & Infrastruktur

| Check | Status |
|-------|--------|
| Bun 1.3.13 | ✅ |
| Python venv (yumi-ai-bot) | ✅ |
| Supabase migrations (19 files) | ✅ |
| Systemd service enabled | ✅ |
| No journal errors | ✅ |

---

## Bug Detail

### BUG-HIGH-01: yumi-ai sendTelegram action 404

- **Severity**: HIGH
- **Category**: Functional / Deployment
- **URL**: `POST /functions/v1/yumi-ai` dengan `{"action":"sendTelegram",...}`
- **Expected**: Return `{"ok": true, "messageId": ...}` atau `{"ok": false, "error": "..."}`
- **Actual**: HTTP 404 `{"error":"AI action tidak dikenali"}`
- **Root cause**: Kode lokal `supabase/functions/yumi-ai/index.ts` (modified Apr 28 09:20) punya handler `sendTelegram` (line 213-273), tapi versi deployed di Supabase belum di-update.
- **Fix**: Deploy ulang function: `cd /opt/djiwatentramapp && supabase functions deploy yumi-ai`
- **Impact**: Frontend/Telegram bot tidak bisa mengirim pesan via Edge Function path ini. Namun, HTTP endpoint langsung di port 8001 (`/send-report`) berfungsi normal.

---

## Warnings

### WARN-01: Stok Negatif — Kemangi Instant = -10g
- Stok tidak boleh negatif. Perlu investigasi apakah ada consumption yang tidak tercatat atau restock yang terlewat.

### WARN-02: Frontend Bundle Size Besar
- `index-DWiq0we0.js` = 2,565 kB. Rekomendasi code-split lebih agresif (lazy-load face-api.js, recharts, xlsx, jspdf).

---

## Yang Tidak Di-Test (keterbatasan)

| Item | Alasan |
|------|--------|
| Visual/layout di browser | Chrome sandbox tidak tersedia di VPS |
| Face Recognition flow | Butuh webcam + browser |
| Thermal printer (ESC/POS) | Butuh hardware Bluetooth/USB |
| Payment gateway (Mayar) | Butuh sandbox credentials valid |
| bulkScanImageData | Butuh gambar struk asli |
| logoutSession | Butuh session token valid |
| Frontend di production (pos.yumme.id) | Tidak termasuk dalam scope smoke test lokal |

---

## Rekomendasi

1. **URGENT**: Deploy ulang `yumi-ai` Edge Function agar `sendTelegram` action tersedia.
2. Investigasi stok negatif "Kemangi Instant".
3. Pertimbangkan code-split frontend untuk mengurangi bundle size utama.
4. Setup cron job untuk `auto-close-shifts` dengan CRON_SECRET yang benar.
5. Setup cron job untuk laporan Telegram otomatis via `send-telegram-report`.
