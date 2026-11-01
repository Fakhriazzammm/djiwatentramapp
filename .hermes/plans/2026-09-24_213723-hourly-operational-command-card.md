# Plan — Hourly Operational Command Card

> **Status:** Draft plan — belum diimplementasikan.
>
> **Scope:** Admin Djiwa Tentram Cafe & Resto (`apps/admin`) saja.
>
> **Tujuan:** Mengubah card `Analisa jam operasional` menjadi card keputusan operasional yang tetap compact dan simetris, dengan fokus pada jam ramai, kualitas data, konsistensi pola, serta dukungan preset, tanggal tunggal, dan rentang tanggal berbasis WIB.

---

## 1. Goal

Meningkatkan `Analisa jam operasional` agar operator dapat menjawab dengan cepat:

1. Jam berapa paling ramai?
2. Berapa order dan revenue pada jam tersebut?
3. Apakah pola itu konsisten atau hanya terjadi pada satu hari?
4. Apakah periode data cukup kuat untuk dijadikan indikasi operasional?
5. Bagaimana pola berubah ketika memilih tanggal tunggal atau rentang tanggal?

Fitur akhir harus:

- Tetap memakai transaksi POS aktual dari Supabase self-hosted.
- Tetap memakai status settled `paid` dan `completed` saja.
- Tetap memakai zona waktu `Asia/Jakarta` / WIB.
- Tidak memakai dummy data atau placeholder.
- Tidak membuat tabel, view, RPC, atau migration database baru.
- Tidak mengubah payment, inventory, auth, Telegram, atau section dashboard lain.
- Tetap berada dalam satu card.
- Tetap ringkas, simetris, readable, dan usable pada lebar mobile sekitar 390–430px.

---

## 2. Current Context

### 2.1 Fitur yang sudah ada

Source saat ini sudah memiliki:

- Preset `Hari ini`, `7 hari`, `30 hari`.
- Pemilihan satu tanggal kalender berbasis WIB.
- Toggle metrik `Order` dan `Revenue`.
- View `Chart`, `Heatmap`, dan `Jam teratas`.
- Query bounded ke transaksi settled.
- Aggregation 24 bucket jam WIB.
- Summary `Jam ramai`, `Jam tersepi`, dan `Rentang aktif`.
- Loading, empty, error, dan sparse-data state.
- Test helper hourly dan custom date range.
- Fix sparse-data agar satu hari dengan 29 order tidak dianggap terbatas hanya karena `sampleDays = 1`.

### 2.2 Masalah yang terlihat dari screenshot

- Kontrol periode, tanggal, tampilan, dan metrik terlihat terlalu banyak dalam satu area.
- `Jam ramai` belum cukup dominan dibanding summary lainnya.
- Card masih lebih bersifat chart daripada decision surface.
- Belum ada ringkasan tindakan berbasis data aktual.
- Belum ada perbandingan dengan periode sebelumnya.
- Belum ada indikator konsistensi peak antarhari.
- Definisi `Rentang aktif` belum cukup eksplisit.
- `Sampel terbatas` berpotensi disalahpahami sebagai database terbatas.
- Nilai kontribusi peak terhadap total order/revenue belum terlihat.
- Rentang tanggal belum tersedia; saat ini hanya preset dan satu tanggal.

### 2.3 Existing source of truth

- Widget: `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`
- Aggregation: `apps/admin/src/lib/hourly-transaction-analysis.ts`
- Data hook/query: `apps/admin/src/hooks/use-hybrid-pos-data.ts`
- WIB helper: `apps/admin/src/lib/wib-utils.ts`
- Tests: `apps/admin/src/lib/__tests__/hourly-transaction-analysis.test.ts`
- Parent dashboard: `apps/admin/src/routes/admin/-OperationalDecisionDashboard.tsx`

---

## 3. Alternatives Analysis — Date Range

### Option A — Perluas query existing dengan `startDate` dan `endDate`

| Pros | Cons |
|---|---|
| ✅ Tidak perlu schema, RPC, atau API baru. | ❌ Range panjang dapat mengambil lebih banyak row. |
| ✅ Konsisten dengan custom tanggal yang sudah ada. | ❌ Aggregation tetap dilakukan di browser. |
| ✅ Perubahan kecil dan mudah rollback. | ❌ Perlu validasi batas range dan ukuran payload. |
| ✅ Chart/heatmap/top-hours dapat memakai dataset yang sama. |  |

### Option B — Membuat RPC/view agregasi per jam di database

| Pros | Cons |
|---|---|
| ✅ Lebih efisien untuk histori sangat panjang. | ❌ Menambah schema/API surface. |
| ✅ Payload frontend lebih kecil. | ❌ Membutuhkan migration, RLS/security review, dan deployment DB. |
|  | ❌ Risiko perbedaan timezone/status settlement dengan helper existing. |
|  | ❌ Overkill untuk card bounded 1–30/90 hari. |

### Rekomendasi

Gunakan **Option A** untuk fase ini:

- Tambahkan `startDateKey` dan `endDateKey` ke helper range.
- Query tetap bounded langsung ke `pos_orders`.
- Gunakan range kalender WIB `[startOfDayWIB, endOfDayWIB]`.
- Tetapkan batas custom range awal maksimum **31 hari kalender** agar tetap selaras dengan preset `30 hari`, menjaga payload dan waktu render.
- Jika kebutuhan histori lebih panjang muncul, buat plan terpisah untuk database aggregation/RPC berdasarkan metrik nyata.

Batas 31 hari harus menjadi validasi UI dan hook, bukan asumsi tersembunyi. Pesan error harus menjelaskan batas tersebut.

---

## 4. Proposed UX

### 4.1 Hierarki card

Urutan visual yang direkomendasikan:

```text
Title + metadata coverage
→ period/date controls
→ primary decision summary
→ view/metric toolbar
→ chart/heatmap/top-hours
→ compact supporting summaries
→ confidence and validation note
```

### 4.2 Header compact

Header menampilkan:

```text
Analisa jam operasional
29 order · Rp1.687.000 · 1 hari data · WIB
```

Status data menggunakan label yang tidak menyiratkan database terbatas:

- `Indikasi harian`
- `Confidence rendah`
- `Confidence sedang`
- `Confidence tinggi`
- `Data belum cukup`

Wording dipilih berdasarkan total settled order, jumlah hari data, dan distribusi hari.

### 4.3 Toolbar

Desktop:

```text
Periode: [Hari ini] [7 hari] [30 hari] [Tanggal] [Rentang]
Metrik:  [Order] [Revenue]
View:    [Chart] [Heatmap] [Jam teratas]
```

Mobile:

```text
[Hari ini ▾] [Order ▾] [Filter]
[Chart] [Heatmap] [Top]
```

- Kontrol utama tetap terlihat.
- Kontrol tanggal/rentang masuk ke popover atau compact panel.
- Semua interactive control minimal 44px touch target.
- Tidak ada horizontal overflow.
- Tanggal tunggal dan rentang menggunakan format tampilan `dd MMM yyyy`, tetapi query tetap memakai `YYYY-MM-DD`.

### 4.4 Mode tanggal tunggal

Pertahankan mode existing:

```text
Tanggal: 24 Sep 2026
```

Aturan:

- Satu hari kalender WIB.
- Tidak boleh memilih tanggal masa depan.
- Jika tidak ada settled transaction, tampilkan empty state yang jelas.
- `sampleDays = 1` bukan alasan tunggal untuk confidence rendah.

### 4.5 Mode rentang tanggal baru

Tambahkan mode:

```text
Rentang: 18 Sep 2026 — 24 Sep 2026
```

Flow:

1. User memilih tanggal mulai.
2. User memilih tanggal akhir.
3. UI menampilkan preview jumlah hari kalender.
4. UI menolak tanggal akhir sebelum tanggal mulai.
5. UI menolak tanggal masa depan.
6. UI menolak range lebih dari 31 hari.
7. User dapat reset kembali ke preset.
8. Loading state muncul saat dataset baru diambil.
9. Active label menunjukkan range yang sedang digunakan.

Jika baru memilih tanggal mulai:

```text
Pilih tanggal akhir
```

Jika range invalid:

```text
Rentang maksimal 31 hari dan harus berurutan.
```

Semua view memakai dataset/range yang sama.

### 4.6 Primary decision summary

Tambahkan summary utama yang lebih kuat daripada tiga card setara:

```text
Jam ramai
12.00–13.00
6 order · Rp368.000
20,7% dari total order
Peak order + revenue
```

Di bawahnya, tambahkan ringkasan singkat:

```text
Fokus utama: periode makan siang.
Validasi konsistensi dengan rentang 7 atau 30 hari.
```

Copy hanya berupa ringkasan statistik, bukan staffing recommendation otomatis.

### 4.7 Supporting summaries

Tetap pertahankan:

- `Jam tersepi`
- `Rentang transaksi`
- `Revenue tertinggi` bila metrik aktif revenue

Namun tampilkan sebagai summary pendukung yang lebih compact.

Bedakan istilah:

- **Rentang transaksi:** jam pertama sampai terakhir yang memiliki transaksi settled.
- **Rentang padat:** opsional pada fase lanjutan, jam berurutan yang memenuhi threshold order/revenue tertentu.

Fase pertama cukup memperjelas definisi `Rentang transaksi` melalui tooltip/helper text.

### 4.8 Chart interaction

- Peak hour tetap gold.
- Tambahkan label/outline `Tertinggi`, bukan hanya warna.
- Tooltip/tap menampilkan:
  - range jam
  - order count
  - revenue
  - persentase terhadap total periode
- Jam tanpa bar dijelaskan sebagai `0 order`, bukan data hilang.
- Sumbu Y tetap dinamis dengan headroom yang cukup.
- Saat summary `Jam ramai` dipilih, peak bar diberi focus ring.

### 4.9 Heatmap

- 24 cell jam.
- Intensitas berdasarkan metric aktif.
- Peak diberi outline dan label.
- Tooltip/tap konsisten dengan chart.
- Legend tetap compact.

### 4.10 Jam teratas

- Top 5 jam.
- Primary metric mengikuti `Order`/`Revenue`.
- Secondary metric tetap terlihat sebagai konteks.
- Tambahkan persentase kontribusi jika ruang cukup.
- Mobile tidak overflow; angka nominal dapat memakai compact format dengan full value di tooltip.

---

## 5. Data and Business Rules

### 5.1 Settlement

Hanya status berikut yang dihitung:

```text
paid
completed
```

Tidak dihitung:

```text
pending
cancelled
open bill
unpaid
status lain
```

### 5.2 WIB range semantics

Untuk preset:

- `Hari ini`: awal sampai akhir hari berjalan WIB.
- `7 hari`: hari berjalan dan 6 hari sebelumnya WIB.
- `30 hari`: hari berjalan dan 29 hari sebelumnya WIB.

Untuk tanggal tunggal:

```text
start = 00:00:00 WIB
end   = 23:59:59.999 WIB
```

Untuk rentang:

```text
start = 00:00:00 WIB pada start date
end   = 23:59:59.999 WIB pada end date
```

Tanggal dan range harus diuji terhadap UTC boundary agar tidak terjadi pergeseran hari.

### 5.3 Sparse/confidence semantics

Definisi tidak boleh menyamakan coverage satu hari dengan data yang sedikit.

Rekomendasi:

- `Data belum cukup`: kurang dari 3 settled orders.
- `Confidence rendah`: order cukup tetapi hanya satu hari/tanggal tunggal dan distribusi sangat terkonsentrasi.
- `Confidence sedang`: range multi-hari dengan beberapa hari data.
- `Confidence tinggi`: range multi-hari dengan coverage hari dan order yang memadai.

Threshold harus berada di pure helper dan memiliki unit test. Jangan menyimpulkan confidence dari total database.

### 5.4 Comparison period

Fase lanjutan dalam plan ini:

- Untuk preset 7/30 hari, hitung previous window dengan durasi sama.
- Untuk custom range, previous window memiliki durasi kalender yang sama tepat sebelum start date.
- Untuk tanggal tunggal, previous comparison adalah hari sebelumnya WIB.
- Comparison hanya ditampilkan jika dataset pembanding valid.
- Jika tidak ada pembanding, tampilkan `Belum ada pembanding`, bukan angka nol.

Metrics:

- total settled orders
- total settled revenue
- peak hour
- peak contribution
- active day coverage

### 5.5 Peak consistency

Untuk range lebih dari satu hari, hitung secara terpisah dari aggregate 24 jam:

- jumlah hari yang memiliki transaksi pada peak hour/range
- jumlah hari aktif dalam selected range
- contoh display: `Peak 12.00–13.00 muncul 5 dari 7 hari`

Jika belum ada data multi-hari yang cukup, jangan menampilkan confidence palsu.

---

## 6. Database Schema and REST Mapping

### 6.1 No schema change

Tidak membuat:

- table baru
- view baru
- RPC baru
- migration baru
- index baru pada fase UI ini

### 6.2 Existing source

Sumber transaksi tetap `pos_orders` melalui client/hybrid data layer existing.

Field minimum yang diperlukan:

```text
_id / id
created_at / createdAt
status
final_amount / total_amount / totalAmount sesuai mapper existing
```

Nama field final harus mengikuti mapper yang sudah ada; jangan membuat field alias baru jika tidak diperlukan.

### 6.3 Query mapping

Flow:

```text
selected mode
  → getHourlyAnalysisRange / getHourlyAnalysisDateRange / getHourlyAnalysisDateRange(start,end)
  → fetchHourlyTransactions({ start, end })
  → filter settled
  → aggregateHourlySales
  → primary decision summary
  → Chart / Heatmap / Jam teratas
```

Query wajib bounded dengan `gte(start)` dan `lte(end)` atau pola equivalent existing.

### 6.4 Data completeness audit

Implementasi harus memverifikasi:

- Timestamp yang digunakan untuk grouping benar-benar timestamp transaksi.
- Status yang digunakan sesuai status settlement aktual.
- Nominal revenue sama dengan nominal yang dipakai dashboard existing.
- Tanggal custom/range tidak memengaruhi query widget lain.
- Realtime refresh menggunakan table dependency existing dan tidak membuat duplicate subscription.

---

## 7. Files Likely to Change

### Primary

- `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`
  - compact toolbar
  - mode tanggal tunggal/rentang
  - primary decision summary
  - confidence status
  - comparison/consistency presentation
  - responsive layout

- `apps/admin/src/lib/hourly-transaction-analysis.ts`
  - range helper start/end
  - range validation
  - confidence classification
  - peak contribution
  - optional comparison/consistency pure helpers

- `apps/admin/src/hooks/use-hybrid-pos-data.ts`
  - accept selected range mode
  - bounded query key
  - preserve refresh behavior
  - prevent stale data from prior filter

- `apps/admin/src/lib/__tests__/hourly-transaction-analysis.test.ts`
  - range boundaries
  - invalid order/range
  - future date
  - maximum range
  - single-day confidence
  - multi-day confidence
  - comparison window
  - peak contribution
  - consistency count

### Possible supporting files

- `apps/admin/src/lib/wib-utils.ts` only if existing helper cannot safely represent inclusive WIB range.
- Shared UI primitives only if existing segmented controls/popover/date picker are insufficient.

### Must not change

- `apps/admin/src/routes/admin/-OperationalDecisionDashboard.tsx` beyond existing isolated widget mount if unnecessary.
- Existing dashboard sections.
- POS order creation/payment logic.
- Inventory/HPP logic.
- Auth and Telegram integrations.
- Database schema.

---

## 8. Multi-Source Data Flow

```text
Supabase self-hosted
  └─ pos_orders
      └─ existing Admin client/hybrid fetch
          └─ bounded WIB range query
              └─ settled filter: paid/completed
                  └─ hourly aggregation
                      ├─ primary peak summary
                      ├─ confidence status
                      ├─ previous-period comparison
                      ├─ peak consistency
                      ├─ Chart
                      ├─ Heatmap
                      └─ Jam teratas
```

No data is copied to another table. No AI or Telegram dependency is introduced.

Existing app sections continue using their own hooks/data flow.

---

## 9. AI, Telegram, and Purchasing Integration

### AI/LLM

Tidak digunakan.

Tidak membuat rekomendasi staffing otomatis, prediksi AI, atau natural-language decision yang tidak dapat diaudit.

### Telegram

Tidak ada perubahan.

Card tidak mengirim notifikasi Telegram dan tidak membaca backlog notification.

### Purchasing agent

Tidak ada perubahan.

Hourly operational analysis tidak mengubah inventory, purchasing, HPP, atau reorder flow.

---

## 10. UI States

### Loading

- Preserve card shell.
- Skeleton untuk summary utama, chart, dan toolbar-dependent data.
- Jangan menampilkan angka dari filter sebelumnya seolah-olah masih aktif.

### Empty

```text
Tidak ada transaksi settled pada periode ini.
Coba pilih rentang tanggal lain.
```

### Error

```text
Analisa belum dapat dimuat.
Coba lagi.
```

Pertahankan retry tanpa mengubah filter.

### Invalid range

```text
Tanggal akhir harus sama atau setelah tanggal mulai.
```

### Range too large

```text
Pilih rentang maksimal 31 hari untuk analisa operasional.
```

### Future range

```text
Tanggal masa depan belum dapat dianalisis.
```

### Valid but low confidence

Tampilkan status confidence, bukan error database.

---

## 11. Visual Design and Compactness Budget

### Target hierarchy

```text
1. Primary peak decision
2. Total selected-period context
3. Chart/view data
4. Supporting peak/quiet/range
5. Confidence and validation note
```

### Target compactness

- Kurangi vertical padding header dan toolbar tanpa menurunkan touch target.
- Summary primary lebih kuat; supporting summary lebih pendek.
- Gabungkan metadata `order · revenue · hari data` dalam satu baris responsif.
- Hindari menampilkan subtitle yang mengulang label chart.
- Gunakan satu accent gold hanya untuk peak/primary decision.
- Naikkan kontras teks sekunder agar terbaca pada layar kecil.

### Responsive layout

Desktop:

```text
Header + controls
Primary summary
Chart/view
Supporting summaries in 3 columns
Confidence note
```

Mobile:

```text
Header
Coverage metadata
Primary summary
Compact period/metric controls
View tabs
Chart/view
Supporting summaries in 2+1 layout
Confidence note
```

Acceptance:

- Tidak ada horizontal overflow pada 390px.
- Tidak ada summary card terpotong.
- Date range control tidak melewati viewport.
- Segmented control tetap dapat disentuh.

---

## 12. Implementation Tasks

### Task 1 — Audit current range and query contract

- Re-read helper, hook, widget, and tests.
- Confirm field mapper and existing query operators.
- Confirm current production fix for one-day sparse logic.

### Task 2 — Add safe WIB date-range model

- Add explicit range type for single date and start/end date.
- Add validation for malformed dates, reversed range, future range, and max 31 days.
- Add tests around UTC/WIB boundaries.

### Task 3 — Extend hook/data flow

- Extend `useHybridHourlySales` with range mode.
- Include start/end in cache/query key.
- Keep one bounded request for the selected range.
- Preserve loading/error/refresh semantics.

### Task 4 — Add decision metrics

- Primary peak summary.
- Peak contribution percentage.
- Confidence classification.
- Optional previous-period comparison and peak consistency pure helpers.

### Task 5 — Redesign compact toolbar

- Keep presets.
- Add `Tanggal` and `Rentang` mode.
- Add compact date/range picker UI.
- Preserve `Chart`, `Heatmap`, `Jam teratas`, `Order`, and `Revenue`.

### Task 6 — Improve card hierarchy

- Make `Jam ramai` primary.
- Compress supporting summaries.
- Add decision summary sentence.
- Clarify `Rentang transaksi` definition.
- Improve data-quality wording.

### Task 7 — Improve chart interactions

- Add percentage context.
- Add explicit peak label/outline.
- Ensure zero-hour meaning is clear.
- Keep Chart/Heatmap/Top-hours data identical.

### Task 8 — Responsive QA

- Verify desktop, tablet, and 390–430px mobile.
- Check toolbar wrapping, date picker, chart labels, summary cards, and overflow.
- Check keyboard focus and accessible labels.

### Task 9 — Verification and release

- Run targeted Bun tests.
- Run `git diff --check`.
- Run Admin build.
- Run filtered typecheck for touched files and record unrelated historical errors.
- Verify bundle markers.
- Selective git add only changed source/test/plan files.
- Commit and push.
- Deploy only Admin dist to `/var/www/admindjiwatentram.yumme.id/`.
- Verify `/version.json`, `index.html`, bundle marker, and production URL.

---

## 13. Test Matrix

### Date/range

- Single valid WIB date.
- Same start/end date.
- Multi-day range.
- Start date before end date.
- End date before start date.
- Invalid calendar date.
- Future start date.
- Future end date.
- Range exactly 31 days.
- Range 32 days rejected.
- UTC timestamp near WIB midnight.

### Settlement

- `paid` included.
- `completed` included.
- `pending` excluded.
- `cancelled` excluded.
- malformed timestamp excluded safely.
- malformed amount does not break aggregation.

### Confidence

- 0, 1, 2 orders → low/insufficient state.
- 29 orders on one day → not sparse merely because one day.
- Multi-day range with only one active day → lower confidence.
- Multi-day range with distributed active days → stronger confidence.

### Metrics

- Peak order.
- Peak revenue.
- Peak contribution percentage.
- Previous-period comparison.
- Peak consistency.
- No comparison data → explicit unavailable state.

### UI

- Preset selection.
- Single date selection.
- Range selection.
- Reset custom filter.
- View switch consistency.
- Metric switch consistency.
- Loading does not show stale prior filter.
- Empty/error/retry states.
- No horizontal overflow.

---

## 14. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Range query mengambil terlalu banyak row | Batas 31 hari, query bounded, monitor payload dan render time. |
| User mengira confidence rendah berarti DB terbatas | Gunakan wording `Confidence`/`Indikasi`, tampilkan order dan hari data. |
| Date range bergeser karena timezone browser | Semua boundary dihitung dengan helper WIB, bukan `new Date("YYYY-MM-DD")` langsung. |
| Chart, heatmap, dan top-hours tidak konsisten | Satu hasil aggregation dipakai semua view. |
| Toolbar terlalu padat di mobile | Secondary controls masuk popover/filter panel; minimum touch target 44px. |
| Perbandingan memberi kesimpulan palsu | Jangan tampilkan comparison jika dataset pembanding kosong/tidak cukup. |
| Peak summary terasa seperti rekomendasi staffing | Copy hanya berupa statistical insight; tidak ada auto-decision. |
| Build mengubah metadata app lain | Restore generated version files; selective git add. |
| Service worker menyajikan bundle lama | Version manifest, cache strategy, and production bundle marker verification. |

---

## 15. Acceptance Criteria

- [ ] Preset `Hari ini`, `7 hari`, `30 hari` tetap berfungsi.
- [ ] Mode tanggal tunggal tetap berfungsi.
- [ ] Mode rentang tanggal tersedia dalam card yang sama.
- [ ] Range start/end dihitung dalam WIB.
- [ ] Reversed, future, invalid, dan >31-day range ditolak dengan pesan jelas.
- [ ] Query tetap bounded dan memakai transaksi settled aktual.
- [ ] Database source tetap Supabase self-hosted `pos_orders` melalui data layer existing.
- [ ] 29 order pada satu hari tidak otomatis diberi label sparse.
- [ ] Confidence tidak disamakan dengan ketersediaan database.
- [ ] `Jam ramai` menjadi visual primary decision.
- [ ] Peak contribution dapat dipahami.
- [ ] Chart, Heatmap, dan Jam teratas memakai dataset identik.
- [ ] Comparison hanya muncul jika valid.
- [ ] Tidak ada AI/staffing recommendation otomatis.
- [ ] Tidak ada perubahan inventory/payment/auth/Telegram/dashboard section lain.
- [ ] Tidak ada horizontal overflow pada 390–430px.
- [ ] Unit test, build, diff check, bundle check, dan production HTTP verification lulus.
- [ ] Release dilakukan dengan selective git add.

---

## 16. Rollback

Rollback cukup dengan:

1. Revert commit Admin terakhir.
2. Build ulang Admin.
3. Deploy dist ke webroot canonical.
4. Verifikasi `version.json`, index, dan production route.

Tidak ada rollback database karena plan ini tidak mengubah schema atau data.
