# DJIWA APP — Dashboard Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
>
> **Status:** Implemented and deployed. Verifikasi build, route, bundle, dan production selesai.

**Goal:** Menambahkan section sidebar `DJIWA APP` dengan submenu bernama persis `Dashboard`, lalu membuat dashboard analitik untuk memantau performa `apps/customer` menggunakan data live yang sudah tersedia.

**Architecture:** Tambahkan route admin baru `/admin/djiwa-app` sebagai halaman Dashboard. Sidebar akan memiliki section collapsible `DJIWA APP`; menu `Pelanggan` yang saat ini berada di `MARKETING` dipindahkan secara navigasi ke section ini tanpa menghapus route `/admin/customers`. Dashboard menggunakan view Supabase yang sudah ada dan query agregasi read-only terlebih dahulu; tidak membuat sumber data duplikat.

**Tech Stack:** React 19, Vite, TanStack Router, TypeScript, Tailwind CSS v4, Supabase/PostgreSQL, Recharts bila grafik diperlukan dan sudah tersedia.

---

## 1. Konteks Saat Ini

### Yang sudah ada

- Sidebar Admin berada di `apps/admin/src/routes/admin/route.tsx`.
- Menu `Pelanggan` saat ini tampil sebagai item langsung di section `MARKETING` dan route-nya adalah `/admin/customers`.
- Halaman customer sudah membaca:
  - `public.pos_customers_view`
  - `public.pos_orders`
- Admin sudah memiliki permission `analytics:view` dan halaman dashboard umum `/admin`.
- `public.pos_orders` sudah menyediakan provenance order seperti `source`, `orderChannel`, `customerSourceId`, `totalAmount`, `status`, `paymentMethod`, `createdAt`, dan `items`.
- Wallet customer sudah memiliki view/tabel dan ledger melalui migration `20260822000001_customer_wallet_foundation.sql`.

### Scope plan ini

Termasuk:

1. Section sidebar `DJIWA APP`.
2. Submenu `Dashboard` dengan label tampilan persis `Dashboard`.
3. Pemindahan navigasi `Pelanggan` dari `MARKETING` ke `DJIWA APP`.
4. Dashboard analitik customer app berbasis data live.

Tidak termasuk pada tahap ini:

- Mengubah flow checkout `apps/customer`.
- Membuat sistem event tracking baru.
- Mengubah saldo, order, payment, atau data historis.
- Membuat submenu `Aktivitas Customer`, `Order Customer App`, atau `Djiwa Pay Customer` sebagai halaman terpisah. Struktur tersebut dapat ditambahkan setelah Dashboard disetujui dan dipakai.

---

## 2. Struktur Navigasi yang Diinginkan

```text
DJIWA APP
├── Dashboard
└── Pelanggan

MARKETING
├── Promosi
├── Mini Games
└── KOL
```

### Route

```text
/admin/djiwa-app       → Dashboard DJIWA APP
/admin/customers       → Pelanggan existing, dipindahkan secara navigasi
```

Route `/admin/customers` tetap dipertahankan agar bookmark dan link lama tidak rusak.

### Sidebar behavior

- Section dapat dibuka/tutup seperti section `Keuangan`.
- Section otomatis terbuka saat pathname berada di `/admin/djiwa-app` atau `/admin/customers`.
- State buka/tutup disimpan dengan localStorage, mengikuti pola section sidebar existing.
- Mode sidebar collapsed tetap menampilkan icon link yang dapat diakses.
- Permission Dashboard: `analytics:view`.
- Permission Pelanggan: mengikuti permission existing dan tidak diperketat dalam plan ini.

---

## 3. Dashboard UI/UX Specification

### Header

- Judul: `Dashboard`.
- Subtitle: `Pantau performa DJIWA APP dan aktivitas pelanggan.`
- Filter periode:
  - Hari ini
  - 7 hari
  - 30 hari
  - Bulan ini
  - Custom date range bila pola date-picker existing mendukungnya
- Filter channel default: `Customer App` dengan provenance canonical `customer_self_service` dan/atau `orderChannel = app` sesuai audit data.
- Tampilkan waktu pembaruan terakhir dan tombol refresh read-only.

### KPI cards

Minimal V1:

1. Total pelanggan aktif.
2. Pelanggan baru pada periode terpilih.
3. Pelanggan aktif pada periode terpilih.
4. Order dari Customer App.
5. Total spending dari Customer App.
6. Total kunjungan Customer App, bila field sumbernya tersedia.
7. Saldo Djiwa Pay customer, sebagai saldo agregat read-only.

Setiap KPI wajib memiliki:

- Nilai loading/skeleton.
- Nilai kosong `0` atau `Belum ada data`, bukan blank.
- Error state dengan tombol coba lagi.
- Label periode yang jelas.
- Tidak menampilkan angka estimasi tanpa label.

### Grafik dan tabel

V1 disarankan:

- Grafik order per hari.
- Grafik nilai spending per hari.
- Ranking produk dari `public.pos_orders.items` untuk order customer app.
- Tabel customer paling aktif atau paling banyak spending:
  - Nama
  - Email/telepon
  - Jumlah order app
  - Total spending
  - Kunjungan
  - Terakhir aktif
  - Link `Lihat pelanggan` ke `/admin/customers`

### Responsive behavior

- Desktop: KPI 4 kolom, grafik 2 kolom, tabel full width.
- Tablet: KPI 2 kolom, grafik satu kolom.
- Mobile: KPI 2 kolom compact; grafik dapat horizontal-scroll; tabel berubah menjadi card/list atau tetap horizontal-scroll dengan primary identity tidak terpotong.
- Tidak memakai warna amber/gold sebagai identitas Customer App; gunakan azure/violet/cyan sesuai visual customer app.
- Jangan menambah filter yang tidak didukung data live.

### State matrix

| State | Tampilan |
|---|---|
| Loading | Skeleton KPI, chart, dan table rows |
| Empty | Pesan periode belum memiliki aktivitas |
| Error | Kartu error + tombol `Coba lagi` |
| Partial data | Widget yang gagal diberi status per-widget, widget lain tetap tampil |
| Loaded | Angka, grafik, dan tabel dengan periode aktif |

---

## 4. Database Schema dan Data Contract

### Sumber utama

```text
pos.customers
    │
    ├── public.pos_customers_view
    │       ├── source_id
    │       ├── email
    │       ├── name
    │       ├── phone
    │       ├── total_orders
    │       ├── total_spent
    │       ├── last_order_at
    │       ├── created_at
    │       ├── wallet_balance
    │       └── wallet_* totals/status
    │
    └── pos.customer_wallets
            ├── available_balance
            ├── held_balance
            ├── total_credited
            ├── total_debited
            └── status

pos.orders
    │
    └── public.pos_orders
            ├── _id
            ├── orderNumber
            ├── totalAmount
            ├── status
            ├── paymentMethod
            ├── customerName
            ├── source
            ├── orderChannel
            ├── createdAt
            ├── customerSourceId
            └── items[]
```

### Filter order Customer App

Gunakan canonical provenance, bukan tebakan dari nama customer:

```sql
WHERE source = 'customer_self_service'
   OR orderChannel = 'app'
```

Implementer wajib melakukan audit terhadap overlap agar order tidak terhitung dua kali ketika kedua kondisi benar. Gunakan `_id` sebagai deduplication key.

### Wallet

Dashboard hanya membaca:

- `public.pos_customer_wallets_view` bila tersedia untuk aggregate.
- `public.pos_customers_view` untuk saldo per customer.
- `pos.customer_wallet_ledger` hanya melalui akses yang memang sudah diizinkan; jangan membuka ledger sensitif ke public/anon tanpa audit RLS.

Tidak boleh ada mutation dari dashboard.

### REST mapping

Jika memakai Supabase client, mapping endpoint-nya adalah:

```text
GET /rest/v1/pos_customers_view
GET /rest/v1/pos_orders
GET /rest/v1/pos_customer_wallets_view   (jika tersedia dan authorized)
```

RLS/grant harus diverifikasi sebelum implementasi. Bila agregasi terlalu besar untuk client-side, buat view/RPC read-only additive setelah approval, bukan query tanpa batas.

### Data completeness audit sebelum coding

Audit wajib memastikan field yang sudah dipakai halaman customer benar-benar tersedia dari view live:

- `djiwaapp_visit_count`
- `last_active_at`
- `membership_expires_at`
- wallet fields
- order totals

Jika field tersebut hanya berasal dari perubahan view yang belum tercermin di migration, buat migration additive/idempotent untuk memperbarui view. Jangan mengubah tabel historis.

---

## 5. Multi-Source Data Flow

```text
apps/customer
  ├── membuat order source=customer_self_service
  ├── memakai wallet/Djiwa Pay
  └── menghasilkan aktivitas customer
          │
          ▼
Supabase views/tables
  ├── pos.customers / pos_customers_view
  ├── pos.orders / pos_orders
  ├── pos.order_items melalui items JSON view
  └── pos.customer_wallets / wallet ledger
          │
          ▼
Admin DJIWA APP Dashboard
  ├── KPI customer
  ├── KPI order dan spending
  ├── tren harian
  ├── produk populer
  └── link detail ke /admin/customers
```

Tidak ada sinkronisasi balik dari Dashboard ke `apps/customer` pada V1.

---

## 6. Files Likely to Change

### Frontend

- Modify: `apps/admin/src/routes/admin/route.tsx`
  - Tambah page title `/admin/djiwa-app`.
  - Tambah path ke `MORE_MENU_PATHS`.
  - Tambah section/path array `DJIWA_APP_PATHS`.
  - Tambah submenu `Dashboard` dan `Pelanggan` pada mode expanded.
  - Tambah item icon link pada mode collapsed.
  - Hapus item `Pelanggan` dari blok `MARKETING` agar tidak duplikat.
- Create: `apps/admin/src/routes/admin/djiwa-app.tsx`
  - Route definition TanStack Router.
- Create: `apps/admin/src/routes/admin/djiwa-app.lazy.tsx`
  - Halaman Dashboard analitik.
- Create or modify: `apps/admin/src/hooks/use-customer-app-analytics.ts`
  - Query/fetch dan normalisasi KPI, tren, ranking produk, serta state loading/error.
  - Reuse client dan live/realtime pattern existing bila sesuai.
- Optional modify: existing shared chart component only if an existing chart primitive benar-benar dapat dipakai ulang; jangan menambah dependency baru.

### Database

- Prefer no migration pada V1 bila view existing sudah lengkap.
- Optional additive migration only if audit menemukan kolom/view belum expose field yang sudah dipakai customer page.
- Tidak ada DROP, rename, atau perubahan saldo/order historis.

### Route generation

- `apps/admin/src/routeTree.gen.ts` akan diregenerasi oleh build; jangan edit manual kecuali workflow repo memerlukannya.

---

## 7. Integration Points

### Dengan `apps/customer`

- Read-only analytics dari order/customer provenance.
- Tidak mengubah UI atau business logic customer checkout.
- Jangan memakai heuristic seperti menebak order customer berdasarkan nama jika `customerSourceId` atau `source` tersedia.

### Dengan `apps/pos`

- Order yang berasal dari Customer App tetap mengikuti lifecycle order canonical.
- Dashboard hanya menghitung status settled/valid sesuai aturan existing, misalnya `paid`/`completed`; status pending/cancelled tidak masuk spending settled.
- Jangan membuat status order baru.

### Dengan Finance/Djiwa Pay

- Saldo ditampilkan read-only.
- Tidak menambah notifikasi Telegram.
- Tidak membuat transaksi finance baru.
- Agregat wallet harus konsisten dengan view wallet dan tidak menghitung ledger pending sebagai saldo settled.

### AI/LLM dan Telegram

- Tidak diperlukan pada V1.
- Tidak membuat ringkasan AI atau notifikasi Telegram otomatis sebelum metrik dasar tervalidasi.
- Integrasi masa depan dapat memakai dashboard data contract yang sama.

---

## 8. Dependency Graph dan Wave Plan

### Level 1 — Audit independen

- Audit route/sidebar touchpoints di `route.tsx`.
- Audit schema/view dan provenance order.
- Audit hook/chart pattern existing.

### Level 2 — Implementasi berurutan

1. Buat data contract dan hook analytics.
2. Buat route Dashboard.
3. Integrasikan section sidebar dan pindahkan Pelanggan.
4. Tambahkan loading/error/empty states.

### Level 3 — Verifikasi

- Typecheck Admin.
- Build Admin.
- Verifikasi route tree dan lazy chunk.
- Query data live untuk membandingkan minimal KPI.
- QA responsive dan permission.

File `route.tsx` memakai tab indentation dan panjang; modifikasi multi-line wajib memakai Python `open()` secara targeted, bukan rewrite file penuh.

---

## 9. Acceptance Criteria

- [ ] Sidebar menampilkan section `DJIWA APP`.
- [ ] Submenu terlihat dengan label persis `Dashboard`.
- [ ] Klik `Dashboard` membuka `/admin/djiwa-app`.
- [ ] `Pelanggan` tetap membuka `/admin/customers` dan tidak muncul duplikat di Marketing.
- [ ] Dashboard memakai data live, bukan mock/dummy data.
- [ ] Order customer app dihitung berdasarkan canonical provenance dan deduplicated by order ID.
- [ ] Pending/cancelled order tidak masuk metrik settled spending.
- [ ] Saldo Djiwa Pay bersifat read-only.
- [ ] Loading, empty, error, dan partial-widget states tersedia.
- [ ] Mobile layout tidak overflow.
- [ ] Permission `analytics:view` dihormati.
- [ ] `git diff --check` lulus.
- [ ] `bun run check-types` atau equivalent lulus tanpa error baru.
- [ ] `bun run build` Admin lulus.
- [ ] Route live mengembalikan HTTP 200.
- [ ] Bundle lazy Dashboard memuat marker route dan tidak memakai mock data.
- [ ] Tidak ada file unrelated yang ikut di-commit.

---

## 10. Risiko dan Keputusan yang Perlu Disetujui

| Risiko | Mitigasi |
|---|---|
| Order app dihitung ganda karena `source` dan `orderChannel` overlap | Deduplicate dengan `_id` sebelum agregasi |
| View belum expose semua field yang sudah dipakai customer page | Audit schema dulu; migration additive bila perlu |
| Dashboard lambat karena mengambil ribuan order ke browser | Batasi periode/query; pertimbangkan view/RPC read-only setelah profiling |
| Pelanggan muncul dua kali di sidebar | Hapus hanya link Marketing; route existing tetap dipertahankan |
| Angka wallet tidak sama dengan finance | Gunakan satu sumber view wallet; read-only dan verifikasi query |
| PWA menyajikan bundle lama | Verifikasi `version.json`, hashed lazy chunk, dan hard refresh |

### Keputusan default yang saya rekomendasikan

- Section: `DJIWA APP`.
- Submenu pertama: `Dashboard`.
- Route: `/admin/djiwa-app`.
- `Pelanggan` dipindahkan dari `MARKETING` ke `DJIWA APP`.
- V1 memakai data existing; tidak menambah event tracking atau tabel baru kecuali audit membuktikan field wajib belum tersedia.

**Plan ini belum melakukan implementasi.**
