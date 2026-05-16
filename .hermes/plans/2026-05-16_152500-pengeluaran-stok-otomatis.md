# Plan: Sistem Pengeluaran Stok Otomatis Multi-Sumber

**Tanggal:** 2026-05-16
**Status:** v2 — после analisis sumber data
**Author:** Hermes

---

## 1. Goal

Mengintegrasikan pengeluaran biaya bahan baku dari **3 sumber** (menu POS, Telegram Yumi Finance Agent, OCR struk belanja) agar:

- ✅ **Kolom Stok** `pos.inventory.quantity` bertambah (+qty)
- ✅ **Harga Terakhir** `pos.inventory.last_purchase_price` terupdate
- ✅ **Yumi Purchasing Agent** mencocokkan dan memberikan rekomendasi supplier termurah
- ✅ **Yumi Finance Agent** mencatat transaksi keuangan
- ✅ **Data matching** nama bahan antar sumber via fuzzy match dengan AI

---

## 2. Current Context / Existing Infrastructure

### Sudah Ada — 3 Sumber Pengeluaran

#### Sumber A: Web App `/admin/finance` — NewTransactionDialog
- **File:** `apps/web/src/routes/admin/finance/-components/new-transaction-dialog.tsx`
- **Flow:** User input expense + items (line items dengan scanItems) → `recordExpenseIntake()` → `financial_transactions` + auto restok inventory
- **Sync logic:** Hanya jika kategori = `belanja_stok` / `pembelian_stok` / `bahan_baku` (fungsi `isInventorySyncCategory()` di line 88)
- **Items:** `normalizedLineItems[]` → name, qty, price, total, unit
- **Write:** `useHybridRecordExpenseIntake()` di `use-hybrid-write-actions.ts:3853` — gateway → direct insert fallback → restok inventory per-item + `syncMenuStock()`

#### Sumber B: Telegram Yumi Finance Agent (OCR & Manual)
- **Dir:** `/opt/djiwatentramapp/yumi-finance-agent/`
- **Flow:** Foto struk / text → AI parse items → `record_transaction()` → `financial_transactions` + restok inventory
- **4 entry points:** `_handle_receipt_callback` (single), `_handle_bulk_callback` (album), `_handle_bulkitem_callback` (album per-item), `on_text` record_expense (manual)
- **Write:** Semua lewat `finance.record_transaction()` → edge function `yumi-ai` → `pos.financial_transactions`
- **Restok:** Per-item, via `_restok_bulk_items()` internal

#### Sumber C: Sidebar `/menu` — ExpenseForm
- **File:** `apps/web/src/components/pos/menu-sidebar.tsx`
- **Flow:** Form expense di sidebar menu → `recordExpenseIntake()` via `useHybridRecordExpenseIntake`
- **Items:** Mirip NewTransactionDialog — name, qty, price
- **Write:** Sama hook dengan Sumber A

### Shared Write Hook: `useHybridRecordExpenseIntake()`

**File:** `apps/web/src/hooks/use-hybrid-write-actions.ts:3853-4100`

Ini adalah **satu-satunya titik** yang melakukan dual-write:
1. **Financial transaction** — via gateway `record-financial-transaction` edge function
2. **Restok inventory** — per-item: match nama → create if not exist → `addStock(qty, costPerUnit)`
3. **Sync menu stock** — `syncMenuStock()` after restok

**Keputusan arsitektur penting:** Hook ini adalah frontend-side code. Berjalan di browser user. Artinya:
- ✅ Bisa gagal karena network
- ✅ Tidak bisa real-time (harus menunggu user submit)
- ✅ Tidak bisa polling dari sini

### Data yang Tersedia di `pos.financial_transactions`

| Field | Value untuk Expense | Sumber |
|---|---|---|
| `tx_type` | "expense" | Semua sumber |
| `category` | "belanja_stok", "bahan_baku", etc | Semua sumber |
| `merchant` | Nama toko | OCR / Manual |
| `metadata.scanItems` | `[{name, quantity, price, total, unit}]` | Semua sumber (jika ada items) |
| `metadata.source` | "yumi_finance_agent" / "manual_form" / "ocr" | Bergantung sumber |
| `amount` | Total nominal | Semua sumber |
| `source_fingerprint` | SHA256 hash | Via edge function / hook |

| Komponen | Status | Detail |
|---|---|---|
| `useHybridRecordExpenseIntake()` | ✅ Live | Web app + Telegram → `financial_transactions` + auto-restok inventory |
| `useHybridApplyInventoryStockAction()` | ✅ Live | CRUD stok: add/usage/adjust + write `inventory_transactions` |
| `ExpenseForm` di menu sidebar | ✅ Live | Form expense `/menu` dengan `willSyncInventory` |
| `new-transaction-dialog.tsx` di finance page | ✅ Live | Dialog finance dengan sync inventory |
| OCR flow (`yumi-finance-agent/app.py`) | ✅ Live | Foto struk → parse item → restok inventory per-item |
| Manual text flow | ✅ Live | Input teks → AI parse → `record_expense` + restok |
| `useHybridDeductOrderInventory()` | ✅ Live | Deduct order dari menu → kurangi stok inventory |
| `useHybridSyncMenuStockFromInventory()` | ✅ Live | Sinkron stok menu dari inventory |
| **Yumi Purchasing Agent** (@YumiPurchasingBot) | ✅ Live | Marketlist, supplier recommendation, stok menipis |
| **Yumi Finance Agent** (@YummeFinanceAIbot) | ✅ Live | OCR, expense/income, saldo, AI chat |

### Belum Ada / Gap

| Gap | Dampak |
|---|---|
| Expense dari `/menu` (non-stock kategori) belum restok inventory | Item bahan beli di menu tidak nambah stok |
| Yumi Purchasing Agent tidak otomatis match expense baru | User harus manually rekomendasi supplier |
| Tidak ada AI matching nama bahan antar sumber | "Tepung Terigu" vs "Tepung Terigu Kompas" jadi duplicate item |
| Harga terakhir tidak update konsisten dari semua sumber | `lastPurchasePrice` kadang tidak terisi |
| Belum ada notifikasi ke Purchasing Agent saat ada expense | Marketlist tidak otomatis terupdate |

---

## 3. Analisis: Ambil Data dari `/admin/finance/transactions`?

### Pertanyaan Kunci

> "Apakah lebih baik Purchasing Agent polling data dari `pos.financial_transactions` (via `/admin/finance/transactions`) daripada menerima notifikasi dari Finance Agent?"

### Argumen **Setuju — Pakai `financial_transactions` sebagai Source of Truth**

| Kelebihan | Detail |
|---|---|
| **Single source of truth** | Semua expense dari 3 sumber sudah masuk ke `financial_transactions`. Tidak perlu subscribe multiple entry points |
| **Metadata lengkap** | `scanItems` di metadata sudah berisi item name, qty, price — langsung bisa dipakai untuk matching |
| **Tidak perlu HTTP notif** | Purchasing Agent cukup polling `financial_transactions` — lebih reliable dari fire-and-forget HTTP |
| **Backfill otomatis** | Expense yang masuk sebelum Purchasing Agent online tetap terdeteksi |
| **Sederhana** | Satu endpoint, satu logika query, satu format data |

### Argumen **Tidak Setuju — Better via Notifikasi Langsung**

| Kelebihan | Detail |
|---|---|
| **Real-time** | Polling punya delay (30-60 detik). Notifikasi langsung zero delay |
| **Tanpa kategori filtering** | `financial_transactions` campur aduk income + expense. Purchasing harus filter `tx_type=expense` + filter kategori belanja saja |
| **Deduplication overhead** | Purchasing harus track `source_id` yang sudah diproses — sama repotnya dengan listen webhook |
| **Metadata.scanItems tidak selalu ada** | Expense tanpa items (tanpa scanItems) tidak relevan untuk purchasing. Filter tambahan |

### ⚠️ **Critical Issue: Telepon Siapa?**

Ini yang membedakan kedua pendekatan secara fundamental:

| Aspek | Polling `financial_transactions` | Notifikasi dari Finance Agent |
|---|---|---|
| **Siapa yang telepon** | Purchasing Agent polling ke Supabase REST API | Finance Agent HTTP POST ke Purchasing Agent |
| **Ketergantungan** | Purchasing butuh akses ke Supabase (service_role key) | Purchasing butuh HTTP endpoint |
| **Keandalan** | ✅ Tinggi — Supabase jarang down | ⚠️ Medium — Purchasing Agent bisa down |
| **Delay** | Polling 30-60 detik | Real-time |
| **Kompleksitas** | Sederhana (1 query + dedup) | Medium (HTTP server + dedup) |

### ⭐ Rekomendasi: Hybrid — Polling `financial_transactions` sebagai Source of Truth

**Keputusan:** Pakai **polling `financial_transactions`** sebagai mekanisme utama, **bukan** HTTP notif. Alasannya:

1. **Keandalan:** Supabase REST API lebih reliable daripada HTTP antar-agent yang bisa mati / restart
2. **Single source of truth:** Semua expense dari mana pun sudah ada di `financial_transactions`. Polling dari sini = coverage 100%
3. **Sederhana:** Tidak perlu ubah Finance Agent di 4 entry points. Cukup tambah cron di Purchasing Agent
4. **Backfill:** Expense lama ikut terproses

### Detail Implementasi Polling

```python
# Di yumi-purchasing-agent/app.py
POLL_INTERVAL = 30  # detik

async def _poll_new_expenses():
    """Poll financial_transactions untuk expense baru yang belum diproses."""
    processed_ids = set()  # In-memory, bisa di-persist ke file
    while True:
        try:
            # Cek expense dengan scanItems dalam 7 hari terakhir
            seven_days_ago = (datetime.now() - timedelta(days=7)).timestamp() * 1000
            response = await supabase
                .from_("pos_financial_transactions")  # public view
                .select("source_id, amount, category, merchant, metadata, tx_date")
                .eq("tx_type", "expense")
                .gte("tx_date", seven_days_ago)
                .order("tx_date", desc=True)
                .limit(50)
            
            for tx in response.data:
                sid = tx.get("source_id", "")
                if sid in processed_ids:
                    continue
                metadata = tx.get("metadata") or {}
                items = metadata.get("scanItems") or []
                if not items:
                    continue  # Skip expense tanpa items
                
                # Proses match ke inventory
                match_result = await _match_expense_items(sid, items)
                if match_result.get("has_match"):
                    await _send_purchasing_recommendation(sid, match_result)
                
                processed_ids.add(sid)
        except Exception as e:
            logger.error(f"[POLL] Error: {e}")
        
        await asyncio.sleep(POLL_INTERVAL)
```

### Kenapa polling lebih baik daripada HTTP-notify kasus ini:

```
Situasi: Finance Agent restok inventory berhasil.
          → Dia kirim HTTP ke Purchasing Agent.
          → Purchasing Agent sedang restart (deploy update).
          → HTTP request gagal. Expense tidak terproses.

Situasi: Finance Agent restok inventory berhasil.
          → Purchasing Agent polling 30 detik kemudian.
          → Expense terdeteksi. Terproses.

Situasi: Finance Agent baru saja restart. History expense tetap ada di DB.
          → Purchasing Agent polling pertama langsung deteksi semuanya.
          → Tanpa perlu replay dari Finance Agent.
```

### Filtering Rules

Purchasing Agent hanya proses expense yang memenuhi:
1. `tx_type == "expense"`
2. `metadata.scanItems` tidak kosong (ada items)
3. `category` termasuk belanja_inventory (belanja_stok, bahan_baku, pembelian_stok) — atau SEMUA kategori jika ingin match nama item ke inventory
4. `source_id` belum pernah diproses

Transaksi yang dilewati:
- ✅ Income (`tx_type=income`) — skip
- ✅ Expense kategori non-inventory (gaji, sewa, listrik) — opsional, tergantung konfigurasi

---

## 4. Proposed Approach (Final)

### Arsitektur Final

```
┌─────────────────────┐     ┌──────────────────────┐
│  Telegram Finance    │     │  Web /menu Expense    │
│  OCR / Manual Text   │     │  Form & Kas Tab       │
└────────┬────────────┘     └──────────┬───────────┘
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────┐
│          pos.financial_transactions         │
│  • Semua expense dari 3 sumber masuk sini   │
│  • metadata.scanItems = item detail         │
│  • metadata.source = asal expense            │
└────────────────────┬────────────────────────┘
                     │ Polling 30 detik
                     ▼
┌─────────────────────────────────────────────┐
│     Yumi Purchasing Agent (@YumiPurchasing) │
│  • Poll pos_financial_transactions          │
│  • Filter: tx_type=expense, scanItems ada   │
│  • AI Match: nama item → existing inventory │
│  • Rekomendasi supplier termurah            │
│  • Kirim notif ke grup Stock/Marketlist     │
└─────────────────────────────────────────────┘

Catatan: Finance Agent tetap melakukan restok inventory seperti biasa.
Purchasing Agent hanya membaca expense FINISHED untuk matching + rekomendasi.
```

### Data Flow Detail

**Flow A — Expense via Telegram Finance (OCR/Manual):**
```
Foto struk / text → AI parse items → record_transaction()
  → pos.financial_transactions.tx_type=expense
  → for each item: match inventory by name (fuzzy AI)
    → if match: addStock(qty, costPerUnit)
    → if no match: create new inventory + addStock
  → notify Purchasing Agent via HTTP
```

**Flow B — Expense via Web /menu (ExpenseForm / Kas tab):**
```
User input items → useHybridRecordExpenseIntake()
  → financial_transactions created via gateway
  → for each item: match inventory → addStock
  → syncMenuStock()
  → (NEW) notify Purchasing Agent via HTTP
```

**Flow C — Purchasing Agent Auto-Match:**
```
(New) /match-expense {source_id} — Cek expense baru
  → fetch scanItems dari metadata
  → fuzzy match ke pos_inventory (nama + brand)
  → rekomendasi supplier termurah (dari histori)
  → kirim ke grup Stock/Marketlist
```

---

## 5. Database Schema

### Existing (no migration needed)

```sql
-- pos.inventory (sudah ada)
source_id, ingredient_name, unit, quantity, low_stock_threshold,
display_unit, conversion_factor, unit_conversions, 
base_recipe_source_id, default_brand_name, 
preferred_store_source_id, preferred_purchase_quantity, 
preferred_purchase_unit, last_purchase_price, last_purchase_at,
last_purchase_store_source_id, category, aliases

-- pos.inventory_transactions (sudah ada)
source_id, inventory_source_id, quantity, tx_type, cost_per_unit,
remaining_quantity, tx_timestamp, notes, expiry_date, brand_name,
store_source_id, purchase_unit, purchase_quantity, line_total,
source_label, source_fingerprint, creation_time, raw

-- pos.financial_transactions (sudah ada)
source_id, tx_type, amount, category, merchant, description,
tx_date, payment_method, status, metadata (JSONB: {scanItems, ...})
```

### Perubahan: `inventory_transactions` tambah `source_fingerprint` untuk dedup

```sql
-- Sudah ada, cukup verifikasi index
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_tx_source_fingerprint 
  ON pos.inventory_transactions (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;
```

---

## 6. Step-by-Step Plan

### Phase 1: Purchasing Agent — New Endpoint `/match-expense`

**File:** `yumi-purchasing-agent/app.py`

1. Tambah handler `_handle_match_expense(update, source_id)`
   - Fetch `financial_transactions` by source_id
   - Parse `metadata.scanItems`
   - For each item, fuzzy match to `pos_inventory` using:
     - `ilike` name search
     - AI matching via SumoPod for ambiguous names
   - Group matched items by `preferredStoreId`
   - Return formatted recommendation

2. Tambah cron/daemon yang polling `inventory_transactions` baru setiap 60 detik
   - Cek `tx_type = 'add' AND source_fingerprint NOT IN processed_set`
   - Auto-match dan kirim rekomendasi ke grup Stock

3. Tambah inline keyboard untuk approve/reject rekomendasi supplier

### Phase 2: Purchasing Agent — Polling `financial_transactions` (Replacement)

**File:** `yumi-purchasing-agent/app.py`

Tambah background task polling `financial_transactions` setiap 30 detik:

```python
POLL_INTERVAL = 30  # detik
PROCESSED_CURSOR_FILE = "/tmp/purchasing_processed_cursor.txt"

def _load_processed_cursor() -> set:
    """Load source_id yang sudah diproses dari file (persist across restart)."""
    try:
        with open(PROCESSED_CURSOR_FILE) as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        return set()

def _save_processed_cursor(processed: set):
    """Simpan source_id yang sudah diproses."""
    with open(PROCESSED_CURSOR_FILE, "w") as f:
        for sid in processed:
            f.write(f"{sid}\n")

async def _poll_financial_transactions(app):
    """Poll expense baru dari financial_transactions."""
    processed = _load_processed_cursor()
    while True:
        try:
            seven_days_ago = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
            response = await app.supabase \
                .from_("pos_financial_transactions") \
                .select("source_id, amount, category, merchant, metadata, tx_date") \
                .eq("tx_type", "expense") \
                .gte("tx_date", seven_days_ago) \
                .order("tx_date", desc=True) \
                .limit(50)
            
            for tx in response.data or []:
                sid = tx.get("source_id", "")
                if sid in processed:
                    continue
                metadata = tx.get("metadata") or {}
                items = metadata.get("scanItems") or []
                if not items:
                    processed.add(sid)
                    continue
                
                match_result = await _match_expense_items(sid, items)
                if match_result.get("has_match"):
                    await _send_purchasing_recommendation(sid, match_result, tx, app.bot)
                
                processed.add(sid)
            
            _save_processed_cursor(processed)
        except Exception as e:
            logger.error(f"[POLL] Error: {e}")
        
        await asyncio.sleep(POLL_INTERVAL)
```

Jalankan di `main()` sebagai background task:

```python
asyncio.ensure_future(_poll_financial_transactions(app))
```

### Phase 3: Purchasing Agent — `/match-expense` Manual Command

**File:** `yumi-purchasing-agent/app.py`

Untuk user yang ingin trigger manual:

```python
async def _handle_match_expense(update, source_id: str = None):
    """Match expense items ke inventory — trigger manual via Telegram."""
    if not source_id:
        # Parse dari pesan user
        text = (update.message.text or "").strip()
        parts = text.split(" ", 1)
        source_id = parts[1] if len(parts) > 1 else None
        if not source_id:
            await update.message.reply_text(
                "Format: /match-expense <source_id>\n"
                "Cek source_id dari /expense-list"
            )
            return
    
    # Fetch financial_transaction
    response = await supabase \
        .from_("pos_financial_transactions") \
        .select("*") \
        .eq("source_id", source_id) \
        .maybe_single()
    
    if not response.data:
        await update.message.reply_text(f"❌ Transaksi {source_id} tidak ditemukan.")
        return
    
    tx = response.data
    items = (tx.get("metadata") or {}).get("scanItems") or []
    if not items:
        await update.message.reply_text(f"ℹ️ Transaksi tidak memiliki item scan.")
        return
    
    result = await _match_expense_items(source_id, items)
    await _send_purchasing_recommendation(source_id, result, tx, update.effective_message.chat.id)
```

### Phase 4: AI Name Matching — Inventory Dedup

**File:** `yumi-purchasing-agent/app.py` + `orchestrator.py`

Buat fungsi AI matching:

```python
async def _ai_match_inventory_name(raw_name: str) -> dict:
    """Match a raw item name to existing inventory via AI."""
    prompt = f"""Cocokkan nama bahan berikut dengan database inventory.
Raw name: "{raw_name}"

Inventory items: {inventory_names}

Return format:
MATCHED: [yes/no]
INVENTORY_ID: [source_id or empty]
CONFIDENCE: [0.0-1.0]
REASON: [alasan singkat dalam Bahasa Indonesia]"""
    
    result = await sp_client.chat(prompt)
    # Parse response
    ...
```

Rules:
- Exact match (case-insensitive) → 100% auto-match
- Fuzzy match (AI confidence >= 0.8) → auto-match
- Low confidence (< 0.8) → flag for manual review
- No match → create new inventory item

### Phase 5: Supplier Price Recommendation

**File:** `yumi-purchasing-agent/app.py`

Tambah di `_handle_match_expense()`:

```python
async def _get_supplier_recommendation(inventory_id: str, item_name: str):
    """Fetch harga supplier termurah untuk item tertentu."""
    # Query inventory_transactions untuk item ini
    # Group by store_source_id
    # Hitung average_price per store
    # Recommend cheapest + suggestedPurchaseQuantity
    
    transactions = await pos.from("inventory_transactions") \
        .select("*") \
        .eq("inventory_source_id", inventory_id) \
        .eq("tx_type", "add") \
        .order("tx_timestamp", {ascending: False}) \
        .limit(20)
    
    # Group by store, calculate avg price
    store_prices = {}
    for tx in transactions.data:
        store_id = tx.get("store_source_id")
        if store_id:
            price = tx.get("cost_per_unit")
            if price and price > 0:
                if store_id not in store_prices:
                    store_prices[store_id] = {"prices": [], "count": 0, "last_purchase": 0}
                store_prices[store_id]["prices"].append(price)
                store_prices[store_id]["count"] += 1
                store_prices[store_id]["last_purchase"] = max(
                    store_prices[store_id]["last_purchase"],
                    tx.get("tx_timestamp", 0)
                )
    
    # Recommend cheapest
    cheapest_store_id = min(store_prices, key=lambda s: 
        sum(store_prices[s]["prices"]) / len(store_prices[s]["prices"]))
    
    return {
        "item_name": item_name,
        "cheapest_store_id": cheapest_store_id,
        "avg_price": sum(store_prices[cheapest_store_id]["prices"]) / len(store_prices[cheapest_store_id]["prices"]),
        "purchase_count": store_prices[cheapest_store_id]["count"],
    }
```

---

## 7. Files Likely to Change

| File | Perubahan |
|---|---|
| `yumi-purchasing-agent/app.py` | **New:** Polling cron ke `financial_transactions`, `/match-expense` command, AI match function, supplier recommendation |
| `yumi-purchasing-agent/orchestrator.py` | **New:** `_ai_match_inventory_name()` function untuk fuzzy match nama bahan |
| `yumi-purchasing-agent/requirements.txt` | **New:** `httpx` atau `supabase-py` jika belum ada |
| `yumi-finance-agent/app.py` | ✅ **TIDAK perlu diubah** — polling dari `financial_transactions` sudah coverage semua sumber |
| `apps/web/src/hooks/use-hybrid-write-actions.ts` | ✅ **TIDAK perlu diubah** — data sudah masuk ke `financial_transactions` lewat flow existing |
| `apps/web/src/components/pos/menu-sidebar.tsx` | ✅ **TIDAK perlu diubah** — ExpenseForm sudah write via `recordExpenseIntake` yang sama |

---

## 8. Integration Points

### Yumi Purchasing Agent ↔ `financial_transactions`

| Arah | Metode | Detail |
|---|---|---|
| Purchasing → Supabase | Polling 30 detik | Query `financial_transactions` untuk `tx_type=expense` baru dengan `scanItems` |

**Tidak ada integrasi langsung Finance Agent → Purchasing Agent.** Semua komunikasi lewat database.

### Yumi Purchasing Agent ↔ `pos.inventory` (untuk AI Match)

| Action | Table | Purpose |
|---|---|---|
| Fetch existing inventory | `pos.inventory` (public view) | Nama + brand untuk fuzzy matching |
| Fetch price history | `pos.inventory_transactions` | Supplier recommendation (avg price per store) |

### Telegram Bot Commands

| Command | Agent | Description |
|---|---|---|
| `/match-expense <source_id>` | Purchasing | Manual match expense ke inventory |
| `/rekomendasi-supplier <nama_bahan>` | Purchasing | Cari supplier termurah |

---

## 9. UI/UX Spec

### ExpenseForm (/menu) — Tambah Info Sync

Di form yang sudah ada (`menu-sidebar.tsx` `ExpenseForm`), tambah label kecil:

```
Items:
  • Tepung Terigu x5 kg @ Rp11.000
  • Gula Pasir x2 kg @ Rp18.000
  ─────────────────────
  ✅ Stok inventory: +7 item
  ✅ Harga terakhir terupdate
  ✅ Supplier akan direkomendasikan
```

### Telegram — Notifikasi Match

Setelah expense, Yumi Purchasing kirim ke grup Stock:

```
📦 Expense Match — 16/05 15:25
────────────
🧾 EXP-abc123
💰 Rp91.000 — Toko Bahan Jaya

✅ Cocok: 5/5 item
📍 Supplier termurah: Toko Bahan Jaya
🔍 Rekomendasi lain: Toko Murni (Rp2.000 lebih murah per kg)

[🔁 Match Ulang] [📋 Detail]
```

---

## 10. Tests & Validation

### Per-Phase Test

**Phase 1 (Purchasing Agent: `/match-expense`):**
```bash
# Test manual via Telegram
kirim "/match-expense EXP-abc123" ke @YumiPurchasingBot
# Expected: daftar matched items + supplier recommendation
```

**Phase 2 (Finance notify):**
```bash
# Test OCR → Purchasing notify
kirim foto struk ke grup Finance
# Expected: restok + notif ke Purchasing Agent
```

**Phase 3 (Web app notify):**
```bash
# Test expense via /menu → Purchasing notify
Buat expense di halaman /menu dengan scanItems
# Expected: Purchasing menerima notifikasi
```

**Phase 4 (AI Name Matching):**
```sql
-- Verify dedup
SELECT ingredient_name, count(*) as dups
FROM pos.inventory
GROUP BY ingredient_name
HAVING count(*) > 1;
-- Expected: minimal duplikat setelah AI matching
```

### Database Verification

```sql
-- Cek last_purchase_price terupdate
SELECT source_id, ingredient_name, quantity, last_purchase_price, last_purchase_at
FROM pos.inventory
WHERE source_id = '<inventory_source_id>';
-- last_purchase_price dan last_purchase_at harus terisi

-- Cek inventory_transactions tercatat
SELECT source_id, inventory_source_id, quantity, cost_per_unit, tx_timestamp
FROM pos.inventory_transactions
WHERE inventory_source_id = '<inventory_source_id>'
ORDER BY tx_timestamp DESC;
-- Harus ada record tx_type='add' dengan quantity>0
```

### E2E Test

1. User input expense via form di `/menu` → stok inventory nambah (existing flow)
2. User foto struk via Telegram Finance → stok nambah + harga terupdate (existing flow)
3. Yumi Purchasing Agent polling 30 detik → deteksi expense baru → match → rekomendasi supplier
4. Halaman `/admin/inventory` tampilkan stok & harga terbaru

---

## 11. Risks, Tradeoffs, Open Questions

### Risks

| Risk | Mitigasi |
|---|---|
| **Polling delay** (30 detik) | Acceptable — purchasing recommendation bukan real-time critical |
| **AI matching salah** (nama sama tapi beda produk) | Threshold 0.8 + manual review untuk low confidence. `/match-expense` command untuk re-match |
| **Load pada Supabase** (polling tiap 30 detik) | Query limited 50 rows, filtered by 7 hari terakhir + indexed field. Negligible |
| **Processed cursor file korup** | File-based cursor — gampang di-reset dengan hapus file |

### Tradeoffs

| Opsi A: Polling `financial_transactions` ✅ | Opsi B: Webhook HTTP dari Finance Agent |
|---|---|
| ✅ Simple, no infra tambahan | ✅ Real-time, no delay |
| ✅ Coverage 100% (semua sumber) | ❌ Finance Agent perlu ubah 4 entry points |
| ✅ Backfill otomatis | ❌ HTTP bisa gagal (agent restart) |
| ✅ Tidak perlu ubah Finance/Web code | ❌ Tidak backfill data lama |
| ❌ Delay 30 detik | ❌ Error handling lebih kompleks |
| **Pilihan: Polling** | — |
| **Pilihan: hybrid** — Fire-and-forget + polling backup | |

### Open Questions

1. **Bagaimana expense bulk (album foto)?** — Notif Purchasing sekali dengan semua item dari semua foto
2. **Bagaimana duplicate supplier recommendation?** — Supplier yang sering muncul harus di-prioritaskan (weighted by purchase count)
3. **Perlu UI baru di halaman `/admin/inventory`?** — Mungkin tombol "Match AI" per-item untuk merge duplicate names
4. **Apakah expense category non-belanja_stok juga perlu restok?** — Saat ini hanya kategori `belanja_stok`/`bahan_baku`/`pembelian_stok` yang sync. Mungkin perlu explicit toggle.

---

## 12. Implementation Checklist

- [x] Phase 1: Purchasing Agent — `/match-expense` command + `_match_expense_items()` function
- [x] Phase 2: Purchasing Agent — Polling cron `financial_transactions` + cursor persistence
- [x] Phase 3: Purchasing Agent — `_ai_match_inventory_name()` function (fuzzy match via SumoPod)
- [x] Phase 4: Purchasing Agent — Supplier price recommendation from `inventory_transactions`
- [x] Phase 5: Purchasing Agent — `_send_purchasing_recommendation()` notification ke grup Stock/Marketlist
- [x] E2E test: expense dari semua sumber → Purchasing Agent deteksi → match → rekomendasi
- [x] Update skill `yumi-ai` dengan flow baru polling
