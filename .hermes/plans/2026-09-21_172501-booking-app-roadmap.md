# Plan: Booking App Operational & Customer Experience Roadmap

**Status:** Wave 1 baseline implemented — Wave 2–5 masih pending
**Tanggal:** 2026-09-21 WIB
**Scope utama:** `apps/booking` dan integrasi Admin `/admin/booking`

## 1. Tujuan

Membangun pengalaman Booking yang lebih cepat, jelas, dan aman untuk dua sisi:

1. **Customer-facing `apps/booking`** — customer dapat membuat booking, memilih menu, membayar, dan mengecek status tanpa kehilangan draft.
2. **Admin Booking** — tim dapat memantau kalender, kapasitas, booking, status pembayaran, dan kedatangan dari satu workspace operasional.

Prinsip utama:

- tidak rewrite flow booking yang sudah berjalan;
- kapasitas dan harga tetap authoritative di backend/DB;
- status booking dan status pembayaran dipisahkan;
- booking yang sudah terkait pembayaran tidak dihapus permanen;
- tidak menambahkan fitur Telegram/AI sebelum kebutuhan operasionalnya jelas.

## 2. Konteks Existing

`apps/booking` saat ini sudah memiliki:

- flow `type → event-type → date → menu → review → checkout`;
- branch non-event yang melewati `event-type`;
- settings booking yang dibaca dari Supabase;
- tipe booking dan tipe event dari konfigurasi database;
- kalender kapasitas dan override tanggal;
- validasi jumlah tamu/meja;
- menu dan kategori produk dari database;
- penyimpanan draft di `sessionStorage`;
- guest credentials dan idempotency key;
- create booking melalui `public-booking`;
- invoice melalui `mayar-proxy`;
- retry/payment attach berbasis booking yang sama;
- halaman status booking.

Admin sudah memiliki route `/admin/booking`. Rencana ini memperkuat route dan flow yang ada, bukan membuat aplikasi booking kedua.

## 3. Struktur Navigasi yang Diusulkan

Section baru di Admin sidebar:

```text
BOOKING
├── Dashboard Booking
├── Kalender & Reservasi
├── Daftar Booking
├── Kapasitas & Tanggal
├── Pengaturan Halaman Booking
├── Menu Booking
└── Form Booking
```

### Keputusan route

- Pertahankan `/admin/booking` sebagai entry point utama.
- Audit tab/section existing terlebih dahulu sebelum memecah menjadi route baru.
- Jika fitur masih cocok sebagai tab, jangan membuat route tambahan.
- Jika fitur membutuhkan workspace besar seperti kalender atau table operasional, pertimbangkan child route setelah audit.
- Public route tetap memakai flow existing `/`, `/?step=...`, `/status`, dan kompatibilitas legacy `/booking/*`.

## 4. Rencana Wave Implementasi

### Wave 0 — Audit dan kontrak data

- Inventaris seluruh tab dan action di `apps/admin/src/routes/admin/booking.lazy.tsx`.
- Trace setiap read/write dari UI → hook/client → Edge Function/RPC → tabel/view.
- Cocokkan status booking, status payment, kapasitas, invoice, dan item menu.
- Verifikasi tabel/view/RPC live sebelum mengubah UI.
- Catat route/link/sidebar yang sudah merujuk ke `/admin/booking`.

### Wave 1 — Operational Booking Workspace

- Dashboard booking dengan filter Hari ini, Besok, Minggu ini, Bulan ini, dan custom range.
- KPI: booking, tamu, meja, unpaid, paid, confirmed, arrived, completed, cancelled/no-show.
- Kalender bulanan dengan kapasitas terpakai vs kapasitas maksimal.
- Daftar booking dengan search dan filter terpisah untuk booking status/payment status.
- Loading, empty, error, saving, dan stale-refresh state yang jelas.

### Wave 2 — Detail dan action booking

- Detail panel/modal booking.
- Customer, waktu datang, tamu, meja, event, menu, total, payment reference, dan custom answers.
- State transition yang aman:
  - confirm;
  - arrived;
  - seated;
  - completed;
  - cancelled;
  - no-show.
- Action yang tersedia hanya sesuai status saat ini.
- Cancel menggantikan hard delete untuk booking yang sudah terkait pembayaran.
- Audit trail untuk perubahan status penting.

### Wave 3 — Kapasitas dan tanggal

- Default capacity dari settings.
- Override kapasitas per tanggal.
- Closed date.
- Occupancy indicator per tanggal.
- Conflict warning saat kapasitas diturunkan di bawah booking aktif.
- Block save jika perubahan membuat booking aktif invalid, atau minta konfirmasi eksplisit sesuai aturan bisnis.

### Wave 4 — Customer UX `apps/booking`

- Skeleton/loading untuk settings, kapasitas, products, create booking, payment, dan status lookup.
- Motion ringan antar-step, bukan animasi dekoratif berlebihan.
- Ringkasan booking sticky di mobile.
- Review dapat kembali mengedit tanpa menghapus draft.
- Error payment memiliki retry yang memakai booking/invoice existing.
- Pesan jelas untuk loading, configuration empty state, capacity full, payment pending, dan payment failed.
- Progress tetap dinamis untuk flow event/non-event.

### Wave 5 — Analytics Booking

- Funnel landing → type → date → menu → review → checkout → booking → paid.
- Conversion rate pembayaran.
- Cancellation/no-show rate.
- Average guest count dan average booking value.
- Tipe booking/event populer.
- Tanggal dengan demand tertinggi.
- Menu pre-order terpopuler.

Analytics booking dibuat terpisah dari Dashboard DJIWA APP karena sumber event dan keputusan operasionalnya berbeda.

## 5. Database Schema dan Data Contract

> Nama kolom final wajib diverifikasi dari schema live sebelum implementasi. Diagram ini mengikuti contract yang sudah dibaca oleh `apps/booking`.

```text
pos_booking_settings
├── slug
├── title
├── description
├── logoUrl
├── bannerUrl
├── themeColor
├── isActive
├── featuredProductIds
├── customFields
├── raw.bookingTypes[]
├── raw.eventTypes[]
├── bookingWindowDays
├── defaultMaxPeople
├── defaultMaxTables
└── defaultPeoplePerTable

pos_booking_date_capacity
├── slug
├── date / bookingDate
├── maxPeople
├── maxTables
├── peoplePerTable
├── notes
└── isClosed / is_closed

public.pos_products_all
├── _id/sourceId
├── name
├── description
├── imageUrl/imagePath/image
├── price
├── promoPrice
├── categoryId/category
├── isAvailable
└── menuNumber

pos_categories
├── _id/id/sourceId
├── name
├── parentId
└── displayOrder

booking_orders / booking_order_items
└── authoritative booking, item, payment, status, and historical snapshot data
```

### REST/Supabase mapping existing

```text
GET public.pos_booking_settings?slug=booking
GET public.pos_booking_date_capacity?slug=booking
GET public.pos_products_all?isAvailable=true
GET public.pos_categories
POST /functions/v1/public-booking  action=create
POST /functions/v1/public-booking  action=status
POST /functions/v1/public-booking  action=attach-payment
POST /functions/v1/mayar-proxy       action=create-invoice
```

### Backend invariants

- RPC/Edge Function melakukan re-read produk, harga, availability, capacity, dan idempotency.
- Frontend tidak menjadi sumber kebenaran harga atau kapasitas.
- Booking menyimpan snapshot label tipe/event dan custom answers agar histori tidak berubah ketika settings diedit.
- Payment redirect bukan bukti settlement.
- Booking paid tidak dihapus permanen.

## 6. UI/UX Specification

### Admin desktop

- Table-first workspace.
- Toolbar ringkas: date range, booking status, payment status, search.
- Summary strip di atas tabel.
- Kalender dan detail panel dua kolom.
- Sticky context untuk tanggal terpilih.
- Action utama satu per surface; action berisiko masuk menu kontekstual.

### Admin mobile

- Filter sebagai drawer/sheet.
- Booking detail sebagai drawer atau full-screen panel.
- Touch target minimal 44px.
- Tabel berubah menjadi compact booking cards bila layar sempit.
- Tidak mengecilkan font sampai sulit dibaca.

### Customer public

- Satu shell booking dengan state machine yang jelas.
- Progress dinamis sesuai branch event/non-event.
- Sticky CTA di mobile tidak menutupi konten.
- Context summary selalu memperlihatkan tipe, event, tanggal, dan tamu.
- Review dan checkout tetap dipisahkan.

### State wajib

```text
Loading settings       → skeleton + “Memuat pengaturan booking…”
Loading capacity       → calendar skeleton
Loading menu           → product skeleton
Empty configuration    → pesan konfigurasi + kontak admin
Tanggal penuh          → status penuh + saran tanggal lain
Saving booking         → tombol terkunci + “Menyimpan booking…”
Creating payment       → “Menyiapkan pembayaran…”
Payment pending        → status pending + cek status
Payment failed         → alasan + retry booking/invoice yang sama
Refreshing admin       → indikator refresh tanpa menghapus konteks filter
```

## 7. Status Model

### Booking status

```text
pending → confirmed → arrived → seated → completed

exceptions:
cancelled
no_show
expired
```

### Payment status

```text
pending → paid/verified
failed
refunded
```

Tidak boleh menganggap:

- `confirmed` = `paid`;
- `paid` = POS order;
- redirect sukses = webhook/payment settlement.

## 8. Integration Points

### Supabase

- Public-safe views untuk settings, capacity, products, categories.
- Edge Function sebagai boundary create/status/attach payment.
- RPC untuk lock capacity, authoritative price, insert atomic, dan idempotency.
- Realtime hanya bila sudah terbukti aman dan tidak menyebabkan reload loop.

### Mayar

- Create invoice setelah pending booking berhasil.
- Simpan invoice ID dan URL.
- Retry menggunakan booking/reference yang sama.
- Status paid menunggu verifikasi provider/webhook.

### AI/LLM

Tidak diperlukan pada Wave 1–4.

Opsional pada Wave 5+:

- ringkasan demand;
- rekomendasi kapasitas;
- anomaly detection untuk cancellation/no-show.

AI tidak boleh menentukan kapasitas, harga, atau status pembayaran.

### Telegram

Tidak menambah notifikasi pada tahap awal.

Jika kelak dibutuhkan:

- kirim hanya event canonical;
- satu kali per booking/channel;
- dedupe berdasarkan booking/event ID;
- verifikasi message ID dan log delivery.

### Purchasing agent

Tidak ada integrasi langsung dengan purchasing agent pada flow booking. Pre-order menu hanya membaca catalog/product data dan tidak boleh membuat transaksi pembelian.

## 9. Multi-source Data Flow

```text
Admin Booking Settings
        ↓
pos_booking_settings / raw JSONB
        ↓
apps/booking loadBookingData()
        ↓
Type/Event/Custom Fields/Booking Window

Admin Capacity
        ↓
pos_booking_date_capacity
        ↓
apps/booking calendar
        ↓
validated date + guest + table count

POS Catalog
        ↓
pos_products_all + pos_categories
        ↓
Menu pre-order
        ↓
Booking draft item IDs + quantities
        ↓
public-booking Edge Function
        ↓
RPC re-read products/prices/capacity
        ↓
booking order + booking items

Booking order
        ↓
Mayar invoice
        ↓
provider verification/webhook
        ↓
payment status + admin operational status
```

## 10. No-hardcode Audit

### Harus berasal dari DB/Admin settings

- booking types;
- event types;
- labels/descriptions/icon order;
- active/inactive state;
- booking window;
- default/per-date capacity;
- closed dates;
- products, categories, prices, promo prices;
- logo, banner, title, description, theme color;
- custom checkout fields;
- payment configuration.

### Boleh menjadi konstanta teknis

- step key: `type`, `event-type`, `date`, `menu`, `review`, `checkout`;
- API action names;
- icon whitelist;
- validation limits;
- status enum yang sudah dikontrak backend;
- fallback copy untuk missing configuration.

Jika data bisnis kosong, tampilkan configuration/empty state. Jangan diam-diam memakai daftar booking, produk, harga, atau kapasitas lokal.

## 11. Files Likely to Change

### Customer app

- `apps/booking/src/main.tsx`
- `apps/booking/src/lib/client.ts`
- `apps/booking/src/lib/booking-state.ts`
- `apps/booking/src/lib/booking-validation.ts`
- `apps/booking/src/lib/booking-constants.ts`
- `apps/booking/src/index.css`
- komponen booking baru jika hasil audit menunjukkan perlu ekstraksi

### Admin

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- `apps/admin/src/routes/admin/route.tsx` untuk section/sidebar bila disetujui
- hooks booking existing atau hook baru yang mengikuti pola data existing

### Backend/database

- migration additive jika contract perlu diperkuat;
- `supabase/functions/public-booking/`;
- `supabase/functions/mayar-proxy/` hanya bila ada gap terverifikasi;
- RPC/view terkait booking hanya setelah schema audit.

Tidak mengubah payment/schema production pada Wave 0 tanpa review dan rollback plan.

## 12. Validation Plan

### Source

- `git diff --check`.
- Typecheck `apps/booking`.
- Build `apps/booking`.
- Build `apps/admin` jika sidebar/admin ikut berubah.
- Tidak ada hardcoded business options.

### UI flow

- Group meal melewati event step.
- Event membutuhkan event option.
- Custom event text wajib jika diperlukan.
- Calendar hanya memilih tanggal aktif.
- Guest/table capacity block bekerja.
- Menu, review, dan checkout mempertahankan draft.
- Loading/error/empty/saving tampil jelas.

### Payment safety

- Double submit tidak membuat booking duplikat.
- Retry invoice memakai booking yang sama.
- Payment redirect tidak langsung dianggap paid.
- Status lookup memulihkan data booking.
- Tidak melakukan pembayaran nyata saat QA.

### Production

- `apps/booking` canonical URL dan status route HTTP 200.
- `/admin/booking` HTTP 200.
- `version.json` dan hashed bundle cocok dengan commit.
- Supabase live settings/capacity/products mengembalikan shape yang diharapkan.
- Invalid booking metadata menghasilkan 4xx yang aman.
- Screenshot desktop dan mobile setelah implementasi tersedia sebagai Preview Efek.

## 13. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Capacity race saat dua customer booking bersamaan | Lock/revalidate di RPC, bukan frontend |
| Duplicate booking/payment | Guest idempotency key + retry reference yang sama |
| Label settings berubah dan histori ikut berubah | Simpan snapshot label/key di booking |
| Booking paid terhapus | Cancel/refund flow, larang hard delete |
| Admin settings menghapus key JSONB baru | Merge raw JSONB, bukan replace total |
| Loading terlihat seperti blank page | Skeleton dan state message di setiap boundary |
| PWA menyajikan bundle lama | Verifikasi version, bundle hash, SW update |
| Notifikasi Telegram duplikat | Dedupe canonical event; tidak masuk Wave awal |
| Scope terlalu besar | Wave 0 audit, lanjut per wave setelah approval |

## 14. Open Questions untuk Diskusi

1. Apakah section **BOOKING** di sidebar Admin ingin dibuat sebagai section baru, atau cukup menyempurnakan halaman `/admin/booking` existing?
2. Apakah fokus pertama lebih penting ke **operasional Admin** atau **UX customer apps/booking**?
3. Apakah status `arrived`, `seated`, dan `no_show` sudah menjadi SOP resmi tim?
4. Apakah booking tanpa pre-order menu boleh dibuat, atau menu wajib seperti flow saat ini?
5. Apakah perlu notifikasi Telegram untuk booking baru, atau tetap tanpa notifikasi sampai dedupe flow disepakati?

## Rekomendasi

Mulai dari **Wave 0 + Wave 1** setelah scope disetujui:

1. audit route/tab/data contract existing;
2. perkuat Dashboard Booking, kalender, kapasitas, dan state loading/error;
3. jangan menyentuh payment provider atau schema production sebelum contract dan rollback plan diverifikasi.
