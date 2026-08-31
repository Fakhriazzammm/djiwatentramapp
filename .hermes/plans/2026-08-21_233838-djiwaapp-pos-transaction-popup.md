# Plan: Popup Transaksi DjiwaApp di `/menu`

## Goal

Membuat indikator popup transaksi yang muncul di atas halaman POS `/menu` ketika ada transaksi baru dari **DjiwaApp**, tanpa memindahkan kasir ke route lain.

Popup dapat diklik untuk membuka detail pesanan dalam sheet/modal di atas `/menu`, lalu ditutup dan kembali ke konteks kasir tanpa kehilangan menu atau keranjang.

Sumber transaksi yang didukung:

1. DjiwaApp — **Bayar di Kasir**
2. DjiwaApp — **Pembayaran QRIS Berhasil**

Popup otomatis hilang setelah 30 detik atau dapat ditutup dengan tombol `×`.

## Current Context

Komponen dan alur yang sudah tersedia:

- `apps/pos/src/components/pos/notification-center.tsx`
  - Notification bell 3D
  - Badge unread
  - Drawer Notification Center
- `apps/pos/src/hooks/use-pos-notifications.ts`
  - Polling/sinkronisasi notifikasi
  - Dedupe notification ID
  - Audio transaksi existing
- `apps/pos/src/routes/menu.lazy.tsx`
  - Halaman operasional kasir `/menu`
  - Lokasi ideal untuk popup dan detail sheet
- `apps/pos/src/routes/admin/orders.lazy.tsx`
  - Memiliki struktur order dan detail item yang bisa dijadikan referensi
  - Tidak digunakan sebagai tujuan navigasi popup karena kasir harus tetap di `/menu`
- `supabase/functions/pos-notifications/index.ts`
  - Endpoint list/create/read/sync notifikasi
- `public.pos_notifications`
  - Sumber persistence notifikasi

## Decision

### Dipilih: in-place popup + order detail sheet di `/menu`

Notifikasi tidak akan mengarahkan kasir ke `/admin/orders`.

```text
/menu
  ├── Transaction Alert Popup
  ├── Notification Bell / Drawer
  └── Order Detail Sheet
```

Saat popup diklik:

```text
setSelectedOrderId(notification.orderId)
→ OrderDetailSheet terbuka
→ URL tetap `/menu`
```

## Popup Copy dan Format

### Bayar di Kasir

```text
Pesanan Baru dari DjiwaApp
Menunggu Pembayaran di Kasir

#ORD-20260821-001
Budi Santoso · 2 item · Rp63.000

DJIWAAPP · BAYAR DI KASIR
```

### QRIS berhasil

```text
Pembayaran QRIS Berhasil
Pesanan DjiwaApp Sudah Lunas

#ORD-20260821-002
Siti Rahma · 3 item · Rp52.000

DJIWAAPP · QRIS BERHASIL
```

Aturan copy:

- Brand selalu ditulis `DjiwaApp`.
- Label sumber selalu terlihat: `DJIWAAPP`.
- Jangan menampilkan istilah teknis seperti `customer_self_service` kepada kasir.
- QRIS hanya boleh menggunakan copy berhasil jika payment status benar-benar `paid` atau `completed`.
- Transaksi pending tidak boleh disebut berhasil/lunas.

## Detail Sheet

### Header

```text
Detail Pesanan DjiwaApp                         ×
Menunggu Pembayaran di Kasir
#ORD-20260821-001
Budi Santoso
```

### Detail item wajib

Setiap item menampilkan:

| Field | Contoh |
|---|---|
| Quantity | `2×` |
| Nama item | `Kopi Susu Gula Aren` |
| Varian | `Large` |
| Add-on | `Extra keju`, `Less ice` |
| Catatan | `Pisahkan saus` |
| Harga item | `Rp40.000` |
| Diskon | `- Rp5.000` |

### Informasi order wajib

| Field | Keterangan |
|---|---|
| Sumber | `DjiwaApp` |
| Order number | Nomor yang mudah dibaca kasir |
| Internal order ID | Identifier stabil untuk lookup |
| Nama pelanggan | Jika tersedia |
| **Nomor meja** | Wajib tampil jika tersedia; gunakan fallback `Takeaway` bila memang bukan dine-in |
| Daftar item | Lengkap, termasuk varian/add-on/catatan |
| Subtotal | Jika tersedia |
| Diskon | Jika tersedia |
| Biaya tambahan | Jika tersedia |
| Total | Total final transaksi |
| Payment method | `Bayar di Kasir` atau `QRIS` |
| Payment status | `Menunggu Pembayaran`, `Lunas`, atau status valid existing |
| Created time | Waktu transaksi dalam WIB |

### Contoh detail dengan nomor meja

```text
Detail Pesanan DjiwaApp
Menunggu Pembayaran di Kasir

#ORD-20260821-001
Pelanggan: Budi Santoso
Nomor meja: Meja 07

2× Kopi Susu Gula Aren          Rp40.000
   Varian: Large
   Add-on: Extra keju             +Rp5.000

1× Croissant                     Rp18.000
   Catatan: Hangatkan

Subtotal                         Rp63.000
Total                            Rp63.000

DJIWAAPP · BAYAR DI KASIR
```

Nomor meja harus mengambil field existing secara defensive, misalnya mapping dari `tableNumber`, `table_number`, `tableName`, atau struktur meja existing—bukan hardcode. Bila data tidak tersedia, tampilkan `Takeaway`/`Nomor meja belum ditentukan` sesuai makna data yang sebenarnya.

## Behavior

### Popup lifecycle

1. Initial load tidak menampilkan popup untuk notifikasi lama.
2. Popup hanya muncul untuk notification ID baru yang terdeteksi setelah initial sync.
3. Hanya notifikasi sumber DjiwaApp yang memenuhi event transaksi yang memicu popup.
4. Auto-dismiss setelah 30 detik.
5. Tombol `×` langsung menutup popup.
6. Klik area popup atau tombol detail membuka `OrderDetailSheet` di `/menu`.
7. Klik popup menandai notifikasi sebagai read global.
8. Menutup popup dengan `×` tidak otomatis menghapus riwayat dari Notification Center.
9. Popup tidak muncul berulang akibat polling, reload, atau duplicate webhook.
10. Maksimal 3 popup tampil bersamaan; notifikasi selebihnya tetap masuk drawer.
11. Timer berhenti ketika pointer/fokus berada di popup, lalu dilanjutkan saat keluar bila sesuai pola komponen existing.
12. `prefers-reduced-motion` tetap dihormati.

### Audio

- Bayar di Kasir: gunakan `playSuccessSound()` existing sesuai pola yang sudah ada.
- QRIS berhasil: gunakan asset/helper audio existing.
- Satu order hanya menghasilkan satu audio melalui dedupe ID/order ID.
- Jangan membuat asset audio baru.

## Data Contract

Notification payload perlu membawa identifier order dan metadata display:

```json
{
  "id": "notification-id",
  "notificationType": "order_cashier",
  "source": "djiwaapp",
  "orderId": "order-id",
  "orderNumber": "ORD-20260821-001",
  "paymentMethod": "cashier",
  "paymentStatus": "pending",
  "title": "Pesanan Baru dari DjiwaApp",
  "message": "Menunggu Pembayaran di Kasir",
  "metadata": {
    "customerName": "Budi Santoso",
    "tableNumber": "Meja 07",
    "itemCount": 2,
    "totalAmount": 63000
  }
}
```

`orderId` menjadi identifier utama lookup. Jangan mencari order hanya dari judul atau teks message.

## Database Schema

### Existing notification table

Gunakan `public.pos_notifications` sebagai persistence utama. Jangan membuat tabel popup terpisah.

Field yang harus dipastikan tersedia atau dipetakan:

```text
id
notification_type
source / source_app
order_id atau metadata.orderId
order_number atau metadata.orderNumber
title
message
priority
is_active
created_at
expires_at
global_read_at
global_acknowledged_at
dedupe_key
```

### Order source

Detail order harus diambil dari data order existing, bukan diduplikasi permanen ke notification record. Metadata notification hanya boleh menjadi display fallback ketika order sedang menunggu sinkronisasi.

### Supabase REST mapping

```text
POST /functions/v1/pos-notifications
{
  "action": "list"
}

POST /functions/v1/pos-notifications
{
  "action": "mark_read",
  "notificationId": "..."
}
```

Jika detail order perlu diambil via Edge Function, gunakan contract existing yang paling sesuai dan jangan expose service-role key ke frontend.

## UI/UX Specification

### Desktop

- Popup fixed di kanan atas.
- Tidak menutupi tombol navigasi utama.
- Lebar sekitar 360–430px.
- Popup baru ditumpuk vertikal.
- CTA `Lihat Detail` opsional; seluruh kartu tetap clickable.

### Tablet/mobile POS

- Popup fixed di area atas dengan margin aman.
- Lebar hampir penuh.
- Detail dibuka sebagai bottom sheet/full-height sheet.
- Tombol close selalu mudah dijangkau.
- Item list dapat scroll, header order tetap terlihat.
- Nomor meja diletakkan dekat nama pelanggan karena penting untuk operasional.

### States

| State | UI |
|---|---|
| Loading detail | Skeleton header + item rows |
| Empty order | Pesan jelas + tombol `Coba Lagi` |
| Error detail | Error operasional tanpa stack trace + retry |
| Order ditemukan | Detail lengkap dan CTA close |
| Order expired/deleted | Informasi tidak tersedia + tetap simpan notifikasi di drawer |
| Banyak popup | Maksimal 3 visible, sisanya di drawer |

## Multi-source Data Flow

```text
Customer DjiwaApp
  → membuat order
  → memilih Bayar di Kasir atau QRIS
  → payment/order event tervalidasi
  → pos_notifications dibuat dengan orderId
  → POS `/menu` polling/sync menemukan notification baru
  → Transaction Alert Popup muncul
  → kasir klik popup
  → OrderDetailSheet mengambil order berdasarkan orderId
  → kasir tetap berada di `/menu`
```

### Event rules

| Event | Popup | Copy |
|---|---:|---|
| DjiwaApp order + cashier pending | Ya | Pesanan Baru dari DjiwaApp |
| DjiwaApp payment QRIS paid/completed | Ya | Pembayaran QRIS Berhasil |
| DjiwaApp payment pending | Tidak sukses popup; boleh drawer | Menunggu Pembayaran QRIS |
| Admin briefing | Tidak | Drawer saja |
| Old notification on initial load | Tidak | Drawer saja |
| POS cashier-created order | Tidak untuk scope ini | Di luar scope |

## Files Likely to Change

### Frontend POS

- `apps/pos/src/hooks/use-pos-notifications.ts`
  - Expose new transaction events.
  - Dedupe popup berdasarkan notification/order ID.
  - Preserve existing polling and sound behavior.
- `apps/pos/src/components/pos/notification-center.tsx`
  - Reuse notification data and click behavior.
  - Keep bell/drawer behavior intact.
- `apps/pos/src/routes/menu.lazy.tsx`
  - Mount transaction popup layer.
  - Mount order detail sheet while staying on `/menu`.
  - Wire `selectedOrderId` and close behavior.
- New component likely:
  - `apps/pos/src/components/pos/transaction-alert-popup.tsx`
  - `apps/pos/src/components/pos/pos-order-detail-sheet.tsx`
- Existing order hooks/types should be reused after inspecting their canonical source.

### Backend

- `supabase/functions/pos-notifications/index.ts`
  - Normalize source to DjiwaApp.
  - Include order ID, order number, payment status, table number, item count, and total metadata.
  - Ensure only valid customer payment/order events trigger transaction popup classification.
- Relevant order/payment webhook or sync producer identified during implementation.
  - Do not trigger QRIS-success popup from pending/gateway-created state.

### Tests

- Add/update unit tests for notification classification and dedupe if test structure exists.
- Add manual E2E test script for two event types and detail opening.

## No-hardcode Audit

Values that must not be hardcoded:

- Order ID
- Order number
- Customer name
- Item names
- Quantity
- Prices
- Total
- Nomor meja
- Payment status
- Payment method
- Popup expiration behavior if admin-configurable in future

Allowed static UI copy:

- `Pesanan Baru dari DjiwaApp`
- `Menunggu Pembayaran di Kasir`
- `Pembayaran QRIS Berhasil`
- `Pesanan DjiwaApp Sudah Lunas`
- `DJIWAAPP · BAYAR DI KASIR`
- `DJIWAAPP · QRIS BERHASIL`

## Integration Points

### Admin

Admin broadcast/briefing tetap memakai Notification Center dan tidak memicu transaction popup kecuali notification type memang berasal dari event transaksi DjiwaApp yang tervalidasi.

### Telegram

Tidak mengubah notifikasi Telegram dalam scope ini. Pastikan popup POS tidak membuat duplicate Telegram notification.

### AI/purchasing agent

Tidak terlibat dalam event transaksi ini. Tidak boleh ada coupling ke agent purchasing atau AI.

## Implementation Waves

### Wave 1 — Contract and data audit

1. Trace order/payment producer DjiwaApp.
2. Confirm canonical field nomor meja.
3. Confirm order detail hook/API accessible while on `/menu`.
4. Confirm notification payload contains stable `orderId`.

### Wave 2 — Popup UI

1. Create transaction popup component.
2. Add 30-second timer and manual close.
3. Add mobile/tablet responsive layout.
4. Add source/status copy with DjiwaApp branding.

### Wave 3 — In-place order detail

1. Create/reuse `OrderDetailSheet`.
2. Open it from popup and drawer click.
3. Render complete item details and nomor meja.
4. Handle loading, error, empty, and retry states.

### Wave 4 — Event filtering and dedupe

1. Trigger only DjiwaApp cashier-pending and QRIS-paid events.
2. Keep initial load silent.
3. Prevent duplicate popup/audio.
4. Keep drawer/read-state behavior consistent.

### Wave 5 — Verification and release

1. Build POS.
2. Test cashier-pending popup.
3. Test QRIS-paid popup.
4. Click popup and verify detail sheet opens while URL stays `/menu`.
5. Verify nomor meja and complete item details.
6. Verify auto-dismiss after 30 seconds and manual `×`.
7. Verify old notifications do not popup after reload.
8. Verify production bundle and runtime endpoint.

## Acceptance Criteria

- [ ] Kasir tetap di `/menu` selama popup dan detail dibuka.
- [ ] Popup hanya muncul untuk transaksi DjiwaApp sesuai event rules.
- [ ] Copy menyebut `DjiwaApp` dengan konsisten.
- [ ] Popup otomatis hilang setelah 30 detik.
- [ ] Tombol `×` menutup popup.
- [ ] Klik popup membuka detail sheet.
- [ ] Detail menampilkan semua item, quantity, varian, add-on, catatan, harga, dan total jika tersedia.
- [ ] Nomor meja tampil jika order memiliki nomor meja.
- [ ] Order takeaway tidak diberi nomor meja palsu.
- [ ] Bayar di kasir dan QRIS berhasil memiliki copy/status berbeda.
- [ ] QRIS pending tidak disebut berhasil/lunas.
- [ ] Popup tidak muncul ulang karena polling/reload/duplicate event.
- [ ] Audio tidak berbunyi lebih dari sekali untuk satu order.
- [ ] Notification Center tetap menyimpan riwayat transaksi.
- [ ] Error/loading/empty state tersedia.
- [ ] POS build lulus.
