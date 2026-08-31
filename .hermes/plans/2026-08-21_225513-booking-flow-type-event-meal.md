# Plan: Booking Flow — Tipe Event vs Makan Bersama

**Status:** Plan only — belum ada implementasi, migration, commit, push, atau deploy.
**Target app:** `/opt/djiwatentramapp/apps/booking`
**Domain:** `https://booking.yumme.id`
**Tanggal plan:** 2026-08-21

## 1. Goal

Menyusun ulang customer booking flow agar dimulai dari niat booking, bukan langsung dari pemilihan menu.

Flow bisnis yang dituju:

```text
Pilih tipe booking
├── Makan bersama keluarga/teman/rekan kerja
│   └── Tanggal & jumlah tamu
└── Acara / event
    └── Jenis acara
        ├── Pernikahan
        ├── Arisan
        ├── Acara mahasiswa
        ├── Acara kolaborasi
        └── Lainnya + input sendiri
            ↓
Tanggal & jumlah tamu
            ↓
Pilih menu
            ↓
Review pesanan
            ↓
Checkout: data diri
            ↓
Mayar
            ↓
Invoice/status booking
```

Target UX: customer merasa berada dalam **satu aplikasi dan satu booking journey**, bukan berpindah ke banyak halaman seperti `/booking/menu`, `/booking/customer`, dan `/booking/review`.

## 2. Current Context

Yang sudah diverifikasi:

- `apps/booking/src/main.tsx` saat ini memiliki step internal date → menu → customer → review.
- `apps/booking/src/lib/booking-constants.ts` mendefinisikan `BOOKING_STEPS = ["date", "menu", "customer", "review"]`.
- `apps/booking/src/lib/client.ts` sudah memiliki `BookingDraft`, `createBooking`, `createBookingPayment`, `lookupBooking`.
- `BookingDraft` saat ini menyimpan `date`, `guests`, `tableCount`, `items`, dan `customer`; belum memiliki tipe booking/event type secara eksplisit.
- Edge Function `supabase/functions/public-booking/index.ts` sudah menerima `customAnswers` dan meneruskannya ke RPC `create_public_booking`.
- Admin booking sudah membaca dan menampilkan `customAnswers`, sehingga pilihan tipe/event dapat tetap terlihat di sisi admin.
- `pos_booking_settings` sudah menyediakan `customFields`; ini perlu dipertahankan untuk field admin-configurable yang tidak spesifik pada flow tipe booking.
- Flow Mayar existing membuat booking terlebih dahulu, lalu membuat invoice dan attach payment. Flow ini harus dipertahankan dengan idempotency dan retry pada booking yang sama.

### Diferensiasi scope

Ini bukan sekadar rename halaman menu. Ini adalah perubahan **information architecture dan state machine customer booking**:

- tipe booking menjadi keputusan pertama;
- event memiliki sub-step conditional;
- makan bersama melewati sub-step event;
- semua step tetap menggunakan satu shell UI;
- route status pembayaran tetap terpisah karena diperlukan sebagai callback Mayar.

## 3. Architecture Decision

### Rekomendasi: satu route/shell + internal step state

Gunakan satu halaman utama:

```text
/booking
```

Dengan state/query step untuk refresh dan browser back:

```text
/booking?step=type
/booking?step=event-type
/booking?step=date
/booking?step=menu
/booking?step=review
/booking?step=checkout
```

Route pembayaran/status tetap:

```text
/booking/status?code=<bookingCode>
```

### Alternatif yang tidak dipilih

| Pendekatan | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| Banyak route penuh: `/booking/menu`, `/booking/customer`, `/booking/review` | URL eksplisit, implementasi awal mudah | Terasa berpindah halaman, state mudah hilang, lebih banyak route/link yang harus dirawat | Tidak dipilih |
| Satu route tanpa query step | Shell sangat sederhana | Refresh/back tidak memulihkan step, deep-link/debug lebih sulit | Tidak dipilih |
| **Satu shell + internal step/query state** | Journey terasa utuh, back/refresh dapat dipulihkan, route publik minimal | Perlu guard transisi dan serialisasi draft | **Dipilih** |

## 4. Proposed State Machine

```text
TYPE
 ├─ group_meal → DATE_GUESTS
 └─ event → EVENT_TYPE
              ├─ known event → DATE_GUESTS
              └─ other → validate eventTypeOther → DATE_GUESTS

DATE_GUESTS → MENU
MENU → REVIEW
REVIEW → CHECKOUT
CHECKOUT → CREATE_PENDING_BOOKING
CREATE_PENDING_BOOKING → CREATE_MAYAR_INVOICE
CREATE_MAYAR_INVOICE → ATTACH_PAYMENT_REFERENCE
ATTACH_PAYMENT_REFERENCE → MAYAR_REDIRECT
MAYAR_REDIRECT → STATUS
```

### Transition guards

- Tidak dapat masuk `DATE_GUESTS` tanpa `bookingType`.
- Event tidak dapat melewati `EVENT_TYPE` tanpa `eventType`.
- `eventType = other` membutuhkan `eventTypeOther` non-empty.
- Tidak dapat masuk `MENU` tanpa tanggal dan jumlah tamu valid.
- Tidak dapat masuk `REVIEW` tanpa minimal satu menu.
- Tidak dapat membuat booking tanpa nama dan WhatsApp valid.
- Submit checkout dikunci imperatif dengan `useRef` agar double-click tidak membuat side effect ganda.
- Retry invoice menggunakan booking yang sama, bukan membuat booking baru.

## 5. UI/UX Specification

### Global shell

```text
[← Back]                         [Logo/brand]

Progress: Langkah 2 dari 6
[==================------]

[Current step content]

[Sticky primary CTA]
```

Prinsip:

- satu primary action per step;
- card radius 24px, control radius 14px;
- brand `#1a5dc6` untuk selected state dan CTA;
- Plus Jakarta Sans untuk heading, Inter untuk body;
- mobile-first, touch target minimal 44px;
- tidak menampilkan semua label step sekaligus di mobile;
- query step tidak boleh membuat user merasa membuka banyak halaman.

### Step 1 — Pilih tipe booking

Heading:

```text
Untuk kebutuhan apa booking ini?
Pilih yang paling sesuai dengan rencana kamu.
```

Dua card besar:

```text
Makan bersama
Keluarga, teman, atau rekan kerja

Acara / event
Pernikahan, arisan, kampus, kolaborasi, dan lainnya
```

Interaction:

- seluruh card clickable;
- selected card memakai border/accent dan check indicator;
- CTA `Lanjutkan` disabled sebelum pilihan ada;
- tidak menampilkan field event sebelum event dipilih.

### Step 2 — Jenis event (conditional)

Hanya muncul untuk `bookingType = event`.

Pilihan:

```text
Pernikahan
Arisan
Acara mahasiswa
Acara kolaborasi
Lainnya
```

Untuk `Lainnya`:

- tampilkan input setelah card dipilih;
- label `Tulis jenis acara`;
- validasi trim dan panjang maksimum;
- jangan menghapus pilihan saat user kembali dari tanggal.

CTA:

```text
Lanjut ke tanggal
```

### Step 3 — Tanggal dan jumlah tamu

Pertahankan month calendar yang sudah ada, tetapi tambahkan context chip:

```text
Acara / Pernikahan
atau
Makan bersama
```

Isi:

- month selector;
- calendar grid;
- status `Tersedia`, `Terbatas`, `Penuh`;
- tanggal terpilih;
- jumlah tamu;
- estimasi meja;
- capacity error yang actionable;
- CTA `Lanjut ke menu`.

Jangan menampilkan daftar tanggal panjang lagi.

### Step 4 — Pilih menu

Heading:

```text
Pilih menu untuk pre-order
Menu akan disiapkan sesuai tanggal dan jumlah tamu.
```

Summary compact di atas:

```text
Makan bersama · 21 Agustus · 4 tamu
```

UI:

- kategori/filter menu jika data tersedia;
- search tetap tersedia;
- product card mempertahankan harga existing;
- quantity control tetap 44px;
- cart summary sticky di mobile;
- empty state jika produk tidak tersedia;
- error state dengan retry jika products gagal dimuat.

### Step 5 — Review pesanan

Tampilkan:

```text
Tipe booking
Jenis event jika event
Tanggal
Jumlah tamu dan estimasi meja
Daftar menu dan quantity
Subtotal/total
```

Action:

```text
Ubah tipe booking
Ubah tanggal
Ubah menu
Lanjut ke checkout
```

Semua edit kembali ke step yang relevan tanpa menghapus data lain.

### Step 6 — Checkout

Field wajib:

- nama lengkap;
- nomor WhatsApp.

Field opsional/konfigurabel:

- email;
- catatan tambahan;
- `settings.customFields` yang memang aktif.

UX:

- validasi WhatsApp setelah normalisasi non-digit;
- email divalidasi jika diisi;
- data tidak di-reset saat error;
- ringkasan booking tetap terlihat;
- CTA `Lanjut ke pembayaran Mayar`;
- submit lock imperatif.

### Payment/status

Setelah checkout:

```text
Creating pending booking
→ Membuat invoice Mayar
→ Menyimpan reference payment
→ Redirect Mayar
```

Jika attach payment gagal sementara:

- jangan menahan redirect jika invoice sudah valid;
- simpan payment reference/retry context;
- status tetap bisa dilihat melalui booking code;
- jangan membuat booking/invoice duplikat.

## 6. Data Model dan Database Schema

### Existing entities yang terlibat

```text
pos.booking_settings
  ├─ slug
  ├─ title / description
  ├─ booking_window_days
  ├─ default_max_people
  ├─ default_max_tables
  ├─ default_people_per_table
  ├─ custom_fields
  └─ featured_product_ids

pos.booking_date_capacity
  ├─ slug
  ├─ date
  ├─ max_people
  ├─ max_tables
  ├─ people_per_table
  ├─ notes
  └─ is_closed

pos.orders / public booking storage
  ├─ booking_code
  ├─ booking_date
  ├─ guest_count
  ├─ table_count
  ├─ customer_name
  ├─ customer_phone
  ├─ customer_email
  ├─ notes
  ├─ custom_answers JSONB
  ├─ items JSONB
  ├─ total_amount
  ├─ booking_status
  ├─ payment_status
  └─ payment_gateway JSONB/reference
```

> Nama fisik tabel/kolom/RPC harus diverifikasi ulang dari schema production/staging sebelum implementasi. Plan ini tidak mengasumsikan migration baru sebelum audit RPC selesai.

### Supabase self-hosted sebagai source of truth

Semua data yang memengaruhi UI, availability, harga, dan payload booking wajib berasal dari Supabase self-hosted di `supabase.yumme.id` melalui public-safe view/RPC atau Edge Function. Frontend tidak boleh menjadi sumber data bisnis.

```text
Supabase self-hosted
├── booking settings
│   ├── title, description, logo, banner, theme
│   ├── booking window dan default capacity
│   ├── booking type options
│   ├── event type options
│   ├── checkout custom fields
│   └── featured product IDs
├── date capacity / closed dates
├── categories
├── products / menu
├── product availability dan harga
├── booking/order records
└── payment/invoice references
```

#### Data yang wajib database-driven

| Data | Source Supabase self-hosted | Frontend behavior |
|---|---|---|
| Tipe booking | `pos.booking_settings` JSONB/config atau view settings publik | Render card dari response, bukan array hardcoded |
| Jenis event | Settings JSONB/table/view event options | Render options aktif + urutan dari DB |
| Label dan deskripsi | Settings/config publik | Fallback hanya untuk error/loading, bukan source normal |
| Menu/produk | `pos_products_all` atau public product view | Ambil dari Supabase, filter availability di query |
| Kategori menu | Product/category source DB | Filter dari data DB |
| Harga/promo | Supabase product/pricing source | Jangan hitung harga bisnis di frontend |
| Kapasitas | `pos_booking_date_capacity` + `pos_booking_settings` | Calendar membaca hasil API/RPC |
| Custom checkout fields | `pos.booking_settings.custom_fields` | Render field yang aktif dari DB |
| Brand/theme | `pos_booking_settings` | Gunakan theme response dengan fallback aman |

#### Kontrak event options yang direkomendasikan

Gunakan konfigurasi database yang dapat diubah admin, misalnya JSONB pada settings yang sudah ada atau tabel konfigurasi additive:

```json
[
  {
    "key": "wedding",
    "label": "Pernikahan",
    "description": "Acara pernikahan dan resepsi",
    "icon": "heart-handshake",
    "sortOrder": 1,
    "isActive": true,
    "requiresCustomText": false
  },
  {
    "key": "other",
    "label": "Lainnya",
    "description": "Jenis acara lain",
    "icon": "sparkles",
    "sortOrder": 5,
    "isActive": true,
    "requiresCustomText": true
  }
]
```

Catatan:

- `key`, `label`, `description`, urutan, status aktif, dan metadata UI dibaca dari DB;
- icon harus memakai whitelist mapping aman di frontend, karena nama icon dari DB tidak boleh di-import secara dinamis tanpa validasi;
- jika konfigurasi belum tersedia, tampilkan error/configuration state yang jelas atau fallback sementara yang diberi feature flag, bukan diam-diam menjadikan hardcoded list sebagai source production;
- admin perlu memiliki editor/settings untuk mengaktifkan, menonaktifkan, mengurutkan, dan mengubah label event sebelum opsi ini dinyatakan production-ready.

#### Opsi penyimpanan tipe/event booking

Gunakan field existing `customAnswers` secara backward compatible untuk menyimpan snapshot pilihan customer:

```json
{
  "Tipe booking": "event",
  "Tipe booking label": "Acara / event",
  "Jenis acara": "wedding",
  "Jenis acara label": "Pernikahan",
  "Jenis acara lainnya": null
}
```

Snapshot key dan label diperlukan agar histori booking tetap dapat dibaca jika label settings berubah di masa depan.

Untuk makan bersama:

```json
{
  "Tipe booking": "group_meal",
  "Tipe booking label": "Makan bersama",
  "Jenis acara": null,
  "Jenis acara label": null,
  "Jenis acara lainnya": null
}
```

Alasan:

- Edge Function sudah menerima `customAnswers`;
- admin sudah menampilkan `customAnswers`;
- tidak perlu migration destructive;
- booking lama tetap kompatibel;
- key/label yang tersimpan menjadi historical snapshot.

### Opsi schema tahap berikutnya

Jika reporting/filtering membutuhkan query langsung berdasarkan tipe/event, siapkan migration additive:

```sql
ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS booking_type text NULL,
  ADD COLUMN IF NOT EXISTS event_type text NULL,
  ADD COLUMN IF NOT EXISTS event_type_other text NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_booking_type
  ON pos.orders (booking_type);

CREATE INDEX IF NOT EXISTS idx_pos_orders_event_type
  ON pos.orders (event_type);
```

Migration ini **belum dijalankan** dalam plan. Sebelum dipilih, audit:

- apakah physical table memakai `pos.orders` atau projection/view lain;
- RPC `create_public_booking` dan `get_public_booking_status`;
- view `pos_orders_all`/public booking view;
- RLS/policy/grant;
- admin hybrid mapper.

### REST/RPC path mapping

```text
Frontend apps/booking
  → POST {SUPABASE_URL}/functions/v1/public-booking
      action=create
      action=status
      action=attach-payment

public-booking Edge Function
  → POST {SUPABASE_URL}/rest/v1/rpc/create_public_booking
  → POST {SUPABASE_URL}/rest/v1/rpc/get_public_booking_status
  → POST {SUPABASE_URL}/rest/v1/rpc/attach_public_booking_payment

Frontend payment
  → POST {SUPABASE_URL}/functions/v1/mayar-proxy
      action=create-invoice
```

## 7. Frontend File Plan

### Primary files

- `apps/booking/src/main.tsx`
  - tambah state machine step;
  - tambah `BookingTypeStep`;
  - tambah `EventTypeStep`;
  - ubah progress dan back behavior;
  - pertahankan date/calendar logic;
  - pisahkan review dan checkout secara jelas.

- `apps/booking/src/lib/booking-constants.ts`
  - definisi tipe booking/event;
  - daftar step dan label;
  - helper normalisasi label.

- `apps/booking/src/lib/client.ts`
  - extend `BookingDraft` dengan booking type/event fields;
  - kirim `customAnswers` atau field baru sesuai hasil schema audit;
  - normalize response tetap backward compatible.

- `apps/booking/src/index.css`
  - style cards tipe/event;
  - responsive shell;
  - compact booking summary;
  - sticky CTA dengan safe-area;
  - loading/empty/error states.

### File yang mungkin diperlukan

- `apps/booking/src/lib/booking-validation.ts`
  - validasi tipe, event type, tanggal/tamu, customer, dan WhatsApp.

- `apps/booking/src/components/booking/BookingContextSummary.tsx`
  - summary reusable untuk date/menu/review/checkout.

- `apps/booking/src/components/booking/BookingTypeStep.tsx`
- `apps/booking/src/components/booking/EventTypeStep.tsx`
- `apps/booking/src/components/booking/BookingReview.tsx`

Komponen baru hanya dibuat jika ekstraksi meningkatkan maintainability; jangan menambah file hanya untuk memecah JSX kecil.

## 8. Backend/API Plan

Tahap backend-first sebelum frontend payment flow diubah:

1. Audit SQL/RPC `create_public_booking`.
2. Pastikan `customAnswers` benar-benar tersimpan dan keluar di status/admin projection.
3. Audit capacity locking dan concurrent checkout.
4. Pastikan payload baru tidak menurunkan compatibility untuk caller lama.
5. Tambahkan validation server-side:
   - booking type valid;
   - event type wajib jika event;
   - event type other wajib jika `other`;
   - panjang input dibatasi;
   - customer phone valid.
6. Jika customAnswers dipakai, whitelist key untuk tipe/event agar arbitrary JSON tidak menjadi sumber data kotor.
7. Jika kolom baru dipilih, migration additive + view/RPC/admin mapper dirilis berpasangan.

### Payment safety

- Booking dibuat pending sekali.
- Invoice Mayar dibuat setelah review/customer valid.
- Retry memakai booking yang sama.
- Simpan invoice reference secara durable.
- Jangan membuat invoice kedua jika invoice lama masih valid.
- Tambahkan timeout AbortController pada call Mayar jika belum tersedia di call path ini.
- Normalisasi link Mayar dari `link`, `paymentUrl`, atau field response yang valid.

## 9. Multi-source Data Flow

```text
pos.booking_settings
  → booking window/default capacity/custom fields/featured menu

pos.booking_date_capacity
  → calendar availability and capacity override

pos_products_all
  → menu catalog and price

Customer draft state
  → type/event/date/guests/items/customer

public-booking Edge Function
  → create_public_booking RPC
  → booking/order record + customAnswers/items

Mayar proxy
  → invoice
  → payment reference

Mayar webhook/status
  → payment status/order status

Admin /admin/booking
  → reads booking/order + customAnswers
  → displays type/event context to operations

Telegram/Yumi AI
  → existing booking query/report may expose booking code/date/guest/payment
  → only extend labels if operations needs booking type/event context
```

Tidak ada kebutuhan AI/LLM atau purchasing-agent sync untuk tahap pertama. Jangan menambahkan AI classification untuk tipe event karena customer sudah memilih pilihan terstruktur; AI hanya dipertimbangkan sebagai enhancement pencarian/reporting setelah data stabil.

## 10. Telegram and Operational Integration

Audit dan update hanya bila memang dibutuhkan:

- `yumi-ai-bot` booking report dapat menampilkan `bookingType/eventType` sebagai metadata tambahan.
- Notifikasi operasional tidak boleh berubah trigger hanya karena tipe booking baru.
- Payment notification tetap mengikuti status paid/completed, bukan booking pending.
- Source/channel booking tetap dipertahankan.
- Jangan mengirim data customer sensitif penuh ke Telegram; cukup nama yang diperlukan, booking code, tanggal, tamu, tipe/event, dan status.

## 11. No-hardcode Audit

Frontend tidak boleh hardcode data bisnis yang seharusnya dikelola dari Supabase self-hosted.

### Wajib berasal dari Supabase

- booking window;
- default capacity;
- date override/closed dates;
- tipe booking options;
- event type options;
- label/deskripsi event;
- menu dan produk;
- kategori menu;
- harga dan promo price;
- featured products;
- custom checkout fields;
- brand/logo/banner/theme;
- status availability.

Source path normal:

```text
Supabase self-hosted
  → public-safe view/RPC/Edge Function
  → loadBookingData()
  → booking state/UI
```

### Konstanta yang masih diperbolehkan

Hanya konstanta teknis yang tidak merupakan data bisnis, misalnya:

- step state internal: `type`, `event-type`, `date`, `menu`, `review`, `checkout`;
- batas keamanan input maksimal;
- nama action API;
- icon whitelist mapping;
- fallback loading/error copy generik.

Daftar berikut **tidak boleh** menjadi array production hardcoded di frontend:

```text
Pernikahan
Arisan
Acara mahasiswa
Acara kolaborasi
Lainnya
```

Daftar tersebut harus dirender dari settings/event-options response Supabase. Jika response kosong, tampilkan configuration/empty state dan catat error, bukan diam-diam memakai daftar lokal.

### Admin/configuration requirement

Sebelum customer flow dinyatakan selesai, harus ada salah satu sumber konfigurasi yang benar-benar dapat dikelola:

1. editor event options di Admin yang menulis ke settings Supabase; atau
2. migration/seed additive untuk settings JSONB/table yang menjadi sumber resmi dan dapat diedit melalui jalur admin yang sudah ada.

### Snapshot historis

Saat booking dibuat, simpan `key` dan `label` yang dipilih ke `customAnswers` agar histori tidak berubah ketika admin mengganti label atau menonaktifkan option.

### Tidak boleh dilakukan

- jangan mengambil daftar event dari localStorage sebagai source of truth;
- jangan mengambil harga dari query string/client payload tanpa validasi server;
- jangan menganggap data mock/fallback sebagai data production;
- jangan mengirim item/harga final dari frontend tanpa RPC memvalidasi ulang product dan pricing;
- jangan menambah hardcoded event option hanya untuk menutupi settings DB yang kosong.


## 12. Loading / Empty / Error / Saving States

### Loading

- skeleton untuk type/event cards;
- skeleton calendar/menu;
- disabled CTA selama data belum tersedia.

### Empty

- tidak ada kapasitas: jelaskan admin perlu menambahkan tanggal;
- bulan kosong: sarankan bulan berikutnya;
- produk kosong: jelaskan menu belum tersedia, jangan tampilkan blank screen.

### Error

- load booking data gagal: pesan actionable + retry;
- kapasitas berubah saat checkout: kembali ke date step, pertahankan draft menu;
- payment gagal: pertahankan booking code dan retry invoice yang sama.

### Saving

- CTA menampilkan progress saat create booking/invoice;
- disable back/submit ganda selama side effect;
- jika redirect Mayar berhasil, jangan menampilkan success palsu sebelum status payment valid.

## 13. Route and Compatibility Plan

- Canonical customer entry tetap `/booking`.
- Query step dipakai untuk restore state, bukan membuat page hierarchy baru.
- Route `/booking/status` tetap dipertahankan untuk callback Mayar.
- Deep-link legacy `/booking/menu`, `/booking/customer`, `/booking/review` harus diaudit sebelum dihapus.
- Jika masih ada external link, lakukan redirect/compatibility mapping ke `/booking?step=...`.
- Audit seluruh link yang merujuk ke route lama sebelum perubahan.
- Jangan menghapus route lama dalam tahap pertama bila belum ada evidence tidak dipakai.

## 14. Implementation Waves

### Wave 1 — Contract and backend audit

- audit schema/RPC/view/RLS;
- audit `customAnswers` persistence;
- define payload compatibility;
- define validation and error mapping;
- confirm whether migration is truly necessary.

### Wave 2 — Frontend state machine and type/event steps

- add booking type state;
- add conditional event type state;
- add query-step restoration;
- update progress/back guards;
- persist draft safely in memory/session/local storage as appropriate.

### Wave 3 — Date/menu/review/checkout integration

- connect existing calendar;
- add booking context summary;
- update menu copy and cart summary;
- add review edit links;
- separate review from customer checkout.

### Wave 4 — Payment reliability

- preserve create pending booking;
- add retry same booking/invoice reference;
- validate phone/email;
- ensure Mayar redirect/status behavior;
- test double click, timeout, refresh, and back navigation.

### Wave 5 — QA and release

- unit tests for state transitions and validation;
- integration test for public-booking payload;
- manual mobile QA;
- visual screenshot at narrow and desktop viewport;
- build/typecheck;
- deploy only booking app/function/migration files that changed;
- verify production HTTP and payment/status route.

## 15. Tests and Validation

### Unit tests

- group meal skips event type;
- event requires event type;
- other requires custom event text;
- invalid guest capacity blocks next;
- empty cart blocks review;
- missing name/phone blocks checkout;
- edit-back preserves unrelated draft fields;
- query step cannot bypass required previous state.

### Integration tests

- create payload contains type/event metadata;
- old payload without type remains accepted during compatibility window;
- customAnswers appears in booking/admin response;
- capacity conflict returns actionable 409;
- repeated create with same idempotency key returns same booking;
- invoice retry does not create a second booking/invoice;
- payment reference/status mapping remains correct.

### Visual QA

Mobile widths:

```text
390px
430px
```

Desktop:

```text
1024px
1440px
```

Check:

- card symmetry;
- no horizontal overflow;
- CTA does not cover content;
- selected state visible;
- one clear primary action;
- event conditional step does not cause layout jump;
- review and checkout remain compact;
- loading/empty/error states are readable.

### Quality gates

```text
[ ] bun run check-types — apps/booking
[ ] bun run build — apps/booking
[ ] git diff --check
[ ] no secrets or sensitive logs
[ ] RPC/schema audit completed
[ ] payment retry/idempotency verified
[ ] browser screenshot evidence captured
[ ] production HTTP/status route verified
[ ] selective commit only
```

## 16. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `customAnswers` diterima Edge Function tetapi tidak tersimpan RPC | Tipe/event hilang di admin | Test langsung RPC/staging sebelum frontend release |
| Query-step dibuka langsung tanpa draft | User melihat step invalid | Guard dan fallback ke step terakhir yang valid |
| Booking dibuat dua kali karena double-click/retry | Duplikasi order/invoice | Imperative submit lock + idempotency key |
| Capacity berubah saat user lama di menu | Overbooking | Revalidate/lock pada RPC create, handle 409 |
| Migration langsung menambah kolom tetapi view/RPC belum ikut | Data tidak muncul di admin/status | Release schema/RPC/view secara berpasangan |
| Terlalu banyak komponen/step membuat flow panjang | UX kembali terasa berat | Satu shell, satu CTA, summary compact, conditional event step |
| Event options hardcoded di banyak file | Drift label/report | Single constants mapping atau settings JSONB tahap lanjut |
| Mayar timeout setelah invoice dibuat | Invoice kedua saat retry | Durable payment reference dan reuse invoice valid |
| Route lama masih dipakai external link | Broken customer journey | Audit link + compatibility redirect sebelum deletion |

## 17. Definition of Done

Feature dianggap siap hanya jika:

1. Customer memilih tipe booking sebelum tanggal/menu.
2. Event menampilkan sub-choice event; makan bersama melewatinya.
3. User dapat menyelesaikan seluruh flow dalam satu shell `/booking`.
4. Refresh/back tidak merusak draft atau melewati validation guard.
5. Admin dapat melihat tipe/event booking.
6. Existing capacity logic tetap aman.
7. Mayar tetap payment-first dengan retry booking/invoice yang sama.
8. Booking lama tetap dapat dilihat.
9. Mobile UI simetris, compact, dan tidak menutupi konten.
10. Typecheck, build, API test, dan visual QA lulus.
11. Production verification memiliki bukti HTTP/bundle/status route.

## 18. Open Decisions Before Implementation

1. Apakah tipe/event cukup disimpan di `customAnswers`, atau user membutuhkan filter/reporting SQL langsung sejak awal?
2. Apakah daftar jenis event harus dapat diubah admin tanpa deploy?
3. Apakah `email` wajib atau tetap optional?
4. Apakah `catatan` berada di checkout umum atau khusus event?
5. Apakah event perlu field tambahan di tahap pertama, misalnya nama acara atau kebutuhan setup?
6. Apakah menu untuk event berbeda dari menu makan bersama, atau catalog tetap sama?
7. Berapa lama kapasitas di-hold sebelum customer membayar?
8. Apakah route legacy perlu redirect langsung atau dipertahankan selama satu release cycle?
