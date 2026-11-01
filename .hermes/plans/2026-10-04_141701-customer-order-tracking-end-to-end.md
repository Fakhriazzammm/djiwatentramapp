# Plan End-to-End — Live Order Tracking Terintegrasi Djiwa Tentram

**Status:** Draft untuk persetujuan, belum ada implementasi kode.
**Tanggal:** 2026-10-04
**Scope:** Customer/Djiwa App, Merchandise, POS/Kasir, Kitchen, Bar, Auth/API, Supabase, Djiwa Pay, Telegram, dan agent operasional.

## 1. Tujuan

Membuat sistem tracking order yang memungkinkan customer selalu mengetahui:

- order sudah dibayar atau masih menunggu pembayaran;
- order diterima, sedang dibuat, siap diambil/diantar, atau selesai;
- progres per item jika pesanan diproses oleh Kitchen dan Bar secara terpisah;
- estimasi waktu siap yang hanya ditampilkan jika berasal dari data authoritative;
- perubahan status secara realtime dengan polling fallback;
- detail, struk, pembayaran, bantuan staff, dan riwayat tanpa membuat order baru.

Sistem meniru fungsi UX pada screenshot referensi, bukan menyalin brand/warna aplikasi lain.

## 2. Hasil yang sudah ditemukan di codebase

Fitur yang sudah tersedia dan akan dipakai sebagai fondasi, bukan dibuat ulang:

- `apps/customer/src/hooks/use-customer-data.ts` sudah memuat order member melalui `GET /api/customer/orders`, order guest melalui `POST /api/customer/guest-orders`, dan sudah memakai `useSupabaseLiveValue` dengan realtime schema `pos`.
- `apps/auth-server/src/index.ts` memiliki endpoint order member dan guest. Endpoint guest memvalidasi format ID serta membatasi maksimal 20 order.
- `pos.order_status` sudah menyimpan status produksi per `order_no` dan `group_type` (`barista`/`kitchen`) dengan status `new`, `dibuat`, `selesai`.
- `public.pos_order_status` sudah mengekspos status produksi dan `completed_items`.
- `apps/pos/src/routes/admin/kitchen.lazy.tsx` dan `bar.lazy.tsx` sudah menjadi sumber operasi status item `pending → preparing → ready`.
- `apps/customer/src/routes/$username/riwayat.lazy.tsx` sudah menjadi permukaan riwayat order.
- `apps/ordermieyamin/src/routes/index.lazy.tsx` sudah memiliki pola UI tracking, `STATUS_STEPS`, ETA, progress bar, dan status delivery yang dapat dijadikan referensi reusable, tetapi status cafe tidak boleh dipaksa memakai status delivery Mie Yamin.
- `pos.orders.is_delivered` sudah ada untuk konteks order yang telah diantar; perlu dibedakan dari status produksi/siap.
- `useSupabaseLiveValue` sudah menyediakan shared realtime channel, reload, polling fallback, dan refresh saat dependency berubah.

### Perbedaan scope fitur baru

Yang direncanakan bukan sekadar memperbaiki halaman riwayat. Ini adalah read model tracking aktif lintas halaman dan lintas app, dengan satu kontrak status customer yang memetakan status pembayaran, produksi, pickup/dine-in, delivery, dan selesai. Halaman riwayat tetap hidup berdampingan sebagai arsip.

## 3. Rekomendasi arsitektur

### Pilihan yang dibandingkan

| Opsi | Kelebihan | Kekurangan/Risiko | Keputusan |
|---|---|---|---|
| Customer membaca `pos.orders` + `pos.order_status` langsung | Cepat, memanfaatkan data existing | Mapping status tersebar, risiko status parsial/PII, ETA tidak konsisten antar app | Jangan sebagai kontrak utama |
| Menambah polling frontend saja | Implementasi sederhana | Lambat, boros request, tidak menyelesaikan single source of truth | Hanya fallback |
| **Read model + endpoint customer terproteksi + Realtime/polling** | Kontrak status tunggal, aman untuk guest/member, mudah diintegrasikan ke semua storefront | Memerlukan migration, endpoint, dan backfill/compatibility | **Rekomendasi** |
| Mengandalkan Telegram sebagai sumber status | Memakai alur existing supervisor | Telegram bukan source of truth, event bisa terlambat/duplikat, sulit untuk customer | Jangan |

### Keputusan teknis

- `pos.orders` tetap authoritative untuk lifecycle order dan settlement.
- `pos.order_status` tetap authoritative untuk status produksi group Kitchen/Bar.
- Tambahkan read model/RPC customer-safe yang menggabungkan keduanya dan menghasilkan status customer canonical.
- Customer tidak boleh mengubah status order.
- ETA disimpan sebagai timestamp server (`estimated_ready_at`), bukan countdown yang ditebak frontend.
- Realtime memberi update cepat; polling bounded menjadi fallback ketika channel error/timeout.
- Semua app Customer dan Merchandise memakai shared package/component/mapper agar kontrak tidak drift.

## 4. Status contract canonical

### Status customer utama

```text
pending_payment       Menunggu pembayaran
payment_confirmed     Pembayaran terkonfirmasi
received               Pesanan diterima
preparing              Sedang dibuat
partially_ready       Sebagian pesanan siap
ready_for_pickup      Siap diambil
ready_for_table       Siap diantar ke meja
out_for_delivery      Sedang diantar
completed             Pesanan selesai
cancelled             Pesanan dibatalkan
payment_failed        Pembayaran gagal
```

### Aturan precedence

1. `cancelled`/`payment_failed` hanya dari kondisi server yang valid.
2. Order belum settled tidak boleh tampil sebagai sedang dibuat.
3. `paid`/`completed` pada order menandakan settlement, bukan otomatis kitchen selesai.
4. Jika semua group produksi selesai dan `order_type=pickup`, hasilnya `ready_for_pickup`.
5. Jika dine-in dan produksi selesai, hasilnya `ready_for_table` sampai delivered/served signal tersedia.
6. Jika delivery, `is_delivered=false` tidak boleh disebut selesai; gunakan `out_for_delivery` jika delivery event tersedia.
7. `completed` hanya ketika order lifecycle authoritative menyatakan selesai atau semua aturan completion terpenuhi.
8. Bila data Kitchen/Bar belum ada, tampilkan `Pesanan diterima`/`Sedang diproses`, bukan ETA palsu.

## 5. Database schema dan read model

### 5.1 Tabel existing yang dipakai

```text
pos.orders
  _id / source_id
  orderNumber / order_number
  status
  payment_method
  payment_receipt_kind
  customerSourceId / customer_source_id
  orderType / order_type
  tableNumber / table_number
  items jsonb
  is_delivered
  createdAt / created_at
  updatedAt / updated_at

pos.order_status
  order_no
  group_type: barista | kitchen
  status: new | dibuat | selesai
  items jsonb
  completed_items jsonb
  dibuat_at
  selesai_at
  updated_at
  dibuat_by / selesai_by

pos.financial_transactions
  order_source_id
  status
  type
  amount

public.pos_order_status
  safe read view untuk status produksi
```

### 5.2 Migration yang direncanakan

Nama migration final mengikuti timestamp saat implementasi, contoh:
`20261004000001_customer_order_tracking_read_model.sql`.

Tambahkan secara additive:

```text
pos.order_tracking_events
  id bigint/bigserial primary key
  order_source_id text not null
  order_no text not null
  event_type text not null
  from_status text null
  to_status text not null
  group_type text null
  actor_type text not null       -- system | cashier | kitchen | bar | telegram
  actor_id text null
  source_event_id text null
  metadata jsonb not null default '{}'
  occurred_at timestamptz not null default now()
  created_at timestamptz not null default now()
  unique(order_source_id, event_type, source_event_id)

pos.order_tracking_estimates
  order_source_id text primary key
  estimated_ready_at timestamptz null
  estimate_source text null     -- admin | operational_rule | system
  confidence text null           -- confirmed | provisional
  updated_by text null
  updated_at timestamptz not null default now()

pos.customer_order_tracking (VIEW atau SECURITY DEFINER RPC result)
  order_id
  order_number
  customer_source_id
  customer_scope_key
  order_status
  payment_status
  order_type
  table_number
  item_summary jsonb
  group_progress jsonb
  completed_item_count
  total_item_count
  estimated_ready_at
  eta_minutes
  is_terminal
  last_event_at
  created_at
  updated_at
```

Catatan: sebelum migration dipilih final, audit schema live untuk memastikan tipe ID dan nama kolom canonical. Tidak boleh mengasumsikan snake_case/camelCase pada tabel internal.

### 5.3 RPC / REST mapping

Kontrak yang direncanakan:

```text
GET  /api/customer/orders
     → order list milik authenticated customer, termasuk tracking summary

POST /api/customer/guest-orders
     body: { orderIds: string[] }
     → guest-safe tracking untuk order reference yang dimiliki browser

GET  /api/customer/orders/:orderId/tracking
     → detail tracking satu order, setelah ownership check

POST /api/customer/orders/:orderId/support
     → opsional fase berikutnya; membuat customer-service ticket, bukan mengubah status

RPC pos.get_customer_order_tracking(order_id, customer_id)
     → dipanggil backend dengan ownership enforcement

RPC pos.get_guest_order_tracking(order_ids)
     → hanya mengembalikan field customer-safe dan order reference valid
```

REST response standard:

```json
{
  "success": true,
  "order": {
    "id": "[ORDER_ID]",
    "orderNumber": "[DISPLAY_NUMBER]",
    "status": "preparing",
    "statusLabel": "Sedang dibuat",
    "estimatedReadyAt": null,
    "etaMinutes": null,
    "progress": { "completed": 2, "total": 4 },
    "groups": []
  }
}
```

Jangan mengembalikan `service_role`, internal Telegram IDs, private staff data, full finance rows, atau hidden customer PII.

### 5.4 RLS dan security

- Member: filter berdasarkan session customer `source_id`.
- Guest: hanya IDs yang berasal dari guest-order reference dan tetap validasi ownership/secret contract di backend; jangan memperluas public view menjadi `SELECT *` tanpa batas.
- Admin/POS: akses penuh tetap melalui role/permission existing.
- Event insert hanya dari server/RPC/operational writer, bukan browser customer.
- Tambahkan index pada `(order_source_id, occurred_at desc)`, `(customer_source_id, updated_at desc)`, dan `(order_no, group_type)` bila belum tersedia.
- Semua RPC harus idempotent dan tidak membuat event duplikat saat retry.

## 6. Data flow end-to-end

```text
Customer checkout
  → pos.orders pending/paid
  → wallet/QRIS/cash settlement boundary
  → order tracking event: payment_confirmed / received

POS cashier/admin
  → order visible in /admin/orders
  → assignment to Kitchen/Bar
  → pos.order_status group rows

Kitchen / Bar
  → item status pending → preparing → ready
  → completed_items / group status updated
  → tracking event emitted once

Read model/RPC
  → joins order lifecycle + payment + production groups + delivery flag + ETA
  → derives canonical customer status

Customer + Merchandise
  → LiveOrderStatusCard on home/menu/order shell
  → Tracking detail page/sheet
  → Realtime reload, polling fallback
  → terminal status moves to history

Telegram supervisor / yumi-ai-bot
  → receives operational notification only
  → may write operational status through existing guarded flow
  → does not become customer read authority

Finance / Inventory
  → remain downstream of settlement/completion rules
  → tracking must never trigger duplicate finance, wallet debit, or stock deduction
```

## 7. UI/UX specification

### 7.1 Shared surfaces

Buat shared components, idealnya di package customer shared yang sudah dipakai storefront:

- `CustomerLiveOrderCard`
- `CustomerOrderStatusTimeline`
- `CustomerOrderProgressBar`
- `CustomerOrderTrackingSheet` atau route detail
- `useCustomerActiveOrders`
- `order-tracking-contract.ts`

### 7.2 Live Order Card

Lokasi:

- Customer/Djiwa App Home: di atas bottom nav, setelah hero/discovery dan sebelum section panjang.
- Customer Menu/Order: compact sticky/inline card, tidak menutupi cart atau checkout CTA.
- Merchandise: card yang sama dengan label channel merchandise.
- Jangan memaksa card pada public landing tanpa username/order context.

Isi:

```text
Djiwa Tentram Cafe & Resto · #1074
Sedang dibuat
Siap dalam sekitar 8 menit              Detail
[progress bar]
```

Rules:

- Satu card untuk satu order aktif; jika banyak, horizontal stack/carousel bounded.
- `Detail` membuka tracking detail, bukan membuat order baru.
- ETA hanya tampil bila `estimated_ready_at` valid dan belum lewat.
- Countdown menggunakan `estimated_ready_at - server/client clock`, refresh tiap menit, tidak mengubah server state.
- Jika ETA expired, tampilkan `Sedang diproses` atau `Menunggu konfirmasi staff`, bukan angka negatif.
- Jika status terminal, card menampilkan `Pesanan selesai` sebentar lalu berpindah ke riwayat sesuai TTL yang disepakati.

### 7.3 Timeline detail

```text
✓ Pembayaran terkonfirmasi
✓ Pesanan diterima
● Sedang dibuat
○ Siap diambil / Siap diantar ke meja
○ Selesai
```

Untuk multi-group:

```text
Kitchen: 2/3 siap
Bar: selesai
```

Actions:

- `Lihat struk`
- `Pesan lagi` hanya dari history/receipt, tidak pada order aktif yang belum terminal
- `Bantuan staff`
- `Bayar sekarang` hanya untuk pending payment dan memakai invoice/order yang sama

### 7.4 UI states

- Loading: skeleton card/timeline, tanpa flash “Selesai”.
- Empty: tidak ada order aktif; CTA `Mulai pesan`.
- Error: `Status belum dapat diperbarui`; tombol `Coba lagi`; cache terakhir diberi label `Pembaruan terakhir ...` bila aman.
- Realtime disconnected: badge kecil `Memperbarui otomatis` berubah menjadi `Pembaruan berkala`.
- Payment pending: warna amber, CTA invoice existing.
- Preparing: azure/violet/cyan customer palette; hindari gold/orange.
- Ready: emerald/cyan dengan accessibility contrast.
- Cancelled/failed: red hanya untuk error, sertakan bantuan/refund explanation.
- Reduced motion: Framer Motion hanya fade/slide ringan; hormati `prefers-reduced-motion`.

### 7.5 Bottom navigation

- Tambahkan badge/order indicator pada `Pesanan` bila ada active order.
- Jangan menambah item nav baru jika sudah ada `Pesanan`.
- Bottom nav tidak boleh menutup card, sheet, cart, checkout, atau receipt; gunakan safe-area dan z-index audit.

## 8. Integrasi per aplikasi

### Customer / Djiwa App

- Perluas `useCustomerOrders` menjadi active tracking projection.
- Integrasikan Home, Menu, Order/Receipt, dan Riwayat.
- Tambahkan route detail under `/$username`, misalnya `/$username/pesanan/$orderId` atau sheet jika route tree lebih aman.
- Guest order tetap mendukung tracking dengan reference yang valid.

### Merchandise

- Reuse contract/component; jangan clone business logic.
- Tampilkan hanya order merchandise yang relevan.
- Jika merchandise memakai delivery lifecycle, map ke delivery status; jangan menampilkan status kitchen/bar cafe.
- Cross-domain handoff ke Customer tetap mempertahankan username member, guest diarahkan ke destination `/daftar` sesuai pola existing.

### POS / Admin

- `/admin/orders`: tampilkan kolom/status tracking canonical dan ETA; action staff harus memanggil existing write actions/RPC.
- `/admin/kitchen` dan `/admin/bar`: setiap perubahan item/group meng-emits tracking event idempotently.
- Tambahkan kontrol ETA hanya pada role/permission yang disetujui; audit perubahan ETA.
- Dashboard operasional dapat menampilkan `terlambat dari ETA`, tanpa mengubah status customer otomatis.

### Auth/API server

- Perluas `GET /api/customer/orders` dan guest endpoint dengan tracking summary.
- Tambahkan endpoint detail tracking dengan ownership check.
- Jangan expose database row mentah.
- Tambahkan rate limit dan payload limits khusus guest tracking.

### Supabase / Edge Functions

- Migration additive, RPC security definer hanya dengan `search_path` aman.
- Jika endpoint server membutuhkan service role, secret hanya di environment/container secret.
- Edge Function boleh dipakai untuk reconciliation/event normalization, bukan untuk mengarang ETA.

## 9. Djiwa Pay dan pembayaran

- Pending payment tidak boleh tampil `Pembayaran diterima`.
- Settlement wallet tetap melalui boundary existing: hold → settle RPC → order paid → finance → notification.
- Tracking event `payment_confirmed` dibuat setelah server settlement, bukan setelah client menerima response optimistis.
- Retry settlement harus tidak menggandakan debit, finance row, notification, atau tracking event.
- QRIS/cash/wallet memakai label canonical existing; tracking hanya membaca payment projection.
- Refund/release/failed hold harus menghasilkan status yang customer mengerti dan tidak meninggalkan order menggantung tanpa recovery.

## 10. Telegram dan agent

### Telegram supervisor / yumi-ai-bot

- Pertahankan notifikasi operasional canonical dan anti-loop.
- Bot boleh memicu perubahan `pos.order_status` melalui flow existing.
- Tambahkan event tracking hanya sekali per transition (`source_event_id` + unique constraint).
- Jangan replay backlog lama menjadi notifikasi customer.
- Verifikasi message ID/log hanya untuk operasional; customer UI membaca database projection.

### Yumi AI / Jev recommendation

- Tidak diperlukan untuk menentukan status order atau ETA.
- AI tidak boleh menjadi authority pembayaran, completion, atau durasi kitchen.
- Fase jangka panjang: AI hanya boleh memberi insight internal seperti prediksi kapasitas/risiko keterlambatan, dengan confidence, audit log, dan fallback deterministic. Insight tidak langsung ditampilkan sebagai janji ETA tanpa approval/rule.

### Purchasing agent / inventory

- Tracking tidak memicu pembelian.
- Namun event `completed` tetap mempertahankan chain order → inventory deduction → finance/HPP.
- Fase lanjutan dapat memakai agregat order production time untuk forecasting purchasing, tetapi dipisahkan dari customer status.

## 11. Hardcode audit

Nilai berikut tidak boleh di-hardcode sebagai keputusan bisnis:

- durasi preparation/ETA;
- SLA per kategori/produk/shift;
- jam operasional/cutoff;
- status labels jika admin membutuhkan perubahan bahasa;
- channel/order type mapping;
- warna/status semantik yang mempengaruhi accessibility policy;
- batas jumlah active orders dan TTL card;
- permission untuk mengedit ETA;
- aturan kapan order dianggap completed.

Boleh hardcode:

- fallback copy aman;
- enum contract yang tervalidasi server;
- ikon presentasi;
- default polling minimum sebagai safety limit, bukan SLA bisnis.

Sumber konfigurasi yang direncanakan:

```text
pos_site_settings / settings admin
pos_order_tracking_policies
pos_products / categories untuk policy preparation
pos.shifts untuk kapasitas/shift context
```

Semua unresolved/missing record harus menghasilkan placeholder aman (`ETA belum tersedia`), bukan angka fiktif.

### 11.1 Konfirmasi aturan no-hardcode dan realtime

Plan ini **tidak mengizinkan hardcode nilai bisnis**. Saat implementasi:

- Semua status aktual, ETA, SLA, policy, order-type mapping, completion rule, active-order limit, TTL, permission, dan konfigurasi channel harus dibaca dari database/RPC/settings server.
- Customer dan Merchandise hanya menerima read model customer-safe; frontend tidak boleh menghitung atau mengarang status bisnis.
- `Supabase Realtime` adalah jalur update utama. Polling hanya fallback teknis ketika channel realtime error/timeout, bukan sumber data kedua dan bukan pengganti database.
- Enum status di TypeScript/SQL hanya kontrak validasi/transport, bukan nilai status yang diputuskan frontend.
- Label yang dapat dikonfigurasi harus berasal dari settings server; fallback UI seperti `ETA belum tersedia`, skeleton, ikon, dan batas minimum polling adalah fallback presentasi/keamanan teknis.
- Jika record policy/ETA tidak tersedia, hasil wajib `null`/placeholder aman. Sistem dilarang menampilkan angka estimasi buatan frontend.
- Acceptance test wajib membuktikan perubahan dari POS/DB masuk ke Customer melalui Realtime, lalu membuktikan polling fallback hanya bekerja saat Realtime terputus.

## 12. Tahapan implementasi

### Wave 0 — Discovery dan contract freeze

1. Audit schema live, kolom order canonical, status writes, RLS, realtime publication.
2. Trace semua caller `GET /api/customer/orders`, guest endpoint, `pos_order_status`, dan status mutation.
3. Sepakati enum status, order-type mapping, completion precedence, dan ETA source.
4. Buat fixture matrix untuk member, guest, cash, QRIS, wallet, dine-in, pickup, delivery, split Kitchen/Bar.

### Wave 1 — Backend/read model

1. Tambah migration additive: event table, estimate table/policy bila diperlukan, indexes, RPC/view.
2. Tambah idempotent event writer pada settlement dan Kitchen/Bar status transitions.
3. Tambah customer-safe response mapper pada auth-server/API.
4. Tambah ownership/RLS/security tests.
5. Backfill hanya status current yang dapat diverifikasi; jangan merekonstruksi histori yang tidak memiliki event evidence.

### Wave 2 — Shared frontend contract

1. Buat types/status mapper dan ETA formatter di shared package.
2. Tambah hook active order/tracking detail yang memakai realtime + polling fallback.
3. Tambah shared loading/empty/error/realtime indicator.
4. Unit test precedence dan countdown boundary.

### Wave 3 — Customer/Djiwa App

1. Tambah `CustomerLiveOrderCard` pada Home dan Menu dengan overlay audit.
2. Tambah detail tracking route/sheet.
3. Integrasikan receipt/payment pending/status refresh.
4. Integrasikan badge bottom nav dan history handoff.
5. QA guest/member di mobile narrow viewport.

### Wave 4 — Merchandise

1. Reuse component/contract.
2. Map hanya lifecycle merchandise yang sah.
3. Uji cross-domain member/guest handoff.
4. Pastikan storefront tidak menampilkan Kitchen/Bar status cafe.

### Wave 5 — POS/Admin/operational

1. Tambahkan status/ETA readout di `/admin/orders`.
2. Audit Kitchen/Bar action agar menghasilkan event idempotent.
3. Tambahkan role-protected ETA editor dan audit trail jika disetujui.
4. Tambahkan operational late queue dan filter tanpa memodifikasi status otomatis.

### Wave 6 — Notifications dan rollout

1. Tambah push/in-app notification hanya untuk transition penting dengan dedupe.
2. Telegram tetap operational-only dan anti-loop.
3. Feature flag per app/brand/channel.
4. Canary internal, kemudian 5%/25%/100% sesuai hasil monitoring.
5. Hapus flag hanya setelah rollback path dan metrics stabil.

## 13. Testing dan acceptance criteria

### Unit/contract

- Status precedence semua kombinasi payment/production/delivery.
- `etaMinutes`: null, zero, expired, clock skew, timezone WIB.
- Guest ownership/order ID validation.
- Idempotent event retry.
- Wallet settlement tidak duplicate debit/finance/notification/event.

### Integration

- Checkout cash → order received → kitchen/bar → ready → completed.
- QRIS pending/paid/failure.
- Djiwa Pay hold/settle/release/failure.
- Dine-in, pickup, delivery.
- Split group Kitchen+Bar dan partial ready.
- POS update terlihat di Customer tanpa refresh manual.
- Realtime disconnect lalu polling fallback.
- Guest browser dan authenticated member.

### UI/E2E

- Home/Menu/Order/Receipt/History tidak tertutup bottom nav.
- Card membuka detail order yang sama.
- Tidak membuat order baru saat menekan Detail/Bayar ulang.
- Skeleton/error/empty/terminal states benar.
- Reduced motion dan keyboard/accessibility.
- Customer dan Merchandise memakai kontrak sama namun filter channel benar.

### Release gates

- `git diff --check` bersih.
- Typecheck/build Customer, Merchandise, POS, Auth server.
- Migration dry-run + verify schema/RLS/index.
- Deploy hanya Edge Function yang berubah.
- Verifikasi production `version.json` setiap app.
- Fetch hashed bundle live dan cari marker tracking.
- Browser verification di mobile viewport; console zero new errors.
- Query hasil live: order/status/event count konsisten, no duplicate transition.
- Rollback migration tidak menghapus historical order/event; feature flag dapat mematikan UI tanpa menghilangkan data.

## 14. Observability dan metrics

Pantau:

- `tracking_read_success_rate`;
- realtime connected/error/fallback rate;
- stale tracking age;
- order dengan payment settled tetapi tanpa production mapping;
- order melewati ETA;
- duplicate event conflict count;
- customer membuka detail/status refresh;
- notification delivery/dedupe;
- wallet/order/finance reconciliation anomalies.

Tidak boleh memakai customer PII dalam log. Gunakan order ID internal yang sudah direduksi atau display number yang aman.

## 15. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| `pos.orders.status=completed` disalahartikan sebagai kitchen selesai | Canonical precedence memisahkan settlement dan production |
| Guest endpoint membocorkan order | Ownership/reference contract, field allowlist, rate limit |
| Realtime event berisik karena shared channel | Filter/reload debounce, polling fallback, channel reuse |
| Telegram replay/duplikat | Unique source event + dedupe key + tidak menjadikan Telegram source read |
| ETA palsu merusak kepercayaan | Hanya server timestamp authoritative; tampilkan unavailable bila tidak ada |
| Wallet debit tanpa tracking/finance | Reuse settlement RPC dan invariant wallet |
| Customer/merchandise status drift | Shared package contract dan fixture suite lintas app |
| Migration mengganggu order historis | Additive only, backfill evidence-based, no DROP/RENAME |
| PWA cache menampilkan UI lama | Version bump, live bundle verification, hard refresh/incognito QA |

## 16. Open questions sebelum implementasi

1. Apakah MVP tracking hanya untuk order Cafe dine-in/pickup, atau langsung termasuk delivery dan Merchandise?
2. Siapa role yang berwenang menetapkan `estimated_ready_at`: kasir, supervisor, atau rule system?
3. Apakah status `Selesai` berarti semua item siap, order sudah diambil/diantar, atau settlement lifecycle selesai?
4. Apakah customer ingin melihat progress per item atau cukup progress group Kitchen/Bar pada MVP?
5. Apakah notifikasi push customer akan diaktifkan pada wave pertama atau setelah tracking UI stabil?
6. Route detail dipilih sebagai page (`/$username/pesanan/$orderId`) atau bottom sheet agar tidak mengganggu route tree existing?
7. Apakah order Merchandise memakai tabel/order lifecycle yang sama pada production saat ini?

## 17. Definition of Done

Fitur dianggap selesai hanya bila:

- customer member dan guest bisa melihat status order aktif yang benar;
- status POS Kitchen/Bar terpantul ke customer secara realtime/fallback;
- ETA tidak pernah dibuat-buat oleh frontend;
- payment, wallet, finance, inventory, Telegram, dan history tidak mengalami duplicate side effect;
- Customer dan Merchandise memakai kontrak data yang sama dengan filter domain yang benar;
- Admin/POS dapat melihat sumber status dan keterlambatan tanpa mengambil alih customer state;
- seluruh build, migration, security, E2E, live version, bundle, dan query verification lulus;
- feature flag dan rollback tersedia.
