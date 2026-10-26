# Plan: Booking Admin Operational Overhaul

## Goal

Mengubah `/admin/booking` dari halaman campuran operasional + konfigurasi menjadi workspace booking restoran yang aman, ringkas, mudah dipindai, dan siap dipakai staff Djiwa Tentram.

Fokus utama:

1. Memisahkan lifecycle booking dari lifecycle pembayaran.
2. Mempercepat pekerjaan staff: melihat booking hari ini, memverifikasi pembayaran, menyiapkan meja, dan menandai customer tiba.
3. Mengurangi risiko salah status, salah kapasitas, duplikasi finance, dan penghapusan histori booking.
4. Memisahkan workspace operasional dari pengaturan halaman booking.

> Scope ini adalah rencana implementasi. Belum ada kode, schema, deployment, atau perubahan production yang dilakukan dari plan ini.

---

## Current Context

### Route dan implementasi yang sudah ada

- Route utama: `apps/admin/src/routes/admin/booking.lazy.tsx`
- Hook data booking: `useHybridBookingOrdersState`
- Hook status: `useHybridUpdateBookingStatus`
- Hook edit: `useHybridPatchBookingOrder`
- Hook delete: `useHybridDeleteBookingOrder`
- Hook kapasitas: `useHybridBookingDateCapacities`, `useHybridSetBookingDateCapacity`, `useHybridSetBookingBulkDateCapacity`
- Hook settings: `useHybridBookingSettings`, `useHybridUpdateBookingSettings`
- Export: `exportBookingOrdersPDF`, `exportBookingOrdersExcel`, `exportBookingOrdersJPG`
- Domain production: `https://admindjiwatentram.web.id/admin/booking`
- Public booking: `https://booking.djiwatentram.web.id`

### Tab yang sudah ada

```text
Kalender
Daftar Booking
Kapasitas
Tampilan
Produk
Formulir
```

### Masalah yang sudah teridentifikasi

- Operasional dan konfigurasi bercampur dalam satu tab row.
- Status booking dan payment belum diperlakukan sebagai dua state machine yang berbeda.
- Action `Hapus Booking` berisiko ambigu untuk booking yang sudah paid/finance-linked.
- Tombol `Tandai Lunas & Verifikasi` perlu kontrak verification yang lebih aman.
- Kalender dan daftar booking belum menjadi workspace dua panel yang efisien.
- Detail booking perlu lifecycle operasional: akan datang, tiba, duduk, selesai, no-show.
- Booking item memakai kontrak `name`, sedangkan consumer tertentu mengharapkan `productName`; boundary normalization harus konsisten.
- Field custom answer opsional harus disembunyikan jika `null`/kosong.
- `arrival_time` harus diperlakukan sebagai string local WIB `HH:mm`, bukan timestamp/timezone.
- Manual booking saat ini berisiko membuat item placeholder seperti `Booking Manual`; perlu kontrak menu dan field lengkap.

---

## Proposed Approach

### Prinsip

1. **Operational first** — halaman utama dipakai untuk booking hari ini dan pekerjaan staff, bukan konfigurasi.
2. **Two state machines** — `booking_status` dan `payment_status` tidak digabung.
3. **Finance safety** — pembayaran tidak boleh dianggap verified hanya karena UI berubah.
4. **Table-first desktop, drawer-first mobile** — scan cepat di desktop, detail terfokus di mobile.
5. **Additive migration** — tidak drop/rename kolom production tanpa persetujuan eksplisit.
6. **Idempotent writes** — status/payment/finance/notifikasi memakai stable booking ID dan transaction ID.
7. **No hardcoded business rules** — kapasitas, label, booking types, event types, dan menu tetap berasal dari database/settings.

### Rekomendasi arsitektur UI

```text
Booking Operasional
├── Ringkasan hari ini
├── Kalender + booking tanggal terpilih
├── Daftar booking
└── Detail booking drawer

Pengaturan Booking
├── Tampilan publik
├── Menu booking
└── Formulir booking
```

Implementasi awal tetap dapat berada di route yang sama untuk menjaga kompatibilitas, tetapi tab dan visual grouping dipisahkan dengan jelas.

---

## Alternatives Analysis

### Option A — Perbaikan incremental di route saat ini

| Pros | Cons |
|---|---|
| Risiko deployment paling rendah | File `booking.lazy.tsx` tetap besar |
| Tidak perlu migrasi route | Pemisahan settings masih bergantung pada tab |
| Cepat diuji dengan staff | Potensi kompleksitas tetap bertambah |

### Option B — Pecah operasional dan settings menjadi route baru

| Pros | Cons |
|---|---|
| Arsitektur lebih bersih | Perlu audit route/sidebar/navigation |
| Bundle dan loading lebih fokus | Risiko regresi lebih tinggi |
| Cocok untuk scale jangka panjang | Perlu mempertahankan deep-link lama |

### Recommendation

Pilih **Option A untuk Wave 1–2**, kemudian evaluasi Option B setelah behavior dan schema stabil. Safety dan workflow lebih penting daripada langsung melakukan route split besar.

---

## Sidebar Navigation Update

Berdasarkan struktur sidebar pada screenshot, `Booking` saat ini berada di bawah grup `Manajemen`, setelah `Ringkasan Stok`. Untuk mendukung operasional restoran, pindahkan `Booking` ke navigasi utama tepat di atas `Pesanan`:

```text
Dasbor
Booking
Pesanan
Order Mie Yamin

MANAJEMEN
Produk
Resep
HPP
Inventaris
Ringkasan Stok
```

### Rationale

- Booking adalah aktivitas operasional harian seperti pesanan, bukan sekadar pengaturan manajemen.
- Reservasi memiliki dampak langsung ke meja, kapasitas, jumlah tamu, persiapan menu, dan customer arrival.
- Posisi di atas `Pesanan` membuat staff melihat kewajiban reservasi sebelum menangani order walk-in.
- `Order Mie Yamin` tetap menjadi channel/order workspace terpisah.

### Implementation notes

- Audit file sidebar canonical Admin, terutama `apps/admin/src/routes/admin/route.tsx` dan konfigurasi `PAGE_TITLES`, menu sections, serta active-route logic.
- Pindahkan item route `/admin/booking` dari section `Manajemen` ke primary operational section.
- Pertahankan permission guard, icon Calendar, active state, mobile menu, dan deep-link `/admin/booking`.
- Jangan mengubah route URL atau menghapus link lama tanpa redirect/compatibility check.
- Verifikasi urutan desktop sidebar, mobile quick menu, active highlight, dan collapse state.


## 1. Pisahkan status booking dan pembayaran

### UI

Gunakan dua badge yang selalu terlihat:

```text
Booking: Dikonfirmasi
Pembayaran: Lunas
```

### Data

Pertahankan field existing:

```text
booking_status
payment_status
```

Jangan mengganti keduanya dengan satu status generik.

### Validasi

- `booking_status = confirmed` tidak otomatis berarti `payment_status = paid`.
- `payment_status = paid` harus punya finance linkage atau bukti verifikasi yang sah.
- Filter status harus menyediakan filter booking dan payment secara terpisah.

## 2. Lifecycle operasional booking

Tambahkan status additive yang disepakati:

```text
pending
confirmed
arriving
arrived
seated
completed
cancelled
no_show
expired
```

Payment tetap terpisah:

```text
pending
verified
paid
failed
refunded
```

Sebelum migration, mapping status existing wajib dibuat:

| Existing | Mapping baru |
|---|---|
| pending | pending |
| confirmed | confirmed |
| paid | confirmed + payment paid, atau review manual |
| completed | completed |
| cancelled | cancelled |

Jangan menjalankan backfill otomatis untuk status ambigu tanpa fixture dan review.

## 3. Batalkan, bukan hapus, untuk finance-linked booking

### Behavior

- Booking unpaid tanpa finance linkage: delete dapat tetap tersedia sesuai policy.
- Booking paid/verified/finance-linked: action menjadi `Batalkan Booking`.
- Wajib input alasan pembatalan.
- Simpan `cancelled_at`, `cancelled_by`, `cancellation_reason`.
- Finance transaction tetap historical; jika refund dibutuhkan, buat flow refund terpisah.

### File likely to change

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `supabase/functions/booking-admin/index.ts`
- migration baru additive di `supabase/migrations/`

## 4. Payment verification contract

Payment verification harus:

```text
booking ID
→ cek payment provider / bukti pembayaran
→ cek nominal
→ cek status transaction
→ upsert finance transaction idempotent
→ update payment_status
→ trigger notification dengan dedupe key
```

Jangan membiarkan client hanya mengirim `paymentStatus: paid` tanpa server-side verification.

### Acceptance criteria

- Double click tidak membuat finance transaction kedua.
- Retry webhook tidak membuat notifikasi kedua.
- Booking paid dapat ditelusuri ke `booking_order_id`.
- Payment failure tidak mengubah booking menjadi paid.

---

# Wave 2 — UI/UX Operational Workspace

## 5. Header dan summary cards

Ganti hero generik menjadi ringkasan kerja hari ini:

```text
Booking hari ini     12
Total tamu           48
Total meja           15
Menunggu konfirmasi  3
Belum lunas          2
Akan datang <3 jam   4
```

### State

- Loading: skeleton untuk cards dan list.
- Empty: `Belum ada booking pada periode ini` + tombol `Buka tanggal lain`.
- Error: pesan aman + `Coba lagi`.
- Refreshing: indicator kecil, jangan menghilangkan data lama.

## 6. Kalender dua panel

### Desktop

```text
┌──────────────────────────┬─────────────────────────────┐
│ Kalender bulan            │ Booking tanggal terpilih   │
│ kapasitas per tanggal    │ daftar booking              │
│ badge penuh/terbatas     │ quick actions               │
└──────────────────────────┴─────────────────────────────┘
```

### Kalender cell

Tampilkan secara ringkas:

```text
23
8 booking
32 tamu
12/15 meja
```

Warna:

- hijau: kapasitas aman;
- amber: mendekati limit;
- merah: penuh;
- abu-abu: ditutup.

### Mobile

- Kalender full-width.
- Setelah memilih tanggal, tampilkan sticky summary dan booking list.
- Detail booking dibuka melalui drawer.

## 7. Daftar booking compact

### Kolom desktop

```text
Kode | Customer | Jam | Tamu/Meja | Booking | Pembayaran | Total | Aksi
```

Hapus kolom yang tidak membantu keputusan harian dari tabel utama. Detail panjang masuk drawer.

### Interaksi

- Search: kode, nama, nomor WhatsApp.
- Filter tanggal: hari ini, besok, custom range.
- Filter booking status.
- Filter payment status.
- Filter jumlah tamu.
- Sort: jam kedatangan, tanggal dibuat, total, jumlah tamu.
- Sticky header.
- Bulk selection hanya untuk action aman seperti export atau kirim reminder; bukan delete default.

## 8. Detail drawer booking

### Urutan informasi

1. Header: kode booking + status booking + status pembayaran.
2. Ringkasan kedatangan:
   - tanggal;
   - jam WIB;
   - jumlah tamu;
   - jumlah meja.
3. Customer:
   - nama;
   - WhatsApp;
   - email jika ada.
4. Item menu.
5. Detail booking/custom answer non-null.
6. Catatan.
7. Payment proof/finance reference.
8. Timeline aktivitas.
9. Quick actions.

### Quick actions

```text
Konfirmasi
Tandai tiba
Tandai duduk
Selesaikan
Kirim konfirmasi
Batalkan
```

Action tidak relevan harus disabled/hidden berdasarkan state.

## 9. Pisahkan settings

Pertahankan function existing tetapi kelompokkan visual:

```text
Operasional: Kalender, Daftar Booking, Kapasitas
Pengaturan: Tampilan, Produk, Formulir
```

Pada fase berikutnya, pertimbangkan route:

```text
/admin/booking
/admin/booking/settings
```

Jika route split dilakukan, semua link sidebar, quick menu, deep-link, dan redirect harus diaudit.

---

# Wave 3 — Fitur Operasional dan Automation

## 10. Arrival/check-in workflow

Tambahkan:

- `Tandai akan datang`;
- `Tandai tiba`;
- `Tandai duduk`;
- `Tandai no-show`;
- timestamp dan user actor.

Dashboard dapat menampilkan:

```text
12:30 · Zahra · 10 tamu · belum tiba
```

## 11. WhatsApp confirmation

Dari drawer:

```text
Kirim konfirmasi
Kirim pengingat H-1
Kirim lokasi
Hubungi customer
```

Semua message memakai template yang dapat diedit dari settings, bukan hardcoded permanen.

## 12. Reminder otomatis

Trigger:

```text
H-1
H-3 jam
Booking terlambat tiba
Payment masih pending
```

Tambahkan notification log:

```text
queued → sent → failed → retrying
```

## 13. Timeline dan audit log

Contoh:

```text
18:10 Booking dibuat
18:12 Invoice dibuat
18:15 Pembayaran diterima
18:15 Notifikasi grup transaksi terkirim
18:20 Status diubah oleh Admin
```

Audit log wajib untuk:

- perubahan status;
- perubahan jumlah tamu;
- perubahan menu/nominal;
- pembatalan;
- verifikasi pembayaran;
- pengiriman notifikasi.

## 14. Export yang lebih berguna

Export mengikuti filter aktif dan menambahkan:

```text
booking code
customer
phone
booking date
arrival time
guest count
table count
booking type
payment status
booking status
total
notes
```

Export tidak boleh memasukkan token, internal raw metadata, atau data sensitif yang tidak diperlukan.

---

# Database Schema Plan

## Existing canonical tables/views

```text
pos.booking_orders
├── source_id
├── slug
├── booking_code
├── customer_name
├── customer_phone
├── customer_email
├── booking_date
├── arrival_time
├── total_amount
├── payment_method
├── payment_status
├── booking_status
├── guest_count
├── table_count
├── custom_answers jsonb
├── notes
├── created_at
├── creation_time
└── payment_gateway jsonb

pos.booking_order_items
├── booking_order_source_id
├── line_no
├── product_source_id
├── product_name
├── price
└── quantity

pos.financial_transactions
├── source_id
├── tx_type
├── amount
├── tx_date
├── payment_method
├── status
├── booking_order_source_id
├── order_source_id
└── metadata jsonb
```

## Public REST views

```text
GET /rest/v1/pos_booking_orders
GET /rest/v1/pos_financial_transactions
```

View mapping wajib diverifikasi sebelum implementasi karena sebagian field menggunakan camelCase:

```text
booking_code  → bookingCode
arrival_time   → arrivalTime
guest_count    → guestCount
booking_status → bookingStatus
payment_status → paymentStatus
```

## Additive schema candidates

Migration baru hanya jika diperlukan:

```text
alter table pos.booking_orders
  add column if not exists arrived_at double precision;

alter table pos.booking_orders
  add column if not exists seated_at double precision;

alter table pos.booking_orders
  add column if not exists completed_at double precision;

alter table pos.booking_orders
  add column if not exists cancelled_by text;

alter table pos.booking_orders
  add column if not exists cancellation_reason text;
```

Jika audit log belum memiliki tabel canonical, tambahkan tabel additive:

```text
pos.booking_order_events
├── source_id primary key
├── booking_order_source_id
├── event_type
├── actor_user_id
├── actor_name
├── payload jsonb
└── created_at
```

Unique/idempotency index:

```text
unique (booking_order_source_id, event_type, source_reference)
```

Tidak boleh drop atau rename kolom existing dalam wave ini.

---

# UI/UX State Specification

| Area | Loading | Empty | Error | Saving |
|---|---|---|---|---|
| Summary | skeleton cards | 0 values | retry banner | refresh indicator |
| Calendar | skeleton calendar | no dates | retry calendar | disabled date action |
| Booking list | skeleton rows | empty CTA | inline retry | row disabled |
| Detail drawer | skeleton detail | no selection | close/retry | action spinner |
| Payment verify | proof loading | no proof | verification failure | disabled action |
| Capacity | skeleton values | default settings | retry | save spinner |
| Settings | skeleton form | default values | inline error | sticky save state |

Rules:

- Jangan mengganti data yang sudah tampil menjadi blank saat refresh.
- Semua write harus disable button selama proses.
- Error harus menyebut stage: `Gagal verifikasi pembayaran`, bukan `Gagal menyimpan`.
- Status payment provider-controlled harus read-only selain action verification resmi.

---

# Integration Points

## Supabase / backend

- `booking-admin` Edge Function untuk mutation admin.
- Public booking RPC untuk customer booking.
- `settle_public_booking_payment` untuk settlement payment.
- Finance linkage melalui `booking_order_source_id`.
- RLS/grant audit untuk public vs service-role.

## Supervisor Telegram Agent

- Paid booking finance transaction dikirim ke transaction group.
- Dedupe berdasarkan finance transaction ID.
- Retry hanya jika Telegram gagal.
- Notification format booking harus berbeda dari order biasa.
- Tambahkan event delivery status ke audit/notification log bila dibutuhkan.

## Mayar

- Redirect bukan bukti paid.
- Webhook/reconciliation adalah sumber settlement.
- `transactionId`, `invoiceId`, dan `bookingId` harus tetap terhubung.
- Tidak membuat finance transaction kedua saat webhook/reconcile diulang.

## AI/LLM

Tidak perlu AI untuk status, kapasitas, payment, atau notification. AI hanya opsional untuk:

- ringkasan booking harian;
- prediksi kebutuhan meja/kapasitas;
- rekomendasi staffing;
- draft pesan customer.

Semua keputusan payment dan capacity tetap deterministic dan database-backed.

## Purchasing agent

Tidak ada integrasi langsung untuk wave awal. Data menu booking dapat menjadi input forecasting/purchasing hanya setelah:

```text
booking confirmed/paid
→ item menu tervalidasi
→ agregasi demand
→ purchasing recommendation
```

Jangan mengurangi inventory hanya karena booking pending.

---

# Multi-source Data Flow

```text
booking.djiwatentram.web.id
  └─ public booking RPC
      ├─ pos.booking_orders
      ├─ pos.booking_order_items
      └─ Mayar invoice
          └─ verified webhook/reconcile
              ├─ booking payment_status = paid
              ├─ pos.financial_transactions.booking_order_source_id
              ├─ Supervisor Telegram transaction notification
              └─ Admin booking workspace refresh

Admin /admin/booking
  ├─ reads booking orders + items
  ├─ reads capacity/settings/products
  ├─ updates operational booking status
  ├─ verifies payment through protected boundary
  └─ writes audit event
```

Cross-domain invariants:

- customer name/phone tidak boleh hilang antara public booking, finance, Telegram, dan Admin;
- `arrivalTime` harus konsisten sebagai local `HH:mm` WIB;
- item booking harus dinormalisasi ke kontrak UI `productName` tanpa mengubah raw source;
- finance transaction tidak boleh memiliki dua income aktif untuk booking yang sama;
- status notification tidak boleh dianggap sent hanya karena worker membaca row.

---

# No-hardcode Audit

Nilai berikut harus berasal dari DB/settings:

- booking title dan description;
- booking types dan labels;
- event types dan labels;
- booking window days;
- default capacity;
- people per table;
- featured product IDs;
- custom form fields;
- notification templates;
- cancellation reasons jika ingin editable.

Nilai yang boleh tetap sebagai fallback code:

- label `Pelanggan`;
- status fallback untuk data lama;
- `—` untuk field kosong;
- warna visual status;
- batas teknis minimum/maksimum yang sudah disepakati domain.

Nilai yang tidak boleh hardcoded di frontend:

- nominal payment;
- status paid;
- jumlah kapasitas terpakai;
- nama item menu;
- customer identity;
- waktu kedatangan;
- finance transaction ID.

---

# Files Likely to Change

## Wave 1

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- `apps/admin/src/routes/admin/orders.lazy.tsx` jika detail booking diselaraskan
- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-pos-data.ts`
- `supabase/functions/booking-admin/index.ts`
- `supabase/functions/mayar-webhook/index.ts`
- `supabase/migrations/<new-additive-booking-safety>.sql`
- `yumi-supervisor-agent/app.py`

## Wave 2

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- kemungkinan ekstraksi:
  - `apps/admin/src/components/booking/booking-summary-cards.tsx`
  - `apps/admin/src/components/booking/booking-calendar-workspace.tsx`
  - `apps/admin/src/components/booking/booking-detail-drawer.tsx`
  - `apps/admin/src/components/booking/booking-status-badge.tsx`

## Wave 3

- `supabase/migrations/<booking-events>.sql`
- `supabase/functions/booking-admin/index.ts`
- `supabase/functions/booking-reminders/index.ts` jika memang diperlukan
- `apps/admin/src/components/booking/booking-timeline.tsx`
- `apps/admin/src/lib/booking-notification-templates.ts`
- Supervisor notification delivery persistence

---

# Testing and Verification Plan

## Unit tests

- `normalizeBookingItem`: `name` → `productName`.
- `normalizeArrivalTime`: hanya menerima `HH:mm`, tidak melakukan timezone conversion.
- status transition matrix.
- payment verification mapping.
- cancellation policy.
- custom answer null filtering.
- idempotency key handling.

## Integration tests

- public booking create → booking + items atomic.
- payment settlement → exactly one finance transaction.
- webhook retry → no duplicate finance/notification.
- paid booking cannot be hard-deleted.
- cancellation preserves finance history.
- capacity concurrent booking does not exceed limit.

## E2E/manual tests

1. Buat booking public dengan `12:30`.
2. Verifikasi database menyimpan `12:30` di `arrival_time`.
3. Bayar melalui provider test/controlled fixture.
4. Verifikasi Admin menampilkan:
   - booking status;
   - payment status;
   - 12:30 WIB;
   - item menu;
   - tamu/meja.
5. Verifikasi Telegram memakai format booking, bukan order biasa.
6. Ulangi webhook dan pastikan tidak ada duplicate transaction/message.
7. Batalkan paid booking dan pastikan menjadi cancellation, bukan delete.
8. Test mobile drawer dan desktop two-panel.
9. Test loading, empty, error, retry, saving.

## Quality gates

```text
git diff --check
bun run check-types
bun run build
curl -I https://admindjiwatentram.web.id/admin/booking
verifikasi hashed booking chunk
verifikasi migration apply di database canonical
verifikasi Edge Function runtime
verifikasi Telegram message/dedupe
```

Typecheck baseline harus dicatat terpisah dari error baru.

---

# Risks and Tradeoffs

| Risiko | Mitigasi |
|---|---|
| Status lama tidak kompatibel | Mapping table + backfill review |
| Payment berubah paid tanpa finance | Protected Edge Function + idempotency |
| UI terlalu padat | Desktop table + mobile drawer |
| Operator bingung dengan banyak status | Label status eksplisit + action berdasarkan state |
| Reminder mengirim spam | Notification dedupe + delivery log |
| Booking paid terhapus | Cancel-only policy untuk finance-linked record |
| Route split memutus deep-link | Audit navigation + redirect compatibility |
| Data arrival time salah | Local `HH:mm` contract + display `WIB` + regression test |
| Manual booking membuat dummy item | Required menu selection atau label internal yang tidak masuk sales item |

---

# Recommended Implementation Order

1. Review dan setujui lifecycle/status matrix.
2. Audit live schema, RPC, grants, dan finance linkage.
3. Implement Wave 1 safety dengan migration additive.
4. Tambahkan regression tests payment, capacity, cancellation, dan notification.
5. Implement summary cards + compact booking table.
6. Implement two-panel calendar/detail drawer.
7. Pisahkan visual grouping operational/settings.
8. Implement arrival/check-in actions.
9. Implement timeline, WhatsApp, dan reminders setelah status stabil.
10. Build, deploy hanya `apps/admin` ke `admindjiwatentram.web.id`, lalu verifikasi live.

## Open Questions Before Implementation

1. Apakah status `arrived` dan `seated` memang diperlukan oleh staff restoran?
2. Apakah booking paid boleh dibatalkan langsung oleh admin, atau wajib approval supervisor?
3. Apakah reminder dikirim melalui WhatsApp, Telegram internal, atau keduanya?
4. Apakah `group_meal` tetap perlu menampilkan item menu di daftar booking utama?
5. Apakah booking manual tetap dipertahankan, atau semua booking harus berasal dari `booking.djiwatentram.web.id`?
6. Apakah finance transaction booking boleh di-refund dari halaman Admin atau hanya melalui proses finance?
