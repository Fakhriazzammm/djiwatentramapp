# Plan: Menyelaraskan Alur Pengeluaran, Inventory, HPP, dan Accounting

## 1. Goal

Menyelaraskan business logic Djiwa Tentram agar:

```text
Pembelian bahan → Kas berkurang + Inventory bertambah
Penjualan       → Revenue bertambah + Inventory berkurang + HPP/COGS bertambah
Laporan         → P&L dan Cash Flow tidak double count
```

HPP tidak boleh dianggap sebagai pengeluaran kas kedua setelah pembelian bahan.

## 2. Current Context

Database self-hosted saat ini memiliki:

- `pos.financial_transactions`: expense dan income.
- `pos.inventory`: 159 item, 156 sudah memiliki harga.
- `pos.recipes`: 35 recipe.
- `public.pos_hpp_calculations`: 50 master/perhitungan HPP.
- 450 transaksi kategori `HPP`, 445 terhubung ke order dan 5 belum memiliki `order_source_id`.
- Total transaksi HPP saat audit: sekitar Rp28,18 juta.
- Koreksi gambar struk sudah dilakukan pada 26 transaksi expense yang terbukti memiliki mismatch.
- 4 harga inventory sudah dikoreksi berdasarkan bukti harga satuan yang jelas.
- `operational_unit` masih kosong pada 159 item inventory.
- Inventory menggunakan sedikitnya 39 kombinasi base/purchase unit sehingga tidak boleh dipaksa ke pola karton → box → ml.
- Fresh food seperti sayur, cabe, bawang, ayam, dan daging masih memiliki campuran `pcs`, `kg`, `gram`, dan `ikat` yang perlu dinormalisasi per item.

Temuan utama:

1. HPP operasional sudah dihitung dari recipe dan biaya inventory.
2. Order menyimpan `hppSnapshot`, sehingga HPP histori tidak berubah ketika harga bahan berubah.
3. Transaksi HPP saat ini masih diperlakukan sebagai `expense` biasa.
4. Trigger accounting HPP membuat `Debit Beban Operasional → Kredit Kas Tunai`, padahal HPP penjualan seharusnya memindahkan nilai dari Inventory ke COGS.
5. Laporan yang menjumlahkan seluruh expense berpotensi memasukkan HPP sebagai kas keluar kedua.

## 3. Alternatives Analysis

### Opsi A — Hapus transaksi HPP lama dan hanya gunakan snapshot order

| Kelebihan | Kekurangan/Risiko |
|---|---|
| Struktur lebih sederhana | Histori finance dan audit trail rusak |
| Tidak ada duplikasi expense HPP | Sulit merekonsiliasi laporan lama |
| Cash flow menjadi lebih bersih | Destructive dan tidak sesuai aturan preservasi histori |

### Opsi B — Tetap simpan transaksi HPP, tetapi tandai sebagai non-cash COGS

| Kelebihan | Kekurangan/Risiko |
|---|---|
| Histori tetap terjaga | Membutuhkan perubahan report dan accounting mapping |
| Bisa direkonsiliasi berdasarkan order | Data lama harus diberi klasifikasi sumber |
| Aman untuk migrasi additive | Masih ada dua sumber HPP jika tidak diberi prioritas jelas |

### Opsi C — Buat ledger COGS/Inventory khusus dan hentikan financial transaction HPP baru

| Kelebihan | Kekurangan/Risiko |
|---|---|
| Accounting paling benar | Perubahan schema dan flow lebih besar |
| Cash flow dan P&L terpisah jelas | Perlu backfill/reconciliation histori |
| Mendukung weighted average/FIFO di masa depan | Membutuhkan test lintas POS, Finance, Inventory |

### Recommendation

Pilih **Opsi B sebagai fase transisi**, lalu bergerak ke **Opsi C secara bertahap**.

Alasannya:

1. Historical records tetap dipertahankan.
2. Laporan dapat segera diperbaiki tanpa migrasi destruktif.
3. Transaksi HPP lama bisa ditandai `non_cash_cogs`.
4. Flow baru dapat menggunakan ledger COGS yang benar setelah audit selesai.

## 4. Target Business Logic

### Pembelian

```text
Expense/purchase receipt
    → validasi gambar dan nominal
    → financial transaction: actual cash outflow
    → inventory purchase movement: quantity +
    → update latest purchase cost
```

Accounting:

```text
Debit  Inventory/Persediaan
Kredit Kas atau Hutang
```

### Penjualan

```text
Order paid/completed
    → revenue transaction
    → ambil recipe
    → ambil cost inventory
    → hitung HPP
    → simpan hppSnapshot pada order item
    → inventory usage: quantity -
    → COGS movement
```

Accounting:

```text
Debit  Kas/Piutang          nilai penjualan
Kredit Pendapatan          nilai penjualan

Debit  HPP/COGS             nilai HPP
Kredit Inventory/Persediaan nilai HPP
```

### Laporan

Profit & Loss:

```text
Revenue - HPP/COGS - Operating Expense = Net Profit
```

Cash Flow:

```text
Cash Income - Actual Cash Outflow = Net Cash Flow
```

HPP tidak boleh masuk sebagai cash outflow kedua.

## 5. Database Schema dan Mapping

### Existing tables

```text
pos.financial_transactions
├── source_id
├── tx_type: income | expense
├── amount
├── category
├── order_source_id
├── payment_method
├── tx_date
├── metadata
└── status

pos.inventory
├── source_id
├── ingredient_name
├── unit
├── quantity
├── last_purchase_price
├── last_purchase_at
├── content_to_base_factor
└── aliases

Multi-unit fields yang harus diperlakukan konsisten:

```text
unit                    = satuan dasar untuk ledger/recipe (ml, gram, pcs)
operational_unit        = satuan yang terlihat saat operasi/opname (box, botol, pack)
content_to_base_factor  = isi satu operational unit dalam base unit
preferred_purchase_unit = satuan pembelian supplier (karton, dus, kg)
preferred_purchase_quantity = jumlah operational unit per purchase unit
```

Jika satu `conversion_factor` tidak cukup untuk merepresentasikan lebih dari satu level, gunakan `pos.inventory_packaging_levels` additive; jangan menggandakan inventory item.

pos.recipes
├── source_id
├── product_id
├── variant_name
└── ingredients JSONB

pos.order_items
├── source_id
├── order_source_id
├── product_id
├── quantity
└── hpp_snapshot JSONB

public.accounting_entries
├── transaction_source_id
├── coa_id
├── entry_type
├── amount
└── item_index
```

### Public views

| View | Fungsi | Akses |
|---|---|---|
| `pos_financial_transactions` | Read-only finance transaction view | public REST view |
| `pos_inventory` | Read-only inventory view | public REST view |
| `pos_inventory_latest_costs` | latest cost per unit | public view |
| `pos_hpp_calculations` | master HPP dari `legacy_mirror.documents` | public view |
| `pos_shift_reports` | agregat shift | public view |

### REST/schema mapping

- Public view: `public.pos_financial_transactions` dengan `_id`, `type`, `date`, `amount`.
- Schema table: `pos.financial_transactions` dengan `source_id`, `tx_type`, `tx_date`, `amount`.
- Public view: `public.pos_inventory` dengan camelCase.
- Schema table: `pos.inventory` dengan snake_case.
- Semua write ke financial transaction baru harus melalui Edge Function `record-financial-transaction`.
- Backfill data self-hosted harus memakai SQL transaction dengan strict `source_id` guard.

## 6. Implementation Steps

### Phase 1 — Audit dan baseline

1. Audit semua expense dengan gambar struk menggunakan Hermes/Codex vision.
2. Audit 5 transaksi HPP tanpa `order_source_id`; status ini menjadi **BLOCKER untuk backfill accounting** sampai dapat dibuktikan.
3. Cocokkan setiap HPP transaction dengan `order_items.hpp_snapshot`.
4. Cari duplicate HPP untuk order yang sama.
5. Buat dry-run report sebelum mengubah histori:
   - total revenue,
   - actual cash expense non-HPP,
   - HPP/COGS,
   - inventory quantity/value,
   - accounting debit/kredit.
6. Simpan baseline dan checksum/count per dataset agar hasil before/after dapat dibandingkan.

### Phase 2 — Penandaan histori HPP

1. Tambahkan field additive pada metadata atau kolom nullable, misalnya:
   - `transaction_kind = purchase | operating_expense | order_cogs`
   - `is_cash_outflow = true | false`
   - `cogs_order_source_id`
2. Tandai transaksi HPP yang terbukti berasal dari order sebagai `order_cogs` dan `is_cash_outflow=false`.
3. Jangan menghapus transaksi histori.
4. Transaksi HPP tanpa order link tetap `HPP_REVIEW` dan tidak boleh otomatis direklasifikasi.
5. Jalankan simulasi P&L, Cash Flow, dan Inventory sebelum melakukan backfill aktual.
6. Backfill hanya dilanjutkan jika hasil simulasi tidak double count dan accounting tetap balanced.

### Phase 3 — Perbaikan accounting mapping

1. Update trigger/function agar `order_cogs` memakai:

```text
Debit  COGS/HPP
Kredit Inventory
```

2. Pastikan purchase expense memakai:

```text
Debit  Inventory atau Expense Operasional
Kredit Kas/Hutang
```

3. Pastikan income memakai:

```text
Debit  Kas/Piutang
Kredit Pendapatan
```

4. Pastikan setiap jurnal balanced.
5. Gunakan `ON CONFLICT DO NOTHING` dan idempotency.

### Phase 4 — Perbaikan report

Update sumber perhitungan:

- Cash Flow: exclude `order_cogs` dan kategori HPP non-cash.
- P&L: include HPP satu kali sebagai COGS.
- Expense dashboard: tampilkan operating expense tanpa HPP.
- Shift report: pisahkan `actual_expenses` dan `cogs`.
- Proposal/investment report: tampilkan revenue, COGS, gross profit, operating expense, dan cash outflow sebagai metrik terpisah.

### Phase 5 — Inventory cost model

1. MVP memakai `last_purchase_price` hanya sebagai harga pembelian terakhir/display setelah `price_unit` dan base conversion valid.
2. Jangan menggunakan `last_purchase_price` sebagai HPP histori; HPP histori tetap membaca `hppSnapshot`.
3. Tambahkan cost basis yang jelas untuk fase berikutnya:
   - rekomendasi: weighted average cost,
   - alternatif: FIFO,
   - ledger movement tetap menjadi sumber audit.
4. Pastikan konversi kg/gram, liter/ml, pack/pcs, ikat/gram, dan batch/yield tidak tercampur.
5. Saat pembelian masuk:
   - update quantity,
   - update cost basis,
   - tidak mengubah historical `hppSnapshot` order lama.
6. Saat penjualan:
   - deduct inventory melalui recipe,
   - catat COGS,
   - cegah double deduction.
7. Jika faktor konversi bahan fresh tidak konsisten, simpan berat aktual pembelian dan tandai rata-rata hanya sebagai referensi.

### Phase 5A — Multi-unit packaging dan satuan operasional

#### Prinsip utama

Satu bahan tetap menjadi satu inventory item. Sistem menyimpan quantity dalam satuan dasar untuk akurasi, tetapi user melihat satuan operasional yang nyata.

Contoh susu:

```text
Inventory item : Susu Greenfields
Satuan dasar   : ml
Satuan resep   : ml
Satuan opname  : box
Satuan beli    : karton

1 box         = 1.000 ml
1 karton      = 12 box
1 karton      = 12.000 ml
```

#### Model data jangka pendek

Gunakan field existing secara konsisten:

- `unit` atau base unit: `ml`.
- `operational_unit`: `box`.
- `content_to_base_factor`: `1000` untuk 1 box → 1.000 ml.
- `preferred_purchase_unit`: `karton`.
- `preferred_purchase_quantity`: `12` box per karton.
- `conversion_factor`: hanya dipakai untuk konversi yang definisinya sudah disepakati; jangan overload dengan arti lain.

Sumber kebenaran quantity:

```text
base_quantity = angka authoritative untuk HPP, recipe, dan stock ledger
operational_quantity = turunan untuk tampilan dan opname
```

Jika struktur existing tidak cukup untuk lebih dari satu level kemasan, tambahkan tabel additive `pos.inventory_packaging_levels`:

```text
inventory_id
level_key              -- base | operational | purchase
label                  -- ml | box | karton
quantity_in_base       -- 1 | 1000 | 12000
parent_level_key       -- box parent dari ml; karton parent dari box
units_per_parent       -- 12 untuk karton → box
is_default_display
is_default_purchase
```

Jangan membuat inventory item terpisah untuk `susu karton`, `susu box`, dan `susu ml`.

#### Perhitungan HPP

Recipe menggunakan satuan dasar. Harga beli dikonversi menjadi cost per base unit.

Contoh harga 1 karton Rp300.000:

```text
1 karton = 12.000 ml
cost per ml  = Rp25
cost per box = Rp25.000
recipe memakai 50 ml
HPP susu     = Rp1.250
```

Formula:

```text
cost_per_base_unit = purchase_price / purchase_quantity_in_base
ingredient_cost    = recipe_base_quantity × cost_per_base_unit
```

`last_purchase_price` harus disertai definisi unit harga. Harga Rp300.000 tidak boleh dibaca sebagai harga per ml atau per box tanpa conversion context.

#### Stock opname berbasis satuan yang terlihat

Stock opname pada absen keluar menampilkan satuan operasional, bukan satuan dasar:

```text
Susu Greenfields
Stok terlihat: 2 box
[Jika ada box terbuka]
Isi box terbuka: 350 ml
```

Representasi internal:

```text
System quantity : 2.350 ml
Display         : 2 box + 350 ml
Counted         : 2 box + 300 ml
Adjustment      : -50 ml
```

Jika bisnis memilih opname sederhana, input minimum adalah jumlah box penuh. Namun sistem harus menyediakan opsi box terbuka agar stok 350 ml tidak hilang akibat pembulatan.

#### Flow stock opname saat absen keluar

```text
Karyawan klik Absen Keluar
    → sistem tampilkan item kritis berdasarkan area
    → tampilkan operational_unit (box, botol, pack, karton)
    → karyawan isi stok terlihat
    → data disimpan sebagai audit snapshot
    → setiap karyawan tetap punya log audit
    → karyawan terakhir/finalizer menetapkan snapshot final
    → base_quantity inventory diperbarui satu kali
```

Aturan:

- Hanya item yang dikonfigurasi wajib opname yang ditampilkan.
- Item dapat difilter berdasarkan `operational_area` seperti Bar, Kitchen, dan Gudang.
- Semua input menyimpan `counted_base_quantity` setelah konversi.
- Perubahan quantity hanya dilakukan pada finalisasi, bukan pada setiap input karyawan.
- Selisih dicatat sebagai adjustment/waste/variance, tidak menghapus histori.
- Finalisasi harus idempotent dan tidak boleh membuat stok bertambah dua kali.

#### Model data jangka panjang

Buat inventory movement ledger dengan jenis:

```text
purchase      -- pembelian menambah base quantity
sale_usage    -- penjualan mengurangi base quantity
waste         -- bahan rusak/terbuang
stock_opname  -- koreksi ke hasil hitung final
adjustment    -- koreksi manual beralasan
```

Semua movement menyimpan:

- `inventory_id`.
- `quantity_base`.
- `unit_base`.
- `direction` (`in` atau `out`).
- `source_type`.
- `source_id`.
- `actor_id`.
- `before_quantity`.
- `after_quantity`.
- `purchase_price` atau `cost_per_base_unit` jika relevan.
- `created_at` dan actor.

### Phase 5B — Klasifikasi satuan seluruh inventory

Sebelum mengisi `operational_unit` atau mengubah recipe, lakukan klasifikasi satu per satu berdasarkan sifat bahan. Tidak boleh menggunakan satu conversion rule global.

| Kelas bahan | Contoh | Base unit | Purchase unit | Operational/display unit |
|---|---|---|---|---|
| Cair/kemasan | susu, sirup, minyak, soda, saus | `ml` | botol/karton | botol/box + sisa ml |
| Fresh berbobot | ayam, daging, cabe, bawang, kentang | `gram` | kg | kg + gram |
| Fresh berbasis ikat | kemangi, daun bawang, sereh, sayur pasar | `gram` | ikat | ikat + gram |
| Countable | telur, roti, kaleng, botol | `pcs` | pack/dus/tray | pcs/pack |
| Packaging | cup, tutup, sedotan, bowl | `pcs` | pack/toros/karton | pcs/pack |
| Pre-mix/produksi | Yamin Base, bumbu dasar | gram/ml/batch | batch/pack | batch + base unit |

#### Aturan per kelas

1. **Cair:** recipe memakai ml; harga karton/botol dikonversi ke cost per ml.
2. **Fresh berbobot:** recipe memakai gram; pembelian kg dikonversi ke gram; stock opname memakai kg + gram.
3. **Fresh ikat:** base unit tetap gram, tetapi berat per ikat harus berasal dari data pembelian/penimbangan aktual jika beratnya tidak konsisten.
4. **Countable:** recipe memakai pcs; pack/dus/tray memiliki jumlah pcs yang eksplisit.
5. **Packaging:** gunakan pcs sebagai base; purchase pack/toros hanya menjadi conversion level.
6. **Pre-mix:** gunakan batch hanya jika recipe batch memiliki yield yang jelas; jika tidak, gunakan gram/ml.

#### Data audit yang wajib dilakukan

Untuk setiap dari 159 item, isi audit matrix berikut sebelum migration:

```text
inventory_id
ingredient_name
category
current_unit
target_base_unit
target_purchase_unit
target_operational_unit
purchase_to_base_factor
operational_to_base_factor
recipe_unit
confidence
review_status
```

Kategori review:

- `READY`: unit dan faktor dapat dibuktikan dari data/struk.
- `NEEDS_WEIGHT`: fresh item membutuhkan penimbangan per ikat/pack.
- `NEEDS_SUPPLIER_CONFIRMATION`: isi karton/dus/pack belum diketahui.
- `AMBIGUOUS`: nama atau unit belum cukup jelas.
- `NOT_USED_IN_RECIPE`: belum perlu dipaksa masuk model HPP.

#### Contoh normalisasi yang harus dipastikan

```text
Susu Greenfield:
  base       = ml
  purchase   = karton
  operational= box
  1 box      = 1.000 ml
  1 karton   = 12 box = 12.000 ml

Selada:
  base       = gram
  purchase   = ikat
  operational= ikat + gram
  faktor     = berat aktual per ikat, bukan asumsi global

Telur Ayam:
  base       = pcs
  purchase   = tray/pack
  operational= pcs

Cup:
  base       = pcs
  purchase   = toros/pack
  operational= pcs atau pack
```

#### Larangan normalisasi

- Jangan mengubah semua `pcs` menjadi gram tanpa bukti.
- Jangan memakai harga per karton sebagai harga per box.
- Jangan memakai harga total nota sebagai harga satuan.
- Jangan mengisi `operational_unit` secara massal sebelum faktor konversinya tervalidasi.
- Jangan membuat inventory item duplikat untuk setiap level packaging.

#### Dampak ke HPP

HPP hanya boleh menghitung item yang memiliki:

```text
base_unit valid
recipe amount valid
cost_per_base_unit valid
conversion factor valid jika purchase unit berbeda
```

Item yang belum memenuhi syarat diberi status `HPP_REVIEW`, bukan dihitung dengan faktor tebakan.

### Phase 0 (wajib dijalankan sebelum Phase 1) — Data completeness gate sebelum migration

Phase ini wajib selesai sebelum mengubah `unit`, recipe, quantity, atau HPP. Tidak boleh menjadikan field existing sebagai sumber kebenaran tanpa audit karena pada kondisi live `operational_unit` masih kosong dan 159 item memakai banyak kombinasi unit.

#### Audit matrix per inventory item

Untuk setiap item, tetapkan:

```text
inventory_id
ingredient_name
category
current_unit
target_base_unit
target_recipe_unit
target_purchase_unit
target_operational_unit
purchase_to_base_factor
operational_to_base_factor
conversion_source
recipe_references
price_unit
confidence
review_status
```

Status wajib:

- `READY`: semua unit dan faktor dapat dibuktikan.
- `NEEDS_WEIGHT`: bahan fresh/ikat perlu ditimbang.
- `NEEDS_SUPPLIER_CONFIRMATION`: isi pack/dus/karton belum jelas.
- `AMBIGUOUS`: nama, unit, atau harga belum dapat dipastikan.
- `NOT_USED_IN_RECIPE`: tidak dipakai recipe dan belum perlu masuk HPP.

#### Klasifikasi yang harus dipakai

```text
Cair             → base ml, display botol/box, purchase botol/karton
Fresh berbobot   → base gram, display kg + gram, purchase kg
Fresh berbasis ikat → base gram, display ikat + gram, purchase ikat
Countable        → base pcs, display pcs/pack, purchase pack/dus/tray
Packaging        → base pcs, display pcs/pack, purchase pack/toros/karton
Pre-mix          → base gram/ml/batch dengan yield yang terdokumentasi
```

#### Larangan pada Phase 0

- Jangan mengubah semua `pcs` menjadi gram secara otomatis.
- Jangan mengisi `operational_unit` massal tanpa conversion factor.
- Jangan menggunakan harga karton sebagai harga box/pcs.
- Jangan menggunakan harga total nota sebagai harga satuan.
- Jangan membuat item inventory baru hanya karena berbeda level kemasan.

#### Output gate

Phase 0 menghasilkan:

1. Audit matrix 159 item.
2. Daftar 35 recipe dan unit setiap ingredient.
3. Daftar item yang harus ditimbang atau dikonfirmasi supplier.
4. Daftar HPP yang boleh dihitung dan yang harus `HPP_REVIEW`.
5. Baseline quantity/value sebelum migration.

Tidak boleh masuk Phase 1 migration jika masih ada item `READY` yang tidak memiliki `target_base_unit`, `price_unit`, atau conversion factor yang dibutuhkan.

### Phase 6 — Flow baru dan integrasi

Periksa dan sesuaikan:

- `supabase/functions/record-financial-transaction/index.ts`
- `supabase/functions/yumi-ai/index.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `packages/yumipos-web-shared/src/hooks/use-hybrid-pos-data.ts`
- `apps/admin/src/hooks/use-hybrid-finance-analytics-data.ts`
- `apps/pos/src/hooks/use-hybrid-pos-data.ts`
- `yumi-finance-agent/finance.py`
- `yumi-finance-agent/daily_accounting_report.py`
- `scripts/sync-inventory-prices-from-expenses.py`

Jangan menulis HPP sebagai expense kas baru dari lebih dari satu caller.

## 7. Multi-Source Data Flow

```text
Receipt image
    ↓ Hermes/Codex visual analysis
Expense transaction
    ↓
Inventory purchase movement
    ↓
Inventory latest cost
    ↓
Recipe ingredient cost
    ↓
HPP calculation
    ↓
Order hppSnapshot
    ↓
Sale usage movement
    ↓
COGS + inventory reduction
    ↓
P&L / Cash Flow / Shift Report
```

Sumber kebenaran:

- Total struk: gambar struk yang diverifikasi.
- Harga inventory: harga satuan struk + unit conversion.
- HPP histori: `hppSnapshot` saat order dibuat.
- Stok saat ini: inventory movement ledger.
- Cash flow: actual cash transactions saja.

## 8. UI/UX Specification

Tidak perlu membuat halaman baru pada fase pertama. Update tampilan finance yang sudah ada:

- Label `HPP/COGS` harus berbeda dari `Pengeluaran Kas`.
- Filter transaksi:
  - Semua transaksi,
  - Pengeluaran kas,
  - HPP/COGS non-cash,
  - Income.
- Detail transaksi menampilkan:
  - nominal,
  - kategori,
  - merchant,
  - foto struk,
  - status koreksi,
  - sumber order untuk HPP jika ada.
- State wajib:
  - loading,
  - empty,
  - error,
  - saving,
  - success.
- Tidak menampilkan metadata teknis mentah kepada user biasa.
- Gunakan table-first layout untuk audit banyak transaksi.
- Stock opname memakai `operational_unit` sebagai angka utama: contoh `2 box`, bukan `2.000 ml`.
- Sediakan input opsional untuk isi kemasan terbuka, contoh `2 box + 350 ml`.
- Tampilkan `system quantity`, `counted quantity`, dan `variance` secara terpisah.
- Pada absen keluar, tampilkan hanya item kritis sesuai `operational_area`; jangan memaksa karyawan menghitung seluruh inventory.
- Tombol utama cukup `Simpan Stock Opname` lalu finalizer memakai `Finalisasi & Absen Keluar`.

## 9. AI/Telegram/Purchasing Integration

### Hermes/Codex visual audit

- Dipakai untuk validasi nominal dan item struk.
- Nomor rekening, telepon, barcode, dan kode nota tidak boleh diperlakukan sebagai harga.
- Struk ambigu ditandai review.

### Yumi Finance Agent

- Expense OCR menyimpan `scanItems` terstruktur.
- Smart total memakai jumlah subtotal item jika total OCR tidak masuk akal.
- Expense purchase boleh memicu restock hanya melalui flow yang terkontrol.
- HPP order tidak boleh dibuat sebagai pembelian inventory baru.

### Purchasing Agent

- Membaca purchase/inventory movement.
- Tidak boleh menganggap transaksi `order_cogs` sebagai pembelian baru.
- Notifikasi low stock berdasarkan quantity inventory, bukan nominal HPP.

### Telegram notifications

- Purchase expense dan order COGS harus memiliki label berbeda.
- COGS non-cash tidak boleh diberi label sebagai kas keluar.

## 10. No-Hardcode Audit

Tidak boleh hardcode:

- harga bahan,
- conversion factor,
- cost per unit,
- target revenue,
- kategori HPP,
- mapping account,
- status payment.

Semua berasal dari:

- `pos.inventory`,
- `pos.recipes`,
- `pos.financial_transactions`,
- `pos.financial_targets`,
- COA/config database.

Temporary placeholder hanya boleh digunakan untuk record yang memang belum memiliki data sumber dan harus ditandai sebagai review.

## 11. Testing and Verification

### Database tests

- Setiap purchase expense hanya menghasilkan satu inventory movement.
- Setiap completed/paid order hanya menghasilkan satu COGS movement.
- HPP tidak menghasilkan cash outflow kedua.
- Debit = Kredit.
- Order lama tetap memiliki HPP snapshot yang sama.
- HPP tanpa order link terdeteksi.
- Duplicate source/fingerprint ditolak.

### Report tests

- Cash Flow tidak memasukkan `order_cogs`.
- P&L memasukkan HPP tepat satu kali.
- Gross profit = revenue − HPP.
- Net profit = gross profit − operating expense.
- Inventory value memakai cost basis yang konsisten.
- Shift report memisahkan actual expense dan COGS.

### Application tests

```bash
cd /opt/djiwatentramapp
bunx turbo build
```

Typecheck/test target:

- `packages/yumipos-web-shared`
- `apps/admin`
- `apps/pos`
- `yumi-finance-agent` dengan `py_compile`
- unit test perhitungan HPP dan report filter.

### Live DB verification

Setelah migration/backfill:

```sql
-- HPP tidak menjadi cash outflow
SELECT transaction_kind, is_cash_outflow, COUNT(*), SUM(amount)
FROM pos.financial_transactions
WHERE transaction_kind = 'order_cogs'
GROUP BY transaction_kind, is_cash_outflow;

-- Accounting harus balanced
SELECT transaction_source_id,
       SUM(amount) FILTER (WHERE entry_type = 'debit') AS debit,
       SUM(amount) FILTER (WHERE entry_type = 'kredit') AS kredit
FROM public.accounting_entries
GROUP BY transaction_source_id
HAVING SUM(amount) FILTER (WHERE entry_type = 'debit')
    <> SUM(amount) FILTER (WHERE entry_type = 'kredit');
```

## 12. Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Histori HPP berubah | Jangan ubah `hppSnapshot` lama |
| Stok bertambah dua kali | Audit purchase log dan idempotency sebelum sync |
| HPP masih masuk cash flow | Gunakan `is_cash_outflow=false` dan filter report |
| HPP tanpa order link | Tandai review, jangan ditebak |
| Unit kg/gram/pack tertukar | Validasi unit pair dan conversion factor |
| Duplicate inventory item | Gunakan source ID/alias yang unik |
| Trigger lama tetap membuat Kredit Kas | Migration/update trigger wajib diuji dengan transaksi dummy di staging |
| Laporan lama berubah drastis | Buat before/after reconciliation report |
| Deployment parsial | Database schema dan frontend report dirilis berpasangan |

## 13. Acceptance Criteria

Plan dianggap berhasil diimplementasikan apabila:

- Pengeluaran pembelian hanya merepresentasikan cash outflow nyata.
- HPP order tercatat sebagai COGS non-cash.
- HPP mengurangi nilai inventory, bukan Kas.
- Tidak ada double count purchase expense + HPP di cash flow.
- P&L menampilkan Revenue, HPP, Gross Profit, Operating Expense, dan Net Profit secara benar.
- Semua historical order mempertahankan `hppSnapshot`.
- Lima HPP tanpa order link sudah memiliki status audit yang jelas.
- Harga inventory dapat diperbarui dari struk dengan unit yang valid.
- Quantity inventory tidak berubah akibat koreksi harga saja.
- Satu item bahan tidak digandakan hanya karena memiliki karton, box, dan ml.
- Seluruh 159 inventory item memiliki hasil klasifikasi unit atau status review yang jelas.
- Semua item memiliki base unit, purchase unit, dan operational unit hanya jika faktor konversinya tervalidasi.
- Fresh food tidak dipaksa memakai model packaging cair.
- Bahan ikat dapat menyimpan berat aktual per ikat jika beratnya bervariasi.
- Recipe selalu menyimpan pemakaian dalam base unit yang valid.
- Pembelian karton terkonversi benar menjadi base quantity.
- Stock opname menampilkan unit operasional dan menyimpan hasil konversi base quantity.
- Box/kemasan terbuka dapat dicatat tanpa membulatkan stok secara diam-diam.
- Finalisasi stock opname hanya mengubah inventory satu kali dan memiliki audit actor/source.
- Accounting entries balanced.
- Semua perubahan database additive dan dapat diverifikasi sebelum/ sesudah.

## 14. Execution Order

```text
Phase 0: Audit matrix 159 inventory item, 35 recipe, unit conversion, dan readiness gate
Wave 1: Read-only audit schema, HPP link, duplicate, dan report baseline
Wave 2: Migration additive untuk classification/non-cash marker dan inventory movement ledger
Wave 3: Update accounting trigger/function
Wave 4: Update report filters dan finance analytics
Wave 5: Update purchase → inventory cost flow dengan base unit dan packaging level
Wave 6: Implement stock opname operational unit pada flow absen keluar
Wave 7: Test live DB + application build
Wave 8: Reconciliation before/after + selective deployment
```

## 15. Operational-Safe Rollout Strategy

Karena aplikasi dan operasional berjalan setiap hari, implementasi tidak boleh dilakukan sebagai big-bang migration. Gunakan pola:

```text
Tambah → jalankan paralel → bandingkan → pilot → cutover bertahap
```

### 15.1 Prinsip zero/minimal downtime

- Jangan langsung mengubah atau menghapus `unit`, `quantity`, recipe, HPP histori, atau transaksi lama.
- Semua schema change harus additive: kolom nullable, tabel baru, view baru, RPC baru, dan index yang aman.
- Frontend baru harus backward-compatible dengan data lama.
- Backend harus menerima payload lama dan baru selama masa transisi.
- Feature flag harus default `OFF` saat pertama deploy.
- Tidak ada stock opname wajib untuk semua karyawan sebelum pilot berhasil.
- HPP lama dan HPP normalized tidak boleh langsung saling menimpa.

### 15.2 Fase rollout produksi

```text
1. Read-only audit dan baseline
2. Migration additive
3. Deploy backend backward-compatible
4. Deploy frontend dengan feature flag OFF
5. Dual-write movement ledger
6. Shadow HPP/report calculation
7. Pilot satu area dan satu shift
8. Rekonsiliasi
9. Cutover pada pergantian shift
10. Aktivasi bertahap per area
```

### 15.3 Phase A — Read-only baseline

Tidak ada write ke data operasional. Simpan baseline:

- total quantity inventory,
- total nilai inventory,
- total purchase expense,
- total operating expense,
- total HPP/COGS,
- total revenue,
- total debit dan kredit,
- jumlah recipe dan ingredient reference.

Baseline harus memiliki count/checksum per dataset agar before/after dapat diverifikasi.

### 15.4 Phase B — Schema additive

Tambahkan schema baru tanpa memaksa aplikasi lama menggunakannya:

- `pos.inventory_packaging_levels` jika field existing tidak cukup.
- `pos.inventory_movements` sebagai ledger audit.
- classification fields untuk base/purchase/operational unit.
- `transaction_kind`, `is_cash_outflow`, dan `cogs_order_source_id`.
- RPC idempotent untuk purchase, sale usage, dan final stock opname.

Migration tidak boleh:

- `DROP COLUMN`.
- `DROP TABLE`.
- rename kolom penting.
- overwrite quantity massal.
- mengubah HPP histori.

### 15.5 Phase C — Dual-write

Selama masa transisi, write lama tetap berjalan dan ledger baru ikut dicatat:

```text
Purchase:
  financial transaction lama
  + inventory quantity lama
  + inventory movement baru

Sale:
  order/revenue lama
  + inventory deduction lama
  + sale_usage movement baru
```

Dual-write wajib memakai idempotency berdasarkan:

```text
source_type + source_id + inventory_id + movement_type
```

Jika ledger gagal:

- jangan membatalkan order yang sudah valid,
- tandai event untuk retry,
- jangan membuat movement kedua,
- tampilkan alert operasional untuk reconciliation.

Sumber tampilan utama tetap data lama sampai shadow reconciliation lulus.

### 15.6 Phase D — Shadow calculation

Hitung HPP dan report baru tanpa mengubah hasil existing:

```text
HPP existing
HPP normalized base-unit
```

Bandingkan:

- product ID,
- recipe ingredient,
- unit,
- conversion factor,
- cost per base unit,
- HPP lama,
- HPP baru,
- selisih nominal dan persentase.

Jika selisih melewati threshold yang ditentukan, status menjadi `HPP_REVIEW` dan tidak ikut cutover otomatis.

### 15.7 Phase E — Feature flag dan pilot

Feature flag default:

```text
inventory_base_unit_v2 = false
operational_stock_opname = false
non_cash_cogs_reporting = false
```

Aktifkan hanya untuk satu area dan satu shift terlebih dahulu, misalnya Bar:

```text
Bar     : ON
Kitchen : OFF
Gudang  : OFF
```

Stock opname pilot:

- hanya item kritis,
- tampilkan operational unit,
- dukung kemasan terbuka,
- simpan audit snapshot,
- belum menjadi blocker global untuk absen keluar.

### 15.8 Phase F — Cutover aman

Cutover dilakukan pada pergantian shift, bukan saat transaksi padat:

1. Ambil baseline inventory final.
2. Pastikan tidak ada write batch yang sedang berjalan.
3. Verifikasi ledger dan quantity sama.
4. Aktifkan source of truth baru untuk area pilot.
5. Jalankan satu transaksi pembelian dan satu order representatif.
6. Baca ulang inventory, HPP, accounting, dan report.
7. Jika valid, aktifkan area berikutnya.

Tidak perlu downtime penuh; cukup window singkat untuk finalisasi baseline dan perubahan feature flag.

### 15.9 Rollback operasional

Rollback harus dapat dilakukan tanpa menghapus schema/data baru:

| Komponen | Rollback |
|---|---|
| Packaging levels | Feature flag OFF, kembali ke field lama |
| Movement ledger | Kembali membaca quantity lama |
| HPP normalized | Kembali memakai HPP snapshot existing |
| Stock opname baru | Matikan flag dan kewajiban opname |
| Accounting baru | Kembalikan report ke klasifikasi sebelumnya |
| Frontend | Deploy bundle sebelumnya |
| Migration | Jangan drop; biarkan nullable dan tidak aktif |

Jika terjadi mismatch quantity, hentikan cutover area tersebut, pertahankan histori, dan buat reconciliation report sebelum retry.

### 15.10 Release dependency graph

```text
Migration additive
    ↓
Verify columns/tables/RPC/grants
    ↓
Deploy backward-compatible backend
    ↓
Deploy frontend feature flag OFF
    ↓
Enable dual-write
    ↓
Shadow reconciliation
    ↓
Pilot area
    ↓
Accounting/report cutover
    ↓
Gradual activation
```

Frontend tidak boleh memanggil kolom, view, atau RPC baru sebelum schema production diverifikasi. Jangan menjalankan global migration push jika ada migration tidak terkait atau duplicate version yang belum diaudit.