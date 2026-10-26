# Admin Dashboard — Analisa Transaksi per Jam Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Menambahkan widget analisa transaksi per jam pada dashboard utama Admin Djiwa Tentram agar jam ramai dan sepi terlihat jelas, compact, responsif, simetris, dan tidak mengubah data/statistik/chart yang sudah ada.

**Architecture:** Tambahkan data derivation/query terisolasi untuk bucket transaksi per jam berbasis WIB, lalu render sebagai widget sibling baru di `OperationalDecisionDashboard`. Widget tidak menggantikan atau memodifikasi `PeriodTile`, grafik Pendapatan 7 hari, payment mix, status order, produk terlaris, aktivitas, keuangan, stok, atau action center.

**Tech Stack:** React + TypeScript, TanStack Router, Tailwind, Recharts yang sudah dipakai Admin, Supabase `pos_orders`, existing hybrid data/cache hooks, timezone WIB.

**Scope:** Admin dashboard `/` dan `/admin/` yang sudah memakai `OperationalDecisionDashboard`.

**Out of scope:** Perubahan schema transaksi, perubahan status order/payment, perubahan chart existing, staffing automation, forecast AI, Telegram notification, dan perubahan aplikasi POS/customer.

---

## 1. Current Context

Hasil audit source saat plan dibuat:

- Dashboard utama: `apps/admin/src/routes/admin/-OperationalDecisionDashboard.tsx`.
- Dashboard memakai `useHybridDashboardStats()`, `useHybridOrders()`, dan `useHybridShiftStatus()`.
- Revenue existing menghitung transaksi settled dengan status `paid` atau `completed`.
- `pos_orders.createdAt` berupa epoch milliseconds.
- Utility WIB sudah tersedia melalui `apps/admin/src/lib/wib-utils.ts`.
- Grafik existing `Pendapatan 7 hari` memakai `stats.revenueLast7Days` dan tidak boleh diubah.
- `useHybridOrders()` saat ini mengambil `pos_orders` terurut terbaru tanpa batas tanggal default. Untuk analisa jam, jangan bergantung pada seluruh histori yang dikirim ke browser jika volume sudah besar; buat query/range bounded atau gunakan data yang sudah tersedia hanya jika range dan denominator dapat dibuktikan aman.

Screenshot user dipakai sebagai referensi hierarchy, bukan sebagai pengganti verifikasi source. Target visual: satu widget analitik yang compact, tidak menambah deretan kartu besar, dan tidak menyebabkan section lain bergeser/overflow.

---

## 2. Product Behavior

### 2.1 Widget title

```text
Analisa jam operasional
Ketahui jam ramai dan jam sepi berdasarkan transaksi settled · WIB
```

### 2.2 Period selector

Gunakan segmented control compact:

- `Hari ini`
- `7 hari` — default
- `30 hari`

Default `7 hari` karena lebih stabil daripada satu hari, tetapi tetap relevan untuk operasional.

### 2.3 Metric selector

Gunakan toggle kecil, bukan dua chart terpisah:

- `Order`
- `Revenue`

Definisi:

- `Order`: jumlah transaksi dengan status `paid` atau `completed` per jam WIB.
- `Revenue`: jumlah `totalAmount` dari transaksi dengan status `paid` atau `completed` per jam WIB.

### 2.4 Summary insight

Widget menampilkan maksimum tiga insight compact:

```text
Jam tersibuk   12.00–13.00 · 18 order · Rp1.250.000
Jam tersepi    15.00–16.00 · 2 order · Rp85.000
Periode ramai  11.00–14.00
```

Jika data hanya satu hari, gunakan copy yang jujur:

```text
Tertinggi hari ini
```

Jangan menyebut pola kebiasaan mingguan/bulanan jika denominator belum mencukupi.

### 2.5 Operational note

Boleh tampil satu kalimat rekomendasi berbasis data, misalnya:

```text
Pertimbangkan persiapan bahan sebelum 11.00 berdasarkan pola 7 hari terakhir.
```

Label harus berupa indikasi, bukan instruksi otomatis. Jangan mengubah shift/staffing/stok secara otomatis.

---

## 3. Database Schema & Data Mapping

Tidak membuat tabel baru untuk MVP.

```text
Supabase schema: pos
  pos.orders / public API view: pos_orders
    _id          → identifier transaksi
    createdAt    → epoch milliseconds; konversi ke WIB
    status       → paid | completed | pending | cancelled | ...
    totalAmount  → nominal revenue net transaksi
```

REST/view mapping:

```text
GET /rest/v1/pos_orders
  ?select=_id,createdAt,status,totalAmount
  &createdAt=gte.<range_start_ms>
  &createdAt=lt.<range_end_ms>
  &order=createdAt.asc
```

Implementasi harus memakai existing `createClient()`/hybrid hook, bukan hardcode URL/key. Jangan membaca atau mengekspos credential di source/browser.

Filter business:

```ts
const settledStatuses = new Set(["paid", "completed"]);
```

Konversi WIB harus menggunakan utility existing atau helper teruji; jangan memakai timezone browser/server secara implicit.

### 3.1 Query strategy

Pilihan MVP yang direkomendasikan:

1. Tambahkan fetch bounded 30 hari hanya untuk field analitik, atau extend hook existing dengan opsi `rangeStart/rangeEnd` tanpa mengubah perilaku caller lama.
2. Cache key harus memasukkan period/range agar data `Hari ini`, `7 hari`, dan `30 hari` tidak tertukar.
3. Refresh mengikuti `triggerHybridRefresh()` yang sudah digunakan dashboard.
4. Jika ukuran response atau latency terbukti tinggi, tahap berikutnya adalah view/RPC agregasi per jam; bukan menaikkan limit browser tanpa batas.

Tidak ada migration database pada fase MVP kecuali profiling membuktikan query bounded masih terlalu berat.

---

## 4. Multi-Source Data Flow & Integration

```text
pos_orders
   │
   ├─ createdAt epoch ms
   ├─ status paid/completed
   └─ totalAmount
        │
        ▼
Hourly analytics selector/hook
        │
        ├─ convert timestamp to WIB
        ├─ group by hour 0..23
        ├─ compute order count
        ├─ compute revenue
        ├─ compute peak/quiet range
        └─ expose loading/empty/error state
        │
        ▼
OperationalDecisionDashboard
        │
        └─ Analisa jam operasional widget
```

Cross-app boundaries:

- `apps/admin`: hanya membaca data transaksi existing untuk visualisasi.
- `apps/pos`: tidak diubah; status/order write path tetap menjadi source of truth.
- `apps/customer`: tidak diubah.
- `apps/karyawan`: tidak diubah; widget tidak membuat kesimpulan staffing otomatis.
- Pengaturan admin: tidak diubah pada MVP; jam operasional hanya ditampilkan dari transaksi aktual. Jika nanti perlu opening hours, ambil dari konfigurasi DB yang sudah ada, bukan hardcode.
- Telegram/AI/purchasing: tidak diubah dan tidak dipanggil untuk kalkulasi MVP.

---

## 5. UI/UX Specification

### 5.1 Placement

Tambahkan sebagai section baru setelah blok `Pendapatan 7 hari` + metric summary, sebelum section `Metode pembayaran / Order & sesi kasir`.

Alasan:

- User melihat tren antar-hari lebih dahulu.
- Kemudian dapat drill-down ke pola jam.
- Payment/status/stock cards tetap berada di hierarchy lama.

Jangan memindahkan atau mengganti JSX section existing; tambahkan sibling section dengan grid yang kompatibel.

### 5.2 Desktop layout

Target:

```text
┌──────────────────────────────────────────────────────────┐
│ Analisa jam operasional     [Hari ini] [7 hari] [30 hari]│
│                             [Order] [Revenue]            │
│                                                          │
│  Jam tersibuk / tersepi        Bar chart 24 jam          │
│  Insight compact               tanpa overflow            │
└──────────────────────────────────────────────────────────┘
```

- Satu card full-width di bawah hero/chart block.
- `rounded-[20px]`, border/shadow existing dashboard.
- Padding desktop `p-4`, gap internal `gap-3`.
- Chart height target sekitar `150–180px`, tidak mengambil alih viewport.
- X-axis boleh menampilkan label tiap 2–3 jam agar tidak padat.
- Tooltip menampilkan jam, order, revenue.

### 5.3 Mobile layout

- Card satu kolom, full width.
- Header boleh wrap secara terkontrol: judul di baris pertama, selector di baris kedua jika lebar tidak cukup.
- Selector `overflow-x-auto` hanya jika diperlukan; tidak boleh mendorong seluruh halaman melebar.
- Chart tetap menggunakan container width `100%`, min-height sekitar `145px`.
- Label jam dipangkas ke interval yang terbaca, bukan memaksa 24 label.
- Summary insight menjadi grid 2 kolom atau row yang dapat wrap simetris.
- Tidak ada absolute/fixed element baru.
- Tambahkan bottom spacing hanya jika komponen existing membutuhkan; widget tidak boleh tertutup bottom nav.
- Touch target selector minimal 40–44px.

### 5.4 Visual consistency

- Ikuti palette dashboard existing: white surface, navy text, blue accent, semantic green/red/orange hanya untuk status.
- Jangan menambah warna chart baru yang bertabrakan dengan chart Pendapatan 7 hari.
- Gunakan satu warna utama untuk order/revenue dan semantic highlight hanya pada peak/quiet.
- Jangan menambah gradient/dekorasi/animasi berat.
- Gunakan `tabular-nums` untuk angka.
- Hindari card bertingkat berlebihan: widget utama satu card, insight hanya sub-surface ringan.

### 5.5 Required states

- Loading: skeleton card dengan tinggi sama seperti widget final.
- Empty: `Belum ada transaksi settled pada periode ini.`
- Error: pesan inline + tombol retry; chart existing tetap tampil.
- Success: chart + summary.
- Sparse data: tampilkan data dengan label `Sampel terbatas`, tanpa menyimpulkan pola permanen.
- Refresh: gunakan mekanisme refresh existing; jangan membuat polling baru.

---

## 6. Analytics Contract

Output internal yang direncanakan:

```ts
type HourlySalesPoint = {
  hour: number;          // 0..23, WIB
  label: string;         // 00.00, 01.00, ...
  orderCount: number;
  revenue: number;
};

type HourlySalesInsight = {
  points: HourlySalesPoint[];
  peakHour: HourlySalesPoint | null;
  quietHour: HourlySalesPoint | null;
  peakRange: { startHour: number; endHour: number } | null;
  sampleDays: number;
  totalSettledOrders: number;
  totalSettledRevenue: number;
  isSparse: boolean;
};
```

Rules:

- Selalu menghasilkan bucket `0..23` agar chart stabil.
- Jam tanpa transaksi bernilai nol.
- Peak/quiet tidak dihitung dari jam kosong jika masih ada jam bertransaksi.
- Jika semua jam nol, peak/quiet = `null`.
- `sampleDays` dihitung dari tanggal WIB yang memiliki data dalam range.
- `isSparse` ditentukan dari jumlah hari/order yang tersedia dan hanya memengaruhi copy, bukan menghapus chart.
- `peakRange` hanya menggabungkan jam berurutan jika threshold dan sample memadai; jika tidak, tampilkan peak hour saja.

Rekonsiliasi wajib:

```text
sum hourly orderCount == total settled orders
sum hourly revenue == total settled revenue
```

Dengan toleransi hanya untuk pembulatan tampilan currency, bukan untuk data mentah.

---

## 7. No-Hardcode Audit

Nilai yang boleh hardcode sebagai aturan UI/algoritma:

- Bucket jam `0..23`.
- Label status settled `paid`, `completed`.
- Zona waktu bisnis `Asia/Jakarta`.
- Batas tampilan chart dan threshold visual.

Nilai yang tidak boleh hardcode:

- Revenue.
- Jumlah order.
- Jam buka/tutup cafe jika ingin digunakan dalam insight.
- Target ramai/sepi bisnis.
- Jumlah staff yang disarankan.
- Threshold operasional yang seharusnya dikontrol admin.

Jika nanti user ingin definisi `jam ramai` yang configurable, buat setting admin terpisah dan jangan menyisipkannya diam-diam di widget MVP.

---

## 8. Implementation Tasks

### Task 1: Freeze existing dashboard behavior

**Files:**
- Inspect: `apps/admin/src/routes/admin/-OperationalDecisionDashboard.tsx`
- Inspect: `apps/admin/src/hooks/use-hybrid-pos-data.ts`

**Steps:**
1. Capture current `git diff --name-only HEAD` and identify session-owned files.
2. Record existing section order and current chart/stat output shape.
3. Add no code changes yet.

**Verification:** Existing dashboard source remains unchanged after baseline.

### Task 2: Add pure hourly aggregation helper

**Files:**
- Create or modify a focused analytics helper near existing dashboard utilities, preferably `apps/admin/src/lib/hourly-sales-analysis.ts`.
- Test: focused unit test location matching existing Admin test conventions.

**Steps:**
1. Define `HourlySalesPoint` and `HourlySalesInsight`.
2. Convert epoch milliseconds to WIB hour/date.
3. Filter only `paid/completed`.
4. Return stable 24-hour buckets.
5. Add tests for timezone boundary, cancelled/pending exclusion, zero-hour buckets, peak/quiet, and reconciliation.

**Verification:** Unit tests pass and sums reconcile.

### Task 3: Add bounded data access

**Files:**
- Modify: `apps/admin/src/hooks/use-hybrid-pos-data.ts` only if existing hook cannot provide bounded order data safely.
- Prefer a new focused hook/helper rather than changing default `useHybridOrders()` behavior.

**Steps:**
1. Add period-to-WIB-range mapping for today/7d/30d.
2. Query only `_id,createdAt,status,totalAmount` when possible.
3. Include period in cache key.
4. Preserve existing caller behavior and refresh tables.
5. Expose loading/error/data without changing `useHybridDashboardStats()` output.

**Verification:** Existing dashboard stats and chart snapshots/behavior remain unchanged; bounded query is confirmed in source.

### Task 4: Render isolated compact widget

**Files:**
- Modify: `apps/admin/src/routes/admin/-OperationalDecisionDashboard.tsx`
- Reuse: existing `Tooltip`, `formatCurrencyIDR`, `Skeleton`, and dashboard card classes.

**Steps:**
1. Add a local `HourlySalesWidget` or focused component.
2. Add period and metric state local to the widget.
3. Render the widget as a sibling section without editing existing chart data.
4. Add responsive grid/selector/chart sizing.
5. Add loading, empty, error, sparse, and success states.

**Verification:** TypeScript/JSX build passes; no existing chart/stat field is renamed or recalculated.

### Task 5: Validate dashboard reconciliation

**Files:**
- Test/helper output only; no production data mutation.

**Steps:**
1. Run helper tests against representative fixture data.
2. Verify hourly revenue equals settled revenue for the same period.
3. Verify hourly order count equals settled order count.
4. Verify WIB boundary around midnight.
5. Verify refresh updates only the new widget data and preserves existing cards.

**Verification:** All assertions pass.

### Task 6: Responsive visual QA

**Files:**
- Build artifact only; no source changes unless QA finds a defect.

**Steps:**
1. Build Admin only.
2. Render/inspect dashboard at mobile width around 390–430px and desktop width.
3. Confirm no horizontal overflow, clipped labels, asymmetric cards, or chart overlap.
4. Confirm existing Pendapatan 7 hari, payment, order status, stock, and activity blocks remain visible and unchanged.
5. If browser rendering is unavailable, request a screenshot rather than claiming visual success.

**Verification:** Screenshot/DOM inspection plus build output.

### Task 7: Release and production verification

**Files:**
- Only changed Admin source/helper/test files.
- Generated Admin version metadata may be committed separately after code commit.

**Steps:**
1. Run Admin build only.
2. Inspect `git diff --name-only HEAD`.
3. Stage explicit session-owned files; never `git add -A`/`.`.
4. Commit source.
5. Push GitHub and verify local/remote SHA equality.
6. Deploy Admin to `/var/www/admindjiwatram.djiwatentram.web.id/` with runtime asset exclusions.
7. Verify `index.html`, `version.json`, entry bundle, and hourly widget marker parity.
8. Verify production with browser when DNS is available; do not claim live visual verification from local webroot alone.

---

## 9. Dependency Graph

```text
Level 1 — independent/read-only
  ├─ Task 1: baseline dashboard behavior
  └─ Task 2: pure hourly aggregation + tests

Level 2 — sequential data integration
  └─ Task 3: bounded hook/query

Level 3 — same-file UI integration
  └─ Task 4: widget in OperationalDecisionDashboard

Level 4 — verification
  ├─ Task 5: reconciliation
  └─ Task 6: responsive visual QA

Level 5 — release
  └─ Task 7: build, selective commit, push, deploy, verify
```

Tasks modifying `OperationalDecisionDashboard.tsx` or `use-hybrid-pos-data.ts` must remain sequential. Pure helper tests may be prepared independently but must be reconciled before UI integration.

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Query all historical orders | Slow dashboard / memory pressure | Bounded 30-day query and minimal fields |
| Browser/server timezone mismatch | Peak hour shifted | Explicit Asia/Jakarta conversion and boundary tests |
| Pending/cancelled inflates traffic | False busy-hour insight | Settled-only revenue/order contract |
| One abnormal day looks like a pattern | Bad staffing decision | `sampleDays`, sparse label, period selector |
| Widget changes existing layout | Regression in dashboard hierarchy | Add sibling section only; preserve existing JSX/data |
| 24 labels overflow mobile | Unreadable chart | Label interval reduction and responsive chart width |
| Tall widget pushes critical alerts below fold | Poor scan speed | Fixed compact height and summary-first layout |
| Recharts bundle/visual changes | Build or UI regression | Reuse existing Recharts import and run build/visual QA |
| Version generator modifies unrelated apps | Unrelated commit risk | Selective staging of Admin metadata only |
| DNS/service worker stale production | User sees old bundle | Verify index→entry bundle→chunk parity and hard-refresh instructions |

---

## 11. Acceptance Criteria

- [ ] Widget `Analisa jam operasional` tampil di dashboard utama tanpa menghapus/memindahkan chart existing.
- [ ] Default period `7 hari`.
- [ ] User dapat memilih `Hari ini`, `7 hari`, `30 hari`.
- [ ] User dapat memilih metrik `Order` atau `Revenue`.
- [ ] Semua perhitungan memakai transaksi `paid/completed` dan waktu WIB.
- [ ] Peak/quiet insight berasal dari data aktual, bukan dummy.
- [ ] Total bucket per jam direkonsiliasi dengan total settled pada periode sama.
- [ ] Loading/empty/error/sparse states tersedia.
- [ ] Mobile 390–430px tidak horizontal overflow dan layout simetris.
- [ ] Desktop layout tetap compact dan tidak membuat chart existing melebar.
- [ ] Existing period cards, revenue chart, payment mix, order status, top products, recent activity, finance, stock, dan action center tidak berubah perilakunya.
- [ ] Admin build berhasil.
- [ ] Source, bundle, webroot, dan production route diverifikasi sebelum menyatakan release selesai.

---

## 12. Approval Gate

Sebelum implementasi, konfirmasi dua keputusan berikut:

1. Default period tetap `7 hari` atau user ingin `Hari ini`?
2. MVP menampilkan `Order` sebagai metrik awal, dengan toggle ke `Revenue`, atau langsung menampilkan dua metrik berdampingan di desktop?

Rekomendasi: default `7 hari` dan `Order` sebagai metrik awal karena paling relevan untuk mengetahui kepadatan operasional; revenue tetap tersedia melalui toggle.
