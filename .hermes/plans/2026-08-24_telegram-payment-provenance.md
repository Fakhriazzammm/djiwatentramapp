# Plan: Standardisasi Label Pembayaran Djiwa App di Seluruh Apps dan Yumi Supervisor Bot

## Status

**Plan only — belum ada implementasi, deploy, migration, restart service, atau perubahan data production.**

## Goal

Membuat sumber dan metode pembayaran order terbaca jelas, konsisten, dan dapat dipercaya di seluruh ekosistem:

- Customer App: `djiwatentram.yumme.id`
- POS: `pos.yumme.id/menu`
- Admin: `admindjiwatentram.yumme.id`
- Yumi Supervisor Bot
- Grup Transaksi
- Grup Kitchen
- Grup Bar
- Laporan dan detail order internal

Standar tampilan untuk order yang berasal dari Djiwa App:

```text
Djiwa App - Bayar Tunai di Kasir
Djiwa App - Djiwa Pay
Djiwa App - QRIS
```

## Prinsip Data Utama

`source` dan `payment_method` harus dipisahkan.

```text
source = asal order
payment_method = cara pembayaran
```

### Kontrak canonical

| Asal order | `source` | `payment_method` | Label internal |
|---|---|---|---|
| Customer App | `customer_self_service` | `cash` atau `tunai` | `Djiwa App - Bayar Tunai di Kasir` |
| Customer App | `customer_self_service` | `wallet` atau `djiwa_pay` | `Djiwa App - Djiwa Pay` |
| Customer App | `customer_self_service` | `qris` atau `qris_mayar` | `Djiwa App - QRIS` |
| POS langsung | `pos` | `cash` atau `tunai` | `Tunai` |
| POS langsung | `pos` | `qris` | `QRIS` |
| POS langsung | `pos` | `wallet` atau `djiwa_pay` | `Djiwa Pay` |

Nilai `djiwaapp` tidak boleh dipakai sebagai pengganti `payment_method`, karena nilai itu hanya menjelaskan asal/channel dan dapat menyebabkan order QRIS terbaca sebagai Djiwa Pay.

## Temuan Codebase Saat Ini

### Customer App

Customer checkout sudah menampilkan tiga pilihan:

```text
Bayar Tunai di Kasir
Djiwa Pay
QRIS
```

Flow saat ini memakai pilihan internal `cashier`, `wallet`, dan `mayar`. Sebagian payload masih mengirim `paymentMethod: "djiwaapp"` untuk pilihan QRIS, sehingga perlu dinormalisasi ke `qris`.

### POS dan Admin

POS/Admin membuat order langsung dengan `source: "pos"`, tetapi payment method masih menggunakan kombinasi legacy seperti `mayar`, `cash`, `qris_mayar`, dan `open_bill`. Order Djiwa App yang dibaca oleh POS/Admin perlu ditampilkan dengan label yang mempertahankan provenance Djiwa App.

### Yumi Supervisor Bot

`yumi-supervisor-agent/app.py` sudah mengirim notifikasi ke tiga tujuan dan sudah memiliki `source_label` serta `payment_note`, tetapi `_payment_label()` masih memiliki mapping:

```text
djiwaapp → DJIWA PAY
wallet → DJIWA PAY
djiwa_pay → DJIWA PAY
```

Mapping tersebut tidak aman untuk QRIS Djiwa App. Formatter harus menerima `source` dan `payment_method` secara terpisah.

### Grup notifikasi

Yumi Supervisor sudah memiliki renderer terpisah untuk:

- Transaction group: `_send_transaction_notification()`
- Barista group: `_send_barista_notification()`
- Kitchen group: `_send_kitchen_notification()`
- Pembaruan pembayaran kasir

Ketiganya harus memakai satu formatter payment label canonical, bukan mapping masing-masing.

### Admin/POS display

Sebagian layar internal masih merender payment method dengan `.toUpperCase()` atau mapping sederhana. Ini menghasilkan label seperti `DJIWAAPP`, `WALLET`, atau `CASH`, sehingga perlu diarahkan ke formatter yang sama.

## Architecture yang Dipilih

### Satu shared payment provenance formatter

Buat formatter pure/reusable di shared package, misalnya:

```text
packages/yumipos-web-shared/src/lib/payment-label.ts
```

Untuk Python Supervisor, buat fungsi Python dengan aturan identik di module utilitas yang sudah digunakan `app.py`, atau implementasikan satu fungsi canonical di `yumi-supervisor-agent/app.py` jika struktur shared lintas bahasa belum tersedia.

Kontrak TypeScript yang disarankan:

```typescript
type PaymentProvenanceInput = {
  source?: string | null;
  paymentMethod?: string | null;
  paymentReceiptKind?: string | null;
};

formatPaymentLabel(input, { includeAppPrefix: true | false }): string;
```

Aturan:

1. Jika `source === "customer_self_service"`, gunakan prefix `Djiwa App -`.
2. `cash`, `tunai`, atau `cashier_pending` → `Bayar Tunai di Kasir`.
3. `wallet`, `djiwa_pay` → `Djiwa Pay`.
4. `qris`, `qris_mayar`, `mayar` → `QRIS` hanya jika provenance QRIS dapat dibuktikan dari flow/gateway.
5. Jika `source === "pos"`, jangan gunakan prefix Djiwa App.
6. Jika legacy value ambigu seperti `djiwaapp` tidak bisa dibuktikan, tampilkan `Metode pembayaran lama` atau `Pembayaran tidak teridentifikasi`; jangan menebak Djiwa Pay.
7. Jangan mengubah histori order hanya demi mengubah label.

## Alur Data End-to-End

```text
Customer memilih metode
        │
        ├── cashier → payment_method=cash
        ├── wallet  → payment_method=wallet
        └── QRIS    → payment_method=qris
        │
        ▼
createOrder()
  source=customer_self_service
  payment_method=<canonical value>
  payment_receipt_kind=<state>
        │
        ▼
pos.orders
        │
        ├── Customer receipt/status
        ├── POS/Admin order list/detail
        ├── Yumi Supervisor polling
        │       ├── Grup Transaksi
        │       ├── Grup Kitchen
        │       └── Grup Bar
        └── laporan/reconciliation
```

## Database Schema dan REST Mapping

Tidak direncanakan migration schema pada tahap pertama. Gunakan kolom yang sudah tersedia dan verifikasi nilainya:

```text
pos.orders.source
pos.orders.payment_method
pos.orders.payment_receipt_kind
pos.orders.payment_gateway
pos.orders.customer_source_id
pos.orders.gateway_invoice_id
pos.orders.status
```

Mapping REST/view yang harus diaudit:

| Database | View/consumer | Kegunaan |
|---|---|---|
| `pos.orders.source` | `pos_orders.source` | menentukan asal order |
| `pos.orders.payment_method` | `pos_orders.paymentMethod` | menentukan metode internal |
| `pos.orders.payment_receipt_kind` | `pos_orders.paymentReceiptKind` | status bayar tunai/wallet/gateway |
| `pos.orders.payment_gateway` | order detail/receipt | metadata QRIS/provider |
| `pos.orders.customer_source_id` | notification/admin | member vs guest |

Query audit read-only sebelum implementasi:

```sql
select
  source,
  payment_method,
  payment_receipt_kind,
  payment_gateway,
  customer_source_id,
  count(*)
from pos.orders
where created_at >= <wib_period_start>
group by 1,2,3,4,5
order by count(*) desc;
```

Tujuannya menemukan kombinasi legacy sebelum menentukan compatibility mapping.

## Perubahan Customer App

Target: `apps/customer`, domain `djiwatentram.yumme.id`.

### Checkout

Pertahankan UI:

```text
Bayar Tunai di Kasir
Djiwa Pay
QRIS
```

Ubah payload internal menjadi:

```text
cashier → cash
wallet  → wallet
mayar   → qris
```

`source` tetap:

```text
customer_self_service
```

### Payment state

- Tunai: `cash` + `cashier_pending`
- Djiwa Pay: `wallet` + `wallet_pending` lalu settlement wallet
- QRIS: `qris` + `gateway_pending` lalu settlement webhook/provider

### Receipt

Customer-facing receipt tetap cukup menampilkan:

```text
Bayar Tunai di Kasir
Djiwa Pay
QRIS
```

Prefix `Djiwa App -` digunakan untuk internal provenance, bukan harus ditampilkan di tombol customer.

### Contact validation

Pertahankan gate yang sudah ada untuk pembayaran online:

- nama customer
- email customer
- nomor WhatsApp customer

Jangan memasukkan nomor/email restoran sebagai fallback.

## Perubahan POS — `pos.yumme.id/menu`

Ya, halaman kasir `/menu` di `pos.yumme.id/menu` juga berubah pada sisi tampilan dan mapping data, tetapi **tidak mengubah konsep metode pembayaran POS langsung**.

### Yang berubah di halaman `/menu`

1. **Order Customer App yang masuk ke layar kasir**
   - Badge/label pembayaran menampilkan provenance lengkap:
     - `Djiwa App - Bayar Tunai di Kasir`
     - `Djiwa App - Djiwa Pay`
     - `Djiwa App - QRIS`
   - Source dan payment ditampilkan terpisah bila ruang layar memungkinkan:
     ```text
     Sumber: Djiwa App Member
     Pembayaran: Djiwa App - QRIS
     ```

2. **Order langsung yang dibuat kasir**
   - Tetap memakai label pendek karena sumbernya sudah POS:
     - `Tunai`
     - `QRIS`
     - `Djiwa Pay` jika tersedia
   - Tidak diberi prefix `Djiwa App -`.

3. **Modal pembayaran kasir**
   - Label UI tetap membedakan `Tunai`, `QRIS Statis`, dan `QRIS Dinamis`.
   - `QRIS Dinamis` adalah channel QRIS melalui provider, tetapi label bisnis yang tampil ke operator/customer tetap `QRIS` pada ringkasan dan notifikasi.
   - Jika kasir menangani order Djiwa App, modal harus mempertahankan metode asli order dan tidak menggantinya hanya karena tombol kasir dibuka.

4. **Transaction alert/popup di halaman kasir**
   - Popup order QRIS Djiwa App tidak boleh lagi menggunakan teks generik yang seolah-olah semua order Djiwa App adalah Djiwa Pay.
   - Contoh:
     ```text
     Sumber: Djiwa App Member
     Pembayaran: Djiwa App - QRIS
     ```

5. **Konfirmasi pembayaran tunai**
   - Untuk order Djiwa App yang memilih tunai, tombol `Sudah Dibayar` tetap melakukan settlement kasir yang sama.
   - Label pada detail/popup berubah menjadi:
     ```text
     Djiwa App - Bayar Tunai di Kasir
     ```
   - Status `paid` hanya ditulis setelah settlement berhasil; perubahan label tidak boleh mengubah status.

6. **Riwayat transaksi dan detail order di POS**
   - Tidak lagi menampilkan nilai mentah seperti `DJIWAAPP`, `WALLET`, atau `CASH` untuk order Djiwa App.
   - Menggunakan formatter berbasis `source + payment_method + payment_receipt_kind`.
   - Contoh tabel:
     ```text
     Djiwa App — QRIS
     Djiwa App — Djiwa Pay
     Djiwa App — Bayar Tunai di Kasir
     POS Kasir — Tunai
     POS Kasir — QRIS
     ```

7. **Laporan/rekonsiliasi shift di POS**
   - Agregasi harus dapat membedakan transaksi POS langsung dan transaksi Djiwa App.
   - QRIS Djiwa App tidak boleh dicampur dengan QRIS statis POS jika laporan membutuhkan breakdown sumber.
   - Djiwa Pay tidak boleh dihitung dari `source=customer_self_service` saja; harus membaca `payment_method`.

### Target file POS

- `apps/pos/src/routes/menu.lazy.tsx` — producer dan handler order/payment di halaman kasir
- `apps/pos/src/components/pos/payment-modal.tsx` — pilihan dan label pembayaran kasir
- `apps/pos/src/components/pos/menu-sidebar.tsx` — order detail, payment badge, dan aksi `Sudah Dibayar`
- `apps/pos/src/components/pos/transaction-alert-popup.tsx` — popup pembayaran/order
- `apps/pos/src/components/pos/transaction-history-sidebar.tsx` — filter dan detail histori
- `apps/pos/src/components/pos/shift-payment-reconciliation.tsx` — breakdown pembayaran shift
- `apps/pos/src/routes/admin/orders.lazy.tsx` — daftar/detail order yang dibaca dari POS
- `apps/pos/src/routes/laporan.lazy.tsx` — agregasi laporan POS
- shared payment formatter — dipakai agar semua label konsisten

### Yang tidak berubah di halaman `/menu`

- Flow buka/tutup shift.
- Settlement RPC kasir dan proteksi idempotency.
- Tombol produksi `Dibuat`/`Selesai` di Kitchen/Bar.
- Metode internal yang benar-benar dipakai order POS langsung.
- Riwayat transaksi lama tidak diubah massal.

## Perubahan POS — `pos.yumme.id/menu`

Target file awal yang perlu diaudit/diperbarui:

- `apps/pos/src/routes/menu.lazy.tsx`
- `apps/pos/src/components/pos/payment-modal.tsx`
- `apps/pos/src/components/pos/menu-sidebar.tsx`
- `apps/pos/src/components/pos/transaction-history-sidebar.tsx`
- `apps/pos/src/routes/admin/orders.lazy.tsx`
- `apps/pos/src/routes/laporan.lazy.tsx`
- `apps/pos/src/components/pos/transaction-alert-popup.tsx`
- `apps/pos/src/components/pos/shift-payment-reconciliation.tsx`

### POS order langsung

Tampilkan label biasa:

```text
Tunai
QRIS
Djiwa Pay
```

Jangan menambahkan prefix `Djiwa App -` karena order tersebut dibuat langsung oleh kasir.

### Order Djiwa App yang dibaca POS

Tampilkan provenance lengkap:

```text
Djiwa App - Bayar Tunai di Kasir
Djiwa App - Djiwa Pay
Djiwa App - QRIS
```

Pada tabel, format ringkas yang direkomendasikan:

```text
Djiwa App — QRIS
Djiwa App — Djiwa Pay
Djiwa App — Bayar Tunai di Kasir
```

Detail order dapat memakai format lengkap.

### Payment modal POS

Pisahkan:

- order langsung POS
- order customer self-service yang sedang dibayar/ditindaklanjuti kasir

Jangan mengubah status payment hanya karena label UI berubah. Settlement tunai tetap memakai RPC/flow settlement yang sudah ada dan harus idempotent.

## Perubahan Saat Tutup Kasir / Akhiri Shift

Perubahan label pembayaran juga harus masuk ke flow tutup kasir di `pos.yumme.id/menu`, tetapi **tidak boleh mengubah rumus rekonsiliasi kas**.

### Prinsip utama tutup kasir

Tutup kasir tetap menghitung:

```text
Penjualan Tunai vs Uang Fisik
```

Rumus tetap:

```typescript
selisih = uangFisik - penjualanTunai;
```

### Ringkasan tutup kasir di POS

Bagian `DI SISTEM` perlu menampilkan breakdown sumber dan metode secara jelas:

```text
━━━ DI SISTEM ━━━
💰 Modal Kasir: Rp 150.000
💵 Penjualan Tunai: Rp 315.000
   POS Kasir - Tunai: Rp 200.000
   Djiwa App - Bayar Tunai di Kasir: Rp 115.000
💳 Non-Tunai: Rp 383.000
   POS Kasir - QRIS: Rp 180.000
   Djiwa App - Djiwa Pay: Rp 103.000
   Djiwa App - QRIS: Rp 100.000
💸 Pengeluaran: Rp 50.000
📦 Item Terjual: 11
🏷 Diskon: Rp 10.000
```

Aturan:

- `Djiwa App - Bayar Tunai di Kasir` masuk ke `Penjualan Tunai`.
- `Djiwa App - Djiwa Pay` dan `Djiwa App - QRIS` masuk ke `Non-Tunai`.
- Modal kasir tidak masuk penjualan.
- Pengeluaran tidak mengubah nilai penjualan tunai.
- Order `pending` dan `cancelled` tidak masuk summary.
- Order yang memiliki status Bar dan Kitchen hanya dihitung sekali.

### Bagian `DI LACI`

Tetap mempertahankan aturan yang sudah disepakati:

```text
━━━ DI LACI ━━━
💰 Modal Kasir: Rp 150.000
💵 Uang Fisik: Rp 380.000
```

`Modal Kasir` di `DI LACI` harus sama persis dengan `Modal Kasir` di `DI SISTEM`. Jangan menggantinya menjadi `Saran Setoran`.

### Bagian `SELISIH`

Tetap menggunakan penjualan tunai gabungan POS dan Djiwa App:

```text
━━━ SELISIH ━━━
💵 Penjualan Tunai: Rp 315.000
   POS Kasir - Tunai: Rp 200.000
   Djiwa App - Bayar Tunai di Kasir: Rp 115.000
💵 Uang Fisik: Rp 380.000
📊 Selisih: ⬆️ Rp 65.000
```

Rincian hanya bersifat audit; angka utama tetap:

```text
Selisih = Uang Fisik - Penjualan Tunai
```

### Notifikasi laporan tutup kasir melalui dua owner bot

Laporan tutup kasir harus dikirim melalui owner yang jelas dan tidak boleh hanya mengandalkan satu jalur:

| Tujuan | Owner | Fungsi |
|---|---|---|
| Grup Report | Yumi General Manager Agent | laporan lengkap penutupan shift dan rekonsiliasi |
| Grup Transaksi | Yumi Supervisor Bot | recap transaksi operasional dan payment provenance |
| Grup Kitchen | Yumi Supervisor Bot | recap/operasional order makanan dan status produksi |
| Grup Bar | Yumi Supervisor Bot | recap/operasional order minuman dan status produksi |

#### Yumi General Manager Agent → Grup Report

Laporan penutupan shift yang dikirim General Manager Agent harus memuat:

```text
📋 📊 LAPORAN SHIFT
━━━━━━━━━━━━━━━
🏪 Djiwa Tentram
🔄 Shift Pagi
👤 Kasir: Nama Kasir
👥 Tim
   Barista: Nama Staff
   Kitchen: Nama Staff
━━━ DI SISTEM ━━━
💰 Modal Kasir: Rp 150.000
💵 Penjualan Tunai: Rp 315.000
   POS Kasir - Tunai: Rp 200.000
   Djiwa App - Bayar Tunai di Kasir: Rp 115.000
💳 Non-Tunai: Rp 383.000
   POS Kasir - QRIS: Rp 180.000
   Djiwa App - Djiwa Pay: Rp 103.000
   Djiwa App - QRIS: Rp 100.000
💸 Pengeluaran: Rp 50.000
📦 Item Terjual: 11
🏷 Diskon: Rp 10.000
━━━ DI LACI ━━━
💰 Modal Kasir: Rp 150.000
💵 Uang Fisik: Rp 380.000
━━━ SELISIH ━━━
💵 Penjualan Tunai: Rp 315.000
💵 Uang Fisik: Rp 380.000
📊 Selisih: ⬆️ Rp 65.000
📝 Catatan: -
━━━━━━━━━━━━━━━
🕐 Friday, 12 June 2026 — 07:26 sd 14:27 WIB
```

Sumber angka harus berasal dari summary/hasil `endShift()` yang sama dengan data yang disimpan ke `pos.shifts`. General Manager Agent tidak menghitung ulang dengan sumber yang berbeda jika summary authoritative tersedia.

#### Yumi Supervisor Bot → Grup Transaksi

Supervisor Bot mengirim recap transaksi shift dengan fokus:

```text
📊 REKAP TRANSAKSI SHIFT
━━━━━━━━━━━━━━━
🔄 Shift Pagi
👤 Kasir: Nama Kasir
🕐 07:26 sd 14:27 WIB
━━━ PEMBAYARAN ━━━
💵 POS Kasir - Tunai: 12 transaksi — Rp 200.000
💵 Djiwa App - Bayar Tunai di Kasir: 4 transaksi — Rp 115.000
💳 POS Kasir - QRIS: 5 transaksi — Rp 180.000
💳 Djiwa App - Djiwa Pay: 3 transaksi — Rp 103.000
💳 Djiwa App - QRIS: 2 transaksi — Rp 100.000
━━━ TOTAL ━━━
🧾 Total Transaksi: 26
💰 Total Penjualan: Rp 698.000
━━━━━━━━━━━━━━━
```

Supervisor menggunakan settled `pos.orders` pada window shift, deduplicate berdasarkan order ID/order number, dan tidak menghitung status Kitchen/Bar sebagai transaksi tambahan.

#### Yumi Supervisor Bot → Grup Kitchen dan Bar

Order baru pada Kitchen dan Bar memakai payment/source line yang sama dengan Grup Transaksi:

```text
🍳 PESANAN BARU — 🕐 19:31
📲 SUMBER: Djiwa App Member
💳 PEMBAYARAN: Djiwa App - QRIS
────────────
🆔 ORD-001
👤 Azzam
```

```text
☕ PESANAN BARU — 🕐 19:31
📲 SUMBER: Djiwa App Guest
💳 PEMBAYARAN: Djiwa App - Djiwa Pay
────────────
🆔 ORD-001
👤 Azzam
```

Kitchen dan Bar tetap fokus pada item dan status produksi. Payment label ditampilkan sebagai provenance, tetapi tidak boleh mengubah urutan produksi atau status `Dibuat/Selesai`.

#### Tidak boleh ada duplikasi laporan

Arsitektur pengiriman harus mempertahankan pemisahan:

```text
POS tutup shift
   ├─ persist pos.shifts terlebih dahulu
   ├─ General Manager Agent → Grup Report
   └─ Supervisor Bot → Grup Transaksi
                         ├─ Grup Kitchen jika ada makanan
                         └─ Grup Bar jika ada minuman
```

Aturan delivery:

- General Manager Agent tidak mengirim ulang recap transaksi yang menjadi owner Supervisor Bot.
- Supervisor Bot tidak mengirim laporan shift lengkap yang menjadi owner General Manager Agent.
- Report dan Transaction memakai cursor/dedupe terpisah.
- Cursor target hanya maju setelah target Telegram sukses.
- Gunakan `Promise.allSettled` agar kegagalan satu tujuan tidak membatalkan tujuan lain.
- Simpan log per target: owner bot, chat ID, order/shift ID, status HTTP Telegram, dan timestamp.
- Jika pengiriman gagal, tetap retryable dan tidak membuat order/shift baru.
- Jangan reset cursor global untuk melakukan backfill karena dapat menggandakan Kitchen/Bar.

#### Kontrak payload antar aplikasi dan bot

Payload laporan tutup shift yang dikirim dari POS harus memiliki data terstruktur, bukan hanya teks yang harus diparsing ulang:

```json
{
  "event": "shift_closed",
  "shiftId": "shift-id",
  "shiftName": "Shift Pagi",
  "cashierName": "Nama Kasir",
  "startTime": 0,
  "endTime": 0,
  "summary": {
    "cashRevenue": 315000,
    "nonCashRevenue": 383000,
    "totalRevenue": 698000,
    "totalExpenses": 50000,
    "totalDiscount": 10000,
    "totalItemsSold": 11,
    "paymentBreakdown": {
      "posCash": 200000,
      "djiwaAppCashier": 115000,
      "posQris": 180000,
      "djiwaAppWallet": 103000,
      "djiwaAppQris": 100000
    }
  },
  "endingCashPhysical": 380000,
  "cashBreakdown": {},
  "source": "pos_shift_close"
}
```

General Manager Agent dan Supervisor Bot merender payload tersebut ke format masing-masing tanpa mengubah angka atau mengarang payment breakdown.

### Notifikasi laporan tutup kasir

Laporan shift ke grup Report/Transaction memakai label yang sama:

```text
━━━ DI SISTEM ━━━
💵 Penjualan Tunai: Rp 315.000
   POS Kasir - Tunai: Rp 200.000
   Djiwa App - Bayar Tunai di Kasir: Rp 115.000
💳 Non-Tunai: Rp 383.000
   POS Kasir - QRIS: Rp 180.000
   Djiwa App - Djiwa Pay: Rp 103.000
   Djiwa App - QRIS: Rp 100.000
```

Jika breakdown sumber tidak tersedia pada summary lama, hanya tampilkan total yang benar-benar tersimpan. Jangan mengarang rincian historis.

### Sumber data tutup kasir

| Data | Sumber |
|---|---|
| Penjualan tunai | settled `pos.orders`/summary berdasarkan `source` dan `payment_method` |
| Djiwa App - Bayar Tunai di Kasir | `customer_self_service` + `cash`/`tunai` |
| Djiwa App - Djiwa Pay | `customer_self_service` + `wallet`/`djiwa_pay` |
| Djiwa App - QRIS | `customer_self_service` + `qris`/`qris_mayar` |
| POS Kasir - Tunai | `pos` + `cash`/`tunai` |
| POS Kasir - QRIS | `pos` + `qris`/`qris_mayar` |
| Pengeluaran | `pos.financial_transactions`, `tx_type=expense` |
| Uang fisik | input pecahan → `ending_cash_physical` |
| Modal kasir | `starting_cash` |

### Gate tutup kasir tidak berubah

Perubahan label tidak boleh melemahkan aturan operasional:

- Tutup sebelum `closeTime` tetap diblokir dalam WIB.
- Attendance aktif tetap memblokir final close.
- Error query attendance atau schedule tetap fail-closed.
- POS tidak menambahkan tombol `Absen Keluar`; checkout tetap melalui Yumi HRD bot.
- Validasi harus diulang di handler submit, bukan hanya disabled state UI.

### Notifikasi tetap best-effort

Urutan tetap:

```text
Validasi schedule/attendance
→ hitung rekonsiliasi
→ simpan penutupan shift
→ kirim notifikasi
```

Kegagalan notifikasi tidak membatalkan financial close. Target Report dan Transaction dicoba independen dengan `Promise.allSettled`; cursor setiap target hanya maju setelah target tersebut sukses.

### File tutup kasir yang diaudit

- `apps/pos/src/components/pos/menu-sidebar.tsx`
- `apps/pos/src/hooks/use-hybrid-write-actions.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-ops-data.ts`
- `apps/pos/src/components/pos/shift-payment-reconciliation.tsx`
- `apps/pos/src/routes/laporan.lazy.tsx`
- `yumi-supervisor-agent/app.py`
- `yumi-ai-bot/app.py` jika menjadi consumer laporan shift

### Verifikasi wajib

- Campuran POS Tunai + Djiwa App Tunai menghasilkan `Penjualan Tunai` yang benar.
- POS QRIS + Djiwa Pay + Djiwa App QRIS menghasilkan `Non-Tunai` yang benar.
- `Selisih` tetap `Uang Fisik - Penjualan Tunai`.
- `Modal Kasir` di `DI SISTEM` dan `DI LACI` sama.
- Tidak ada double count akibat status Bar/Kitchen.
- Kegagalan notifikasi tidak membatalkan penutupan shift.

## Perubahan Admin — `admindjiwatentram.yumme.id`

Target file awal:

- `apps/admin/src/routes/menu.lazy.tsx`
- `apps/admin/src/routes/admin/orders.lazy.tsx`
- `apps/admin/src/routes/admin/finance/transactions/-components/transaction-detail-report.tsx`
- `apps/admin/src/routes/laporan.lazy.tsx`
- komponen shared formatter jika dipakai oleh Admin

### Admin order list/detail

Ganti render mentah seperti:

```typescript
(order.paymentMethod || "-").toUpperCase()
```

menjadi formatter berbasis:

```text
source + payment_method + payment_receipt_kind
```

Contoh:

```text
Sumber: Djiwa App Member
Pembayaran: Djiwa App - QRIS
```

```text
Sumber: POS Kasir
Pembayaran: Tunai
```

### Laporan

Pisahkan agregasi:

```text
POS Kasir - Tunai
POS Kasir - QRIS
Djiwa App - Bayar Tunai di Kasir
Djiwa App - Djiwa Pay
Djiwa App - QRIS
```

Agregasi tidak boleh mengelompokkan semua `djiwaapp` ke Djiwa Pay.

## Perubahan Yumi Supervisor Bot

Target utama:

```text
yumi-supervisor-agent/app.py
```

### Formatter canonical Python

Refactor `_payment_label()` agar menerima konteks lengkap:

```python
format_payment_label(
    payment_method,
    source,
    payment_receipt_kind=None,
    payment_gateway=None,
)
```

Aturan utama:

```text
customer_self_service + cash/tunai/cashier_pending
→ Djiwa App - Bayar Tunai di Kasir

customer_self_service + wallet/djiwa_pay
→ Djiwa App - Djiwa Pay

customer_self_service + qris/qris_mayar/mayar
→ Djiwa App - QRIS

pos + cash/tunai
→ Tunai

pos + qris/qris_mayar/mayar
→ QRIS

pos + wallet/djiwa_pay
→ Djiwa Pay
```

Hapus perilaku:

```text
djiwaapp → DJIWA PAY
```

### Query order

Pastikan query worker mengambil field:

```text
source
paymentMethod
paymentReceiptKind
paymentGateway
customerSourceId
```

Field `source` harus diteruskan eksplisit ke semua renderer; formatter tidak boleh menebak source dari nama customer, nomor order, atau payment text.

## Perubahan Grup Transaksi

Function:

```text
_send_transaction_notification()
```

Format yang disepakati:

```text
📍 STRUK NO. 12 - DINE IN
🧾 Pesanan Baru — 19:31
📲 SUMBER: Djiwa App Member
💳 PEMBAYARAN: Djiwa App - QRIS
────────────
🆔 ORD-001
💰 Rp15.000
👤 Azzam
```

Untuk tunai yang belum dibayar:

```text
💳 PEMBAYARAN: Djiwa App - Bayar Tunai di Kasir
⚠️ BELUM LUNAS — BAYAR KE KASIR
```

Untuk POS langsung:

```text
📲 SUMBER: POS Kasir
💳 PEMBAYARAN: Tunai
```

## Perubahan Grup Kitchen

Function:

```text
_send_kitchen_notification()
```

Format payment/source diletakkan di bawah judul dan sebelum separator:

```text
🍳 PESANAN BARU — 🕐 19:31
📲 SUMBER: Djiwa App Guest
💳 PEMBAYARAN: Djiwa App - QRIS
────────────
🆔 ORD-001
👤 Azzam
```

Informasi item makanan, promo, catatan, dan tombol `Dibuat/Selesai` tetap dipertahankan.

## Perubahan Grup Bar

Function:

```text
_send_barista_notification()
```

Format sama dengan Kitchen:

```text
☕ PESANAN BARU — 🕐 19:31
📲 SUMBER: Djiwa App Member
💳 PEMBAYARAN: Djiwa App - Djiwa Pay
────────────
🆔 ORD-001
👤 Azzam
```

Tidak membuat format berbeda antara Bar dan Kitchen agar operator tidak perlu memahami dua standar.

## Perubahan Notifikasi Pembayaran Tunai

Function/flow pembaruan pembayaran kasir harus mempertahankan source dan label payment yang sama.

### Sebelum dibayar

```text
🔔 PEMBARUAN PEMBAYARAN — 19:31
📲 SUMBER: Djiwa App Guest
💳 PEMBAYARAN: Djiwa App - Bayar Tunai di Kasir
⚠️ BELUM LUNAS — BAYAR KE KASIR
```

### Setelah kasir mengonfirmasi

```text
🔔 PEMBARUAN PEMBAYARAN — 19:45
📲 SUMBER: Djiwa App Guest
💳 PEMBAYARAN: Djiwa App - Bayar Tunai di Kasir
✅ SUDAH LUNAS — PEMBAYARAN DITERIMA DI KASIR
```

## Integrasi Payment Gateway dan Wallet

### QRIS/Mayar

- Mayar hanya provider untuk metode `QRIS`.
- Jangan menyimpan `djiwaapp` sebagai payment method QRIS.
- `payment_gateway.provider = mayar` boleh dipertahankan sebagai metadata provider.
- Settlement tetap menunggu webhook/provider verification.
- Redirect browser bukan bukti pembayaran.

### Djiwa Pay

- `payment_method = wallet` atau canonical `djiwa_pay`.
- Hold/capture/release tetap berjalan seperti sekarang.
- Label `Djiwa Pay` tidak boleh disimpulkan dari `source=customer_self_service` saja.

### Tunai

- `payment_method = cash` atau `tunai`.
- `payment_receipt_kind = cashier_pending` selama belum dikonfirmasi.
- Settlement memakai flow/RPC kasir existing.
- Notifikasi tidak boleh menandai lunas sebelum settlement berhasil.

## AI/LLM dan Purchasing Agent Integration

Tidak ada perubahan business logic untuk AI atau purchasing agent. Namun semua consumer yang membuat laporan/summary pembayaran harus menggunakan payment provenance canonical:

- Yumi Supervisor daily report
- Yumi AI bot revenue/report jika membaca `pos_orders`
- Finance analyzer jika menampilkan channel pembayaran
- Purchasing agent tidak mengubah payment provenance order

Audit caller dilakukan agar tidak ada formatter lain yang tetap menganggap `djiwaapp` = Djiwa Pay.

## UI/UX Specification

### Customer App

- Tiga pilihan selalu memakai label pendek yang jelas.
- State disabled wallet tetap menjelaskan saldo tidak cukup.
- QRIS menampilkan status menunggu pembayaran, bukan langsung lunas.
- Tunai menampilkan instruksi tunjukkan receipt ke kasir.

### POS/Admin

- Gunakan badge berbeda untuk source dan payment.
- Source: `Djiwa App Member`, `Djiwa App Guest`, atau `POS Kasir`.
- Payment: label canonical.
- Jangan memakai uppercase mentah dari database.
- Loading/empty/error tetap dipertahankan.
- Jika data legacy ambigu, tampilkan `Metode pembayaran lama` dan sediakan detail raw untuk admin, bukan tebakan.

### Notifikasi

- Source dan payment berada di lokasi yang sama pada Transaksi, Kitchen, dan Bar.
- Tidak menampilkan dua label yang bertentangan, misalnya `SUMBER: Djiwa App` tetapi `PEMBAYARAN: DJIWA PAY` untuk order QRIS.
- Dedupe key notifikasi tidak berubah.

## No-Hardcode Audit

Yang boleh hardcoded sebagai vocabulary bisnis:

```text
Djiwa App
Bayar Tunai di Kasir
Djiwa Pay
QRIS
POS Kasir
```

Yang tidak boleh di-hardcode sebagai data transaksi:

- nama customer
- email customer
- nomor WhatsApp
- source order
- status pembayaran
- provider invoice
- nominal pembayaran

Source dan payment harus berasal dari row order/database. Label hanya hasil mapping deterministik.

## Dependency Graph dan Wave Plan

### Wave 1 — Audit/read-only dan kontrak

- Audit seluruh producer `payment_method` di Customer, POS, Admin.
- Audit seluruh consumer/formatter di Supervisor dan AI bot.
- Query kombinasi nilai payment/source production secara read-only.
- Finalisasi compatibility mapping legacy.

### Wave 2 — Fondasi formatter dan producer

- Tambah formatter shared TypeScript.
- Tambah formatter Python Supervisor.
- Perbaiki Customer producer agar QRIS menyimpan `qris`, wallet menyimpan `wallet`, tunai menyimpan `cash`.
- Pastikan backward compatibility untuk order lama.

### Wave 3 — Consumer apps

- Update POS menu/history/report/detail.
- Update Admin order/detail/report.
- Update Customer receipt jika diperlukan.

### Wave 4 — Notification fan-out

- Tetapkan owner delivery: General Manager → Report, Supervisor → Transaction/Kitchen/Bar.
- Definisikan payload `shift_closed` terstruktur dan routing target.
- Pisahkan cursor/dedupe per owner dan per target.
- Update formatter Grup Report milik General Manager.
- Update formatter Grup Transaksi.
- Update formatter Kitchen.
- Update formatter Bar.
- Update cashier payment update.
- Pastikan semua memakai formatter yang sama.

### Wave 5 — Test dan release

- Unit test formatter dengan matrix source/payment.
- Test order baru non-payment atau mock boundary tanpa settlement nyata.
- Build Customer, POS, Admin.
- `py_compile` Supervisor.
- Verifikasi source/bundle/lazy chunk.
- Deploy hanya app/function/service yang berubah.
- Restart hanya service Supervisor jika source bot berubah; jangan restart stack Supabase tanpa kebutuhan.

## Test Matrix

| Source | Payment | Expected label |
|---|---|---|
| `customer_self_service` | `cash` | Djiwa App - Bayar Tunai di Kasir |
| `customer_self_service` | `tunai` | Djiwa App - Bayar Tunai di Kasir |
| `customer_self_service` | `cashier_pending` context | Djiwa App - Bayar Tunai di Kasir |
| `customer_self_service` | `wallet` | Djiwa App - Djiwa Pay |
| `customer_self_service` | `djiwa_pay` | Djiwa App - Djiwa Pay |
| `customer_self_service` | `qris` | Djiwa App - QRIS |
| `customer_self_service` | `qris_mayar` | Djiwa App - QRIS |
| `pos` | `cash` | Tunai |
| `pos` | `qris` | QRIS |
| `pos` | `wallet` | Djiwa Pay |
| legacy ambiguous | `djiwaapp` | Metode pembayaran lama / tidak teridentifikasi |

## Acceptance Criteria

- [ ] Customer App menampilkan tiga pilihan: Bayar Tunai di Kasir, Djiwa Pay, QRIS.
- [ ] Customer QRIS tersimpan sebagai `payment_method=qris`, bukan `djiwaapp`.
- [ ] Customer wallet tersimpan sebagai `wallet`/canonical `djiwa_pay`.
- [ ] Customer tunai tersimpan sebagai `cash`/`tunai` dengan state pending yang benar.
- [ ] POS direct order tidak mendapat prefix Djiwa App.
- [ ] POS yang membaca order Customer App menampilkan label Djiwa App lengkap.
- [ ] Admin order/detail/report menampilkan source dan payment terpisah.
- [ ] Grup Transaksi, Kitchen, dan Bar memakai payment label yang sama.
- [ ] Notifikasi cashier pending dan paid memakai label yang sama.
- [ ] Tidak ada mapping `djiwaapp → DJIWA PAY` yang menyebabkan QRIS salah label.
- [ ] Tutup kasir memisahkan POS Tunai, Djiwa App - Bayar Tunai di Kasir, Djiwa App - Djiwa Pay, dan Djiwa App - QRIS tanpa mengubah total bisnis.
- [ ] `Penjualan Tunai` tetap menjadi dasar perhitungan `Selisih`.
- [ ] `Modal Kasir` di `DI SISTEM` dan `DI LACI` tetap sama.
- [ ] Schedule WIB dan attendance gate tidak berubah atau ter-bypass.
- [ ] Gagal notifikasi tidak membatalkan penutupan shift.
- [ ] Yumi General Manager Agent menjadi owner Grup Report dan mengirim laporan shift lengkap.
- [ ] Yumi Supervisor Bot menjadi owner Grup Transaksi, Kitchen, dan Bar sesuai konteksnya.
- [ ] Laporan Report dan recap Transaction memiliki payment breakdown yang konsisten.
- [ ] Tidak ada laporan ganda dari General Manager Agent dan Supervisor Bot.
- [ ] Cursor/dedupe Report dan Transaction terpisah dan hanya maju setelah delivery target sukses.
- [ ] Payload shift-close terstruktur dapat dirender oleh kedua bot tanpa parsing teks yang ambigu.
- [ ] Legacy ambiguous tidak ditebak sebagai Djiwa Pay.
- [ ] Dedupe/cursor notifikasi tetap sama.
- [ ] Tidak ada perubahan histori order secara massal.
- [ ] Build Customer/POS/Admin lulus.
- [ ] `yumi-supervisor-agent/app.py` lulus syntax check.
- [ ] Production bundle, lazy chunk, dan service runtime diverifikasi.

## Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Order QRIS lama terbaca Djiwa Pay | Jangan backfill otomatis; gunakan compatibility label dan audit production |
| Payment method internal berubah dan merusak laporan | Pertahankan alias reader; ubah producer baru secara additive |
| Kitchen/Bar berbeda dengan Transaksi | Satu formatter canonical dan test tiga renderer |
| Notifikasi duplikat | Jangan ubah dedupe key/cursor |
| Payment status berubah karena label refactor | Pisahkan formatter dari settlement logic; tidak ada update status dari UI label |
| POS/Admin salah diberi prefix Djiwa App | Prefix hanya jika `source === customer_self_service` |
| PWA menyajikan bundle lama | Verifikasi main bundle dan lazy chunk domain canonical |
| Bot runtime masih memakai source lama | `py_compile`, deploy service terpisah, cek active process/artifact |

## Preview Efek yang Wajib Saat Implementasi

Preview tidak dibuat pada tahap plan ini. Saat implementasi nanti, bukti wajib:

1. **Customer App screenshot** — checkout menampilkan tiga metode.
2. **POS screenshot** — direct POS dan order Djiwa App dibedakan.
3. **Admin screenshot** — source/payment terpisah.
4. **Telegram preview** — contoh pesan Transaksi, Kitchen, dan Bar.
5. **Formatter test output** — tabel matrix input → label.
6. **Database read-back** — row order baru non-destructive menunjukkan source/payment benar.
7. **Bundle verification** — hashed main/lazy bundle live memuat label baru.

## Rollout dan Rollback

### Rollout

1. Implement formatter dan producer tanpa menghapus compatibility reader.
2. Test lokal/unit.
3. Deploy bot/app secara bertahap.
4. Verifikasi satu order baru dari Customer App untuk masing-masing metode tanpa melakukan pembayaran nyata jika belum disetujui.
5. Verifikasi tiga grup notification.
6. Monitor log dan dedupe.

### Rollback

- Rollback hanya file/app/service yang berubah.
- Jangan menghapus atau mengubah histori order.
- Jangan membalik status payment secara manual.
- Jika formatter bermasalah, kembalikan mapping display ke versi sebelumnya sambil mempertahankan data source/payment canonical.

## Open Decision Sebelum Implementasi

1. Apakah label internal harus memakai tanda hubung biasa persis `Djiwa App - QRIS`, atau tanda em dash untuk tabel UI saja?
2. Untuk order legacy dengan `source=customer_self_service` dan `payment_method=djiwaapp`, apakah label yang disetujui adalah `Metode pembayaran lama` atau `Pembayaran tidak teridentifikasi`?
3. Apakah payment line wajib ditampilkan di Grup Kitchen dan Bar untuk semua order, atau hanya untuk order Djiwa App?

## Next Step

Menunggu persetujuan plan dan keputusan tiga open decision di atas. Setelah disetujui, implementasi dimulai dengan audit data production read-only dan unit test formatter, bukan langsung migration atau deploy.
