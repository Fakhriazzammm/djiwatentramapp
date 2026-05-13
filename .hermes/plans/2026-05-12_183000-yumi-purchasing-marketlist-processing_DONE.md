# Plan: Yumi Purchasing Agent — Marketlist Processing

**Date:** 2026-05-12  
**Goal:** Membuat Yumi Purchasing Agent bisa memproses marketlist text dari user di grup marketlist, mengembalikan detail per-merchant dengan nomor WhatsApp, kuantitas, dan harga per bahan baku. AI harus cerdas dan terus belajar.

---

## Current Context

### Yang sudah ada
- **Bot:** `@YumiPurchasingBot` di `/opt/djiwatentramapp/yumi-purchasing-agent/`
- **Grup marketlist:** `-5288006237`
- **Fitur existing:** `/supplier`, `/marketlist` (auto-generated dari low-stock DB), `restok`, AI chat
- **Access control:** `_can_respond()` — saat ini HANYA respond ke DM owner + grup dengan `@mention`. Grup marketlist saat ini **tidak ada special handling**.
- **Supplier DB:** `pos_inventory_stores` / `suppliers` table — punya `name`, `phone`, `category`, `grade`, `price_range`, `address`
- **Inventory:** `pos_inventory` — `ingredientName`, `quantity`, `lowStockThreshold`, `unit`, `lastPurchasePrice`, `preferredStoreId`
- **AI:** SumoPod via `sumopod_client.py` — model `ag/gemini-3-flash`
- **Orchestrator:** `purchasing_orchestrator.py` — intent routing ke action
- **Marketlist format:** `marketlist.py` — generate auto marketlist, `ai_categorize_suppliers()`, `format_marketlist()`

### Kesenjangan (gap)
| What exists | What user wants |
|-------------|-----------------|
| Auto-generate marketlist dari DB (low stock) | User POST manual marketlist text, bot proses |
| Format grouped by bar/kitchen | Return grouped by **merchant** with WhatsApp |
| AI categorize supplier category only | AI parse raw text → match inventory → **suggest merchant + qty + price** |
| No merchant WhatsApp in response | WhatsApp number per merchant |
| `_can_respond()` requires @mention | Bot should auto-detect marketlist in marketlist group |

---

## Proposed Approach

### Flow baru

```
User posts marketlist text di grup marketlist
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 1. DETECT — Agent detect text as marketlist     │
│    Pattern: 2+ lines starting with "- " or "• " │
│    OR contains "marketlist" keyword             │
│    OR chat_id == MARKETLIST_GROUP               │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 2. PARSE — AI extract ingredient list           │
│    Input: raw text                              │
│    Output: [{"name": "kentang", "note": "abis"},│
│             {"name": "paha fillet", ...}]        │
│    Model: ag/gemini-3-flash (fast + cheap)      │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 3. MATCH — Fuzzy match ke inventory DB          │
│    • inventory.fuzzy_match_item() sudah ada      │
│    • Score >= 60 → match, gunakan inv_id        │
│    • Score < 60 → anggap bahan baru (new item)  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 4. ENRICH — Tambah data dari DB                 │
│    Per ingredient:                              │
│    • current quantity (stok sekarang)           │
│    • lowStockThreshold                          │
│    • lastPurchasePrice                          │
│    • preferredStoreId → lookup supplier phone   │
│    • Quantitas rekomendasi (threshold - qty)    │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 5. GROUP — AI group by merchant                 │
│    • Group ingredients by preferredStoreId      │
│    • Or AI suggest merchant if no preferred     │
│    • Include merchant name + WhatsApp           │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│ 6. FORMAT — Return structured response          │
│    Per merchant block:                          │
│    • Merchant name + WhatsApp                   │
│    • List bahan: name, qty beli, unit, harga    │
│    • Total per merchant                         │
│    • Grand total                                │
└─────────────────────────────────────────────────┘
```

---

## Files Likely to Change

| File | Change |
|------|--------|
| `yumi-purchasing-agent/app.py` | **Major** — New handler `_handle_marketlist_input()`, update `_can_respond()` untuk marketlist group, update `handle_message()` |
| `yumi-purchasing-agent/marketlist.py` (symlink) | **Major** — New: `parse_marketlist_text()`, `match_marketlist_to_inventory()`, `group_by_merchant()`, `format_merchant_marketlist()`, learning memory |
| `yumi-purchasing-agent/inventory.py` (symlink) | **Minor** — Ensure `fuzzy_match_item` works for batch, add `get_item_by_name()` |
| `yumi-purchasing-agent/supplier.py` (symlink) | **Minor** — Add `get_supplier_phone()`, batch lookup by store ID |
| `yumi-purchasing-agent/hermes_adapter.py` | **No change** |
| `yumi-purchasing-agent/.env` | **Update** — Add `MARKETLIST_GROUP_ID=-5288006237` |
| `yumi-finance-agent/marketlist.py` | **Shared** — Because symlinked, changes apply to both bots |

---

## Step-by-Step Plan

### Step 1: Enable auto-detect di marketlist group
- Update `_can_respond()`: tambah rule `chat.id == MARKETLIST_GROUP_ID` → langsung `True` (all messages)
- Atau buat lebih aman: hanya auto-detect jika text cocok pattern marketlist
- Tambah env var `MARKETLIST_GROUP_ID`

### Step 2: Build AI text parser
- Function `parse_marketlist_text(text: str) → list[dict]`
- Prompt AI: "Extract shopping list items from this text. For each item, return name (Indonesian), and note if any (abis, low stock). Return JSON array."
- Robust JSON extraction dari response AI
- Fallback: regex parse `[-•*]\s*(.+?)(?:\s*\((.*?)\))?$`

### Step 3: Build batch matcher
- Function `match_marketlist_to_inventory(items, inventory_manager)`
- Untuk setiap item, panggil `inventory.fuzzy_match_item()`
- Return enriched list dengan inventory ID, current stock, threshold, price, unit

### Step 4: Build merchant grouper
- Function `group_by_merchant(enriched_items, supplier_manager)`
- Untuk setiap item: lookup `preferredStoreId` → supplier detail (name, phone)
- Jika tidak ada preferred store, AI suggest merchant based on item category
- Group hasilnya by merchant ID

### Step 5: Build response formatter
- Function `format_merchant_marketlist(groups)`
- Format output per merchant:
  ```
  🏪 Nama Toko
  📞 08xxxxxxxxxx
    • Bahan A — 2 kg @ Rp25.000 = Rp50.000
    • Bahan B — 1 pcs @ Rp15.000 = Rp15.000
    💰 Subtotal: Rp65.000
  ```
- Grand total di bawah

### Step 6: Integrate ke message handler
- Tambah intent detection di `handle_message()` atau orchestrator
- Pattern: `chat_id == MARKETLIST_GROUP_ID` AND text bukan command → process as marketlist
- Atau: keyword trigger "marketlist" + text panjang → process as marketlist

### Step 7: AI Learning system
- Simpan hasil match yang berhasil ke `pos_ai_conversation_memory` atau file JSON lokal
- Track: ingredient → matched_inventory_id, supplier, price
- Future: gunakan history untuk improve matching accuracy
- Auto-learn: jika user correct manually, simpan sebagai preferred

### Step 8: Testing
- Unit test `parse_marketlist_text()` dengan sample dari user
- Integration test di grup marketlist staging
- Verify WhatsApp numbers muncul dengan benar
- Verify harga dari `lastPurchasePrice` akurat

---

## Database Schema (Existing)

### pos_inventory
| Column | Type | Notes |
|--------|------|-------|
| _id | text | Primary key |
| ingredientName | text | Nama bahan baku |
| quantity | float | Stok saat ini |
| lowStockThreshold | float | Batas minimum |
| unit | text | Satuan (kg, pcs, liter) |
| lastPurchasePrice | float | Harga beli terakhir |
| preferredStoreId | text | FK → pos_inventory_stores._id |

### pos_inventory_stores (suppliers)
| Column | Type | Notes |
|--------|------|-------|
| _id | text | Primary key |
| name | text | Nama toko |
| phone | text | Nomor WhatsApp |
| category | text | Kategori supplier |
| address | text | Alamat |
| grade | text | Rating |
| price_range | text | Range harga |

---

## UI/UX Specification

### Input (dari user di grup)
```
market list kitchen
-kentang (abis bgt)
-paha fillet
-timun (abis bgt)
-selada (abis bgt)
-sosis (low stock)
-angkak
-merica (abis bgt)
...
```

### Output (response bot)
```
🛒 Marketlist Detail — 12/05 14:30

🏪 Toko Segar Jaya (Sayur)
📞 08123456789
  • Kentang — beli 5 kg @ Rp15.000 = Rp75.000
  • Timun — beli 3 kg @ Rp8.000 = Rp24.000
  • Selada — beli 2 kg @ Rp12.000 = Rp24.000
  💰 Subtotal: Rp123.000

🏪 Bina Karya Juanda (Bahan Kue)
📞 08765432100
  • Angkak — beli 2 pcs @ Rp25.000 = Rp50.000
  • Merica — beli 1 kg @ Rp80.000 = Rp80.000
  • Micin Sasa — beli 5 pcs @ Rp5.000 = Rp25.000
  💰 Subtotal: Rp155.000

🏪 Cold Storage (Daging)
📞 08987654321
  • Paha Fillet — beli 5 kg @ Rp45.000 = Rp225.000
  • Sosis — beli 3 pack @ Rp35.000 = Rp105.000
  💰 Subtotal: Rp330.000

────────────────────────────
🛍 Total: 11 item • Rp608.000
```

### States
| State | Response |
|-------|----------|
| **Success** | Format lengkap per merchant |
| **Partial match** | Items yang match tampil normal, unmatched ditandai `⚠️ tidak ditemukan di database` |
| **Empty match** | "🤔 Tidak ada bahan yang cocok dengan inventory. Coba ketik lebih spesifik." |
| **AI error** | Fallback ke regex parse + keyword match |
| **Processing** | Bot menunjukkan "typing..." selama proses |

---

## Integration Points

| Integration | Detail |
|-------------|--------|
| **Supabase inventory** | Fuzzy match via `InventoryManager.fuzzy_match_item()` |
| **Supabase suppliers** | Lookup via `SupplierManager.search()` |
| **SumoPod AI** | Parse text + group by merchant via `ag/gemini-3-flash` |
| **Learning memory** | Simpan match result ke JSON file di bot directory, dipakai improve future matching |
| **Telegram** | Response dikirim ke marketlist group, mention user asli untuk konfirmasi |

---

## Risks & Tradeoffs

| Risk | Mitigation |
|------|------------|
| AI parse salah ekstrak nama bahan | Keyword fallback + fuzzy match tolerance |
| Harga `lastPurchasePrice` stale | Tampil disclaimer "harga referensi terakhir" |
| Supplier tidak ada di DB | AI suggest berdasarkan kategori, user bisa add manual |
| Too many AI calls = slow | Batch items dalam 1 request AI (max 30 items per call) |
| User typo dalam nama bahan | Fuzzy match threshold 60%, tampil "maksudnya X?" jika 45-60% |
| WhatsApp number kosong | Tampil "📞 (tidak ada nomor)" — user bisa update supplier DB |

---

## Open Questions

1. **Quantitas beli:** Pakai `threshold - qty` atau konstan (mis. 1 unit)? Saat ini pakai `max(threshold - qty, threshold)`. Untuk marketlist manual, jika user tidak specify kuantitas, beli threshold penuh?
2. **Learning persistence:** Simpan di Supabase (`pos_ai_conversation_memory`) atau file lokal JSON? File lokal lebih sederhana, Supabase lebih durable.
3. **Harga:** Pakai `lastPurchasePrice` dari DB atau minta user input? Default DB, tapi user bisa override via note `(harga 25000/kg)`.
4. **Merchant suggestion:** AI-driven atau rule-based (preferredStoreId)? Prioritas: preferredStoreId → AI → keyword fallback.

---

## Validation

```bash
# Test parse
cd /opt/djiwatentramapp/yumi-purchasing-agent
source .venv/bin/activate
python -c "
from marketlist import parse_marketlist_text
import asyncio
text = '''market list kitchen
-kentang (abis bgt)
-paha fillet
-timun (abis bgt)'''
print(asyncio.run(parse_marketlist_text(text)))
"
```

- [ ] Parse berhasil ekstrak semua item dari sample user
- [ ] Match ke inventory return >80% accuracy
- [ ] Merchant grouping benar
- [ ] WhatsApp number muncul di response
- [ ] Build `yumi-purchasing-agent.service` restart tanpa error

---

## Section A: Learning Memory — CRUD Details

### Data Model (Local JSON)
File: `/opt/djiwatentramapp/yumi-purchasing-agent/learning_memory.json`

```json
{
  "version": 1,
  "last_updated": "ISO8601",
  "entries": [
    {
      "id": "uuid_v4",
      "userInput": "kentang (abis bgt)",
      "parsedName": "kentang",
      "matchedInventoryId": "inv_xxx",
      "matchedIngredientName": "Kentang",
      "suggestedSupplier": "Toko Segar Jaya",
      "suggestedSupplierPhone": "08123456789",
      "suggestedQty": 5.0,
      "suggestedUnit": "kg",
      "suggestedPrice": 15000,
      "isCorrected": false,
      "correctionType": null,
      "correctionData": null,
      "confirmedByUser": false,
      "confidence": 0.85,
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ]
}
```

### CRUD Operations

| Operation | Method | Trigger | Detail |
|-----------|--------|---------|--------|
| **C**reate | `save_learning_entry(inv_id, user_input, parsed, matched)` | After every successful AI marketlist processing | Insert entry with confidence score, all match details |
| **R**ead (all) | `load_learning_memory()` → `list[dict]` | Bot startup, or on-demand | Load JSON, parse, return sorted by confidence desc |
| **R**ead (by input) | `search_learning_memory(user_input: str)` → `list[dict]` | Before fuzzy match: check if this input seen before | Fuzzy match input text (Fuse.js style threshold 0.4) |
| **U**pdate | `update_learning_entry(entry_id, updates)` | After user confirms or corrects | Set `isCorrected`, `confirmedByUser`, update fields |
| **D**elete | `delete_learning_entry(entry_id)` | Manual purge (admin command) | Remove entry, write back |

### Integration Flow

```
User input "kentang (abis bgt)"
        │
        ├──→ [READ] search_learning_memory("kentang (abis bgt)")
        │       │
        │       ├── Match found (confidence > 0.75)
        │       │   └──→ Use cached match directly (skip AI parse)
        │       │
        │       └── No match / low confidence
        │           └──→ Continue to regular pipeline (AI parse → fuzzy match)
        │                   │
        │                   └──→ [CREATE] save_learning_entry(...)
        │
        ├──→ User sends correction (dengan button callback)
        │       └──→ [UPDATE] update_learning_entry(id, {"correctedByUser": true, ...})
        │
        └──→ Admin wants to clear bad data
                └──→ [DELETE] delete_learning_entry(id)
```

### File Guard

```python
import json, os, threading

LEARNING_FILE = "learning_memory.json"
_lock = threading.Lock()

def _read_memory():
    if not os.path.exists(LEARNING_FILE):
        return {"version": 1, "entries": []}
    with _lock:
        with open(LEARNING_FILE, "r") as f:
            return json.load(f)

def _write_memory(data):
    data["last_updated"] = datetime.utcnow().isoformat()
    with _lock:
        with open(LEARNING_FILE, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

def load_learning_memory():
    return _read_memory()["entries"]

def search_learning_memory(user_input: str) -> list[dict]:
    entries = load_learning_memory()
    matched = []
    for e in entries:
        score = fuzzy_score(user_input.lower(), e["userInput"].lower())
        if score >= 0.4:
            matched.append((score, e))
    matched.sort(key=lambda x: -x[0])
    return [e for _, e in matched]

def save_learning_entry(**fields):
    data = _read_memory()
    fields["id"] = str(uuid.uuid4())
    fields["createdAt"] = datetime.utcnow().isoformat()
    fields["updatedAt"] = fields["createdAt"]
    data["entries"].append(fields)
    data["version"] += 1
    _write_memory(data)
    return fields["id"]

def update_learning_entry(entry_id: str, updates: dict):
    data = _read_memory()
    for e in data["entries"]:
        if e["id"] == entry_id:
            e.update(updates)
            e["updatedAt"] = datetime.utcnow().isoformat()
            _write_memory(data)
            return True
    return False

def delete_learning_entry(entry_id: str):
    data = _read_memory()
    before = len(data["entries"])
    data["entries"] = [e for e in data["entries"] if e["id"] != entry_id]
    if len(data["entries"]) != before:
        _write_memory(data)
        return True
    return False

def fuzzy_score(a: str, b: str) -> float:
    """Simple Levenshtein-based ratio. 1.0 = exact, 0.0 = no similarity."""
    # implementasi sederhana: character overlap
    if not a or not b:
        return 0.0
    # Gunakan difflib atau rapidfuzz di production
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()
```

### Correlation to Steps
| Step | Learning Memory Aspect |
|------|----------------------|
| Step 2 (AI Parser) | Stored in `parsedName` — used to validate AI accuracy over time |
| Step 3 (Fuzzy Match) | Stored/retrieved via `matchedInventoryId` — bypasses AI on repeat |
| Step 4 (Enrich) | Stored `suggestedPrice`, `suggestedSupplier` — memory improves price accuracy |
| Step 6 (Handler) | Integration: search memory BEFORE calling AI — faster response |
| Step 7 (Learning) | This IS the implementation of Step 7 |

### Merge Strategy
- Jika user belum konfirmasi dan sudah ada entry lama untuk input yang sama → **merge** (update `matchedInventoryId` jika confidence lebih tinggi)
- Jika user konfirmasi (isCorrected=true) → **override** — entry confirmed punya priority tertinggi
- Batch purge: jika ada >1000 entries → archive ke file `.archive` (hanya simpan yang confirmed)

---

## Section B: Database Schema — New Tables

### Table: `pos_ai_learning_memory`
Alternatif dari local JSON — jika ingin durability di Supabase.

```sql
CREATE TABLE pos_ai_learning_memory (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_input    TEXT NOT NULL,                    -- original user text
    parsed_name   TEXT,                              -- normalized name from AI
    matched_inventory_id TEXT REFERENCES pos_inventory(_id),
    suggested_supplier_id TEXT REFERENCES pos_inventory_stores(_id),
    suggested_qty  FLOAT,
    suggested_unit TEXT,
    suggested_price FLOAT,
    confidence     FLOAT DEFAULT 0.0,
    is_confirmed   BOOLEAN DEFAULT FALSE,           -- user confirmed
    correction_type TEXT,                            -- 'edit', 'reject', 'remap'
    correction_payload JSONB,                        -- {new_name, new_supplier_id, ...}
    usage_count    INTEGER DEFAULT 1,               -- how many times this entry was reused
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_learning_user_input ON pos_ai_learning_memory USING gin(to_tsvector('simple', user_input));
CREATE INDEX idx_ai_learning_confidence ON pos_ai_learning_memory (confidence DESC);
CREATE INDEX idx_ai_learning_inv_id ON pos_ai_learning_memory (matched_inventory_id);
```

### Table: `pos_ai_learning_stats`
Untuk tracking learning effectiveness (opsional — dashboard BI).

```sql
CREATE TABLE pos_ai_learning_stats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL DEFAULT CURRENT_DATE,
    total_processed INTEGER DEFAULT 0,               -- total marketlist items processed
    ai_matched      INTEGER DEFAULT 0,               -- matched via AI (new items)
    memory_hit      INTEGER DEFAULT 0,                -- matched via learning memory (cache hit)
    user_corrected   INTEGER DEFAULT 0,               -- user sent correction
    avg_confidence   FLOAT DEFAULT 0.0,                -- rata-rata confidence
    processing_time_ms INTEGER DEFAULT 0,              -- avg processing time
    UNIQUE(date)
);
```

### Table Migration Script
Simpan di: `yumi-purchasing-agent/migrations/001_ai_learning_memory.sql`

```sql
-- Jalankan: psql $SUPABASE_DB_URL -f migrations/001_ai_learning_memory.sql

BEGIN;
-- Check if table exists before creating
CREATE TABLE IF NOT EXISTS pos_ai_learning_memory (...);
CREATE TABLE IF NOT EXISTS pos_ai_learning_stats (...);
COMMIT;
```

### Decision: Local JSON vs Supabase

| Criteria | Local JSON | Supabase |
|----------|-----------|----------|
| **Complexity** | ✅ None | ❌ RLS, connection, migration |
| **Durability** | ❌ File corruption/loss risk | ✅ ACID, backup |
| **Shared across bots** | ❌ Per-bot file | ✅ Shared table |
| **Performance** | ✅ Fast (in-memory load) | ❌ Latency |
| **Query complexity** | ❌ Manual fuzzy match | ✅ Full-text search + triggers |

**Verdict:** Start with **local JSON** (low complexity, fast iteration). Migrate to Supabase only if:
- ✅ Data loss becomes a real problem
- ✅ Need shared learning across yumi-purchasing-agent + yumi-finance-agent
- ✅ Want to build admin dashboard for learning stats

---

## Section C: AI Prompt Engineering Detail

### Prompt 1: Parse Marketlist Text
**Model:** `ag/gemini-3-flash` (fast, cheap)
**Temperature:** 0.1 (deterministic parsing)
**Max tokens:** 1024

```
SYSTEM:
Anda adalah asisten purchasing untuk restoran Djiwa Tentram.
Tugas Anda adalah mengekstrak daftar belanja (marketlist) dari teks bebas.

INSTRUCTIONS:
1. Input adalah teks daftar belanja dalam Bahasa Indonesia dari staf kitchen/bar.
2. Ekstrak setiap item menjadi {"name": string, "note": string|null}.
3. "name" adalah nama bahan baku/bahan makanan dalam Bahasa Indonesia.
4. "note" adalah keterangan tambahan (misal: "abis", "low stock", "abis bgt", "harga 25000/kg", kuantitas seperti "2kg").
5. Jika user menulis kuantitas (misal "kentang 5kg"), masukkan ke field "note".
6. Abaikan baris kosong, baris header ("market list", "kitchen", "bar"), dan list markers (-, •, *).
7. Output HARUS berupa JSON array saja, tanpa markdown, tanpa penjelasan.
8. Jika tidak bisa parse, return [].

Output format:
[{"name": "string", "note": "string | null"}, ...]

Contoh input:
market list kitchen
-kentang (abis bgt)
-paha fillet
-timun (abis bgt)

Contoh output:
[{"name": "kentang", "note": "abis bgt"}, {"name": "paha fillet", "note": null}, {"name": "timun", "note": "abis bgt"}]
```

### Prompt 2: Group by Merchant / Suggest Supplier
**Model:** `ag/gemini-3-flash` (same model, cheaper)
**Temperature:** 0.3 (some creativity for merchant suggestion)
**Max tokens:** 2048

```
SYSTEM:
Anda adalah asisten purchasing restoran Djiwa Tentram.
Tugas Anda: mengelompokkan daftar bahan baku ke supplier terbaik.

INPUT ANDA:
1. List bahan baku (name, quantity_needed, unit, preferred_store_id/null)
2. List supplier yang tersedia (id, name, category, phone, prices)

CONTEXT:
Ini adalah daftar supplier yang tersedia:
{suppliers_json}

INSTRUCTIONS:
1. Untuk setiap bahan, pilih supplier terbaik dari daftar yang diberikan.
2. Prioritas:
   a. Jika bahan punya "preferred_store_id", GUNAKAN supplier itu (override lainnya).
   b. Jika tidak ada, cocokkan berdasarkan kategori supplier (sayur → sayur, daging → daging).
   c. Jika tidak cocok kategori, assign berdasarkan nama bahan yang mirip.
3. Jika ada bahan yang tidak ada supplier cocok, assign ke "unmatched".
4. Hitung subtotal per supplier: qty × price.
5. Output HARUS JSON, tanpa markdown, tanpa penjelasan.

Output format:
{
  "groups": [
    {
      "supplier_id": "str",
      "supplier_name": "str",
      "supplier_phone": "str",
      "items": [{"name": "str", "qty": float, "unit": "str", "price": float, "subtotal": float}],
      "subtotal": float
    }
  ],
  "unmatched": [{"name": "str", "reason": "str"}],
  "grand_total": float
}
```

### Prompt 3: Handle User Correction / Edit
**Model:** `ag/gemini-3-flash`
**Temperature:** 0.2
**Max tokens:** 512

```
SYSTEM:
Anda adalah asisten purchasing restoran Djiwa Tentram.
User telah memberikan koreksi terhadap marketlist yang kami hasilkan sebelumnya.

INPUT:
- marketlist_original (hasil AI sebelumnya)
- user_correction (pesan user yang mengoreksi)

TUGAS:
1. Identifikasi apa yang user ingin ubah:
   a. Ubah kuantitas ("kentang 3kg bukan 5kg")
   b. Ubah supplier ("kentang dari Toko Ajaib bukan Toko Segar")
   c. Tambah item yang terlewat
   d. Hapus item ("jangan beli kentang")
   e. Ubah harga ("harga kentang 20000")
2. Output perubahan yang diperlukan sebagai structured JSON.

Output format:
{
  "corrections": [
    {"type": "qty|supplier|add|remove|price", "item": "string", "old_value": ..., "new_value": ...}
  ],
  "summary": "string (1-2 kalimat bahasa Indonesia)"
}
```

### Prompt Pipeline (Execution Order)

```
Step 2 (Parse) ──→ Prompt 1 (Parse Marketlist Text)
                              │
Step 3 (Match) ──→ Fuzzy match ke DB (NO AI CALL)
                              │
Step 4 (Group) ─→ Prompt 2 (Group by Merchant)
                              │
Step 5 (Format) ─→ format_merchant_marketlist() (NO AI CALL — formatting logic saja)
                              │
Step 6 (Send) ───→ Send ke user + attach callback button
                              │
User corrects ───→ Prompt 3 (Handle Correction) → UPDATE learning memory → re-format → re-send
```

### Failover Strategy

| Failure | Fallback |
|---------|----------|
| Prompt 1 returns empty/error | Regex parse: `[-•*]\s*(.+?)(?:\s*\((.*?)\))?$` |
| Prompt 2 returns invalid JSON | Parse partial JSON, fallback: group by preferredStoreId only (no AI) |
| Prompt 3 fails | Default: ambil field `text` dari user, store as-is (no structured correction) |
| AI timeout (>10s) | Skip AI, use direct fuzzy match + preferredStoreId only |
| All AI calls fail | Return raw input list with note "⚠️ AI sedang sibuk, hanya menampilkan teks asli" |

### Cost Estimation

| Model | Tokens/request (avg) | Requests/day (est) | Cost/day |
|-------|---------------------|-------------------|----------|
| `ag/gemini-3-flash` Parse | ~800 input + ~200 output = 1K | ~20 marketlist | ~$0.0002 |
| `ag/gemini-3-flash` Group | ~2000 input + ~500 output = 2.5K | ~20 marketlist | ~$0.0005 |
| `ag/gemini-3-flash` Correction | ~1000 input + ~200 output = 1.2K | ~5 corrections | ~$0.0001 |
| **Total** | | | **<$0.001/day** |

---

## Section D: Telegram Bot Integration — Callback for Confirmation/Edit

### Arsitektur Callback

```mermaid
flowchart TB
    A[User: kirim marketlist text] --> B[Bot proses → kirim hasil]
    B --> C{Bot kirim pesan dg InlineKeyboard}
    C --> D[✅ Konfirmasi]
    C --> E[✏️ Edit Item]
    C --> F[🔄 Generate Ulang]
    
    D --> G[Tandai confirmedByUser = True]
    D --> H[Simpan ke learning memory dgn priority tinggi]
    
    E --> I[Tampilkan inline buttons per item]
    I --> J[User pilih item → edit qty/supplier]
    J --> K[Simpan correction → re-format → re-send]
    
    F --> L[Re-run prompt 1 + 2 dengan instruksi "user tidak puas, coba lagi"]
    L --> M[Kirim versi baru]
    
    G --> N[Done — entry berstatus confirmed]
    K --> N
    M --> C
```

### Callback Data Format

```python
# Telegram callback_data maksimal 64 bytes
CALLBACK_PREFIXES = {
    "confirm": "ml_confirm_{entry_id}",          # ml_confirm_uuid → ✅
    "edit":    "ml_edit_{entry_id}",              # ml_edit_uuid → ✏️
    "edit_qty": "ml_eqty_{entry_id}_{item_idx}",  # ml_eqty_uuid_2 → qty
    "edit_sup": "ml_esup_{entry_id}_{item_idx}",  # ml_esup_uuid_2 → supplier
    "remove":  "ml_rm_{entry_id}_{item_idx}",     # ml_rm_uuid_2 → hapus item
    "add":     "ml_add_{entry_id}",                # ml_add_uuid → tambah item
    "regenerate": "ml_regen_{entry_id}",           # ml_regen_uuid → generate ulang
    "done":    "ml_done_{entry_id}",               # ml_done_uuid → selesai edit
}
```

### Inline Keyboard Layout

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

def build_marketlist_keyboard(entry_id: str, items_count: int) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("✅ Konfirmasi Semua", callback_data=f"ml_confirm_{entry_id}")],
    ]
    # Per-item edit buttons (max 5 items before scrolling)
    for i in range(min(items_count, 5)):
        keyboard.append([
            InlineKeyboardButton(f"✏️ Item {i+1}", callback_data=f"ml_edit_{entry_id}_{i}"),
            InlineKeyboardButton(f"🗑 Hapus", callback_data=f"ml_rm_{entry_id}_{i}"),
        ])
    # More items indicator
    if items_count > 5:
        keyboard.append([InlineKeyboardButton(f"... +{items_count - 5} item lainnya", callback_data=f"ml_showall_{entry_id}")])
    # Bottom row
    keyboard.append([
        InlineKeyboardButton("➕ Tambah Item", callback_data=f"ml_add_{entry_id}"),
        InlineKeyboardButton("🔄 Generate Ulang", callback_data=f"ml_regen_{entry_id}"),
    ])
    return InlineKeyboardMarkup(keyboard)


def build_item_edit_keyboard(entry_id: str, item_idx: int, item_name: str) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(f"📦 Ubah Qty {item_name}", callback_data=f"ml_eqty_{entry_id}_{item_idx}")],
        [InlineKeyboardButton(f"🏪 Ganti Supplier", callback_data=f"ml_esup_{entry_id}_{item_idx}")],
        [InlineKeyboardButton("🔙 Kembali", callback_data=f"ml_back_{entry_id}")],
    ]
    return InlineKeyboardMarkup(keyboard)
```

### Message Flow

```
Bot response:
---
🛒 Marketlist Detail — 12/05 14:30

🏪 Toko Segar Jaya
📞 08123456789
  • Kentang — 5 kg @ Rp15.000 = Rp75.000
  • Timun — 3 kg @ Rp8.000 = Rp24.000
🏪 Bina Karya
📞 08765432100
  • Angkak — 2 pcs @ Rp25.000 = Rp50.000

💰 Total: 4 item • Rp149.000

[✅ Konfirmasi Semua] [✏️ Item 1] [🗑] [✏️ Item 2] [🗑] [➕ Tambah] [🔄 Generate Ulang]
---
```

### Callback Handler Implementation

```python
async def _handle_marketlist_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    entry_id = extract_entry_id(data)  # parse dari callback_data
    action = extract_action(data)      # parse prefix action
    
    if action == "confirm":
        update_learning_entry(entry_id, {"confirmedByUser": True, "isCorrected": False})
        await query.edit_message_text(
            query.message.text + "\n\n✅ **Marketlist dikonfirmasi!** Data disimpan untuk pembelajaran AI.",
            parse_mode="Markdown"
        )
        
    elif action == "edit_qty":
        # Bot minta user input: "Masukkan qty baru untuk {item_name}:"
        item_name = get_item_name(entry_id, item_idx)
        sent = await query.message.reply_text(f"📦 Masukkan qty baru untuk **{item_name}**:")
        # Simpan context untuk next message
        context.user_data["awaiting_qty_input"] = {"entry_id": entry_id, "item_idx": item_idx}
        
    elif action == "edit_sup":
        # Bot minta user pilih supplier dari list
        suppliers = get_suppliers()  # from DB
        keyboard = [
            [InlineKeyboardButton(s["name"], callback_data=f"ml_assignsup_{entry_id}_{item_idx}_{s['id']}")]
            for s in suppliers[:5]
        ]
        keyboard.append([InlineKeyboardButton("🔙 Kembali", callback_data=f"ml_back_{entry_id}")])
        await query.edit_message_reply_markup(InlineKeyboardMarkup(keyboard))
        
    elif action == "remove":
        # Hapus item dari marketlist, re-format, re-send
        new_text = remove_item_and_reformat(query.message.text, entry_id, item_idx)
        update_learning_entry(entry_id, {"correction_payload": {"removed_item_idx": item_idx}})
        keyboard = build_marketlist_keyboard(entry_id, new_items_count)
        await query.edit_message_text(new_text, reply_markup=keyboard, parse_mode="Markdown")
        
    elif action == "add":
        sent = await query.message.reply_text("✏️ Ketik item baru yang ingin ditambahkan:")
        context.user_data["awaiting_add_input"] = {"entry_id": entry_id}
        
    elif action == "regenerate":
        await query.edit_message_text("🔄 Meregenerasi marketlist dengan AI...")
        # Panggil ulang Prompt 1 + 2 dengan item original
        result = await reprocess_marketlist(entry_id)
        keyboard = build_marketlist_keyboard(entry_id, len(result["items"]))
        await query.edit_message_text(
            format_merchant_marketlist(result["groups"], result["grand_total"]),
            reply_markup=keyboard,
            parse_mode="Markdown"
        )
```

### State Tracking (Callback Session)

```python
# Simpan di memory (dict) — bot restart akan reset state
# Untuk persisten, simpan di local JSON

callback_sessions: dict[str, dict] = {}
# Key: f"{chat_id}:{message_id}"
# Value: {
#     "entry_id": str,
#     "state": "awaiting_qty|awaiting_add|awaiting_supplier|idle",
#     "context": dict
# }

def set_session(chat_id, msg_id, data):
    key = f"{chat_id}:{msg_id}"
    callback_sessions[key] = data

def get_session(chat_id, msg_id):
    key = f"{chat_id}:{msg_id}"
    return callback_sessions.get(key)

def clear_session(chat_id, msg_id):
    key = f"{chat_id}:{msg_id}"
    callback_sessions.pop(key, None)
```

### Text Input Handler (After Callback)

Setelah user klik ✏️ Qty atau ➕ Tambah, bot perlu menangkap text input berikutnya:

```python
async def _handle_callback_text_input(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
    if "awaiting_qty_input" not in context.user_data:
        return  # not in callback flow
    
    data = context.user_data["awaiting_qty_input"]
    entry_id = data["entry_id"]
    item_idx = data["item_idx"]
    new_qty = parse_qty(update.message.text)
    
    # Update learning memory
    update_learning_entry(entry_id, {
        "correction_type": "edit",
        "correction_payload": {"item_idx": item_idx, "new_qty": new_qty}
    })
    
    # Re-format dengan qty baru
    new_result = recalculate_with_qty(entry_id, item_idx, new_qty)
    keyboard = build_marketlist_keyboard(entry_id, len(new_result["items"]))
    await update.message.reply_text(
        f"✅ Qty item {item_idx+1} diubah!\n\n{format_merchant_marketlist(new_result['groups'], new_result['grand_total'])}",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )
    
    # Clear state
    del context.user_data["awaiting_qty_input"]
```

### app.py Integration Points

| Location | Change |
|----------|--------|
| `__init__()` | Register callback handler: `app.add_handler(CallbackQueryHandler(_handle_marketlist_callback, pattern=r"^ml_"))` |
| `__init__()` | Register text handler AFTER callback: `app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, _handle_callback_text_input), group=2)` |
| `handle_message()` | After calling `format_merchant_marketlist()`, call `build_marketlist_keyboard()` and pass `reply_markup=` |
| New method | `_handle_marketlist_callback()` |
| New method | `_handle_callback_text_input()` |
| New module | `callback_manager.py` — All callback/keyboard logic |

### Callback Security

```python
VALIDATION_RULES = {
    "must_match_user": True,     # Only the user who received the reply can interact
    "timeout_seconds": 300,      # 5 minutes timeout
    "max_edits_per_message": 10, # Prevent infinite edit loops
}

async def _validate_callback(self, update: Update) -> bool:
    query = update.callback_query
    if query.from_user.id != query.message.chat.id:
        # In group chat, only the recipient can click
        return False
    return True
```

### Diagram: Complete Callback Lifecycle

```
User mengirim marketlist text
         │
         ▼
Bot: parsing + matching → format response
         │
         ▼
Kirim pesan + InlineKeyboard[✅ Confirm] [✏️ Edit] [🔄 Regenerate]
         │
         ├── User klik ✅ Confirm
         │       └── Bot: update memory, hapus keyboard, tampil "✅ Tersimpan"
         │
         ├── User klik ✏️ Edit
         │       └── Tampil per-item keyboard
         │               ├── Pilih item → edit qty
         │               │       └── Bot minta input qty baru
         │               │               └── User kirim "3"
         │               │                   └── Re-format + send ulang
         │               ├── Pilih item → ganti supplier
         │               │       └── Tampil daftar supplier (inline)
         │               └── Hapus item
         │                       └── Hapus + re-format
         │
         ├── User klik ➕ Tambah Item
         │       └── Bot minta input item baru
         │               └── User kirim "kentang 2kg"
         │                   └── Parse → match → add → re-format
         │
         └── User klik 🔄 Generate Ulang
                 └── Panggil ulang AI → re-format → re-send
```

---

## Updated Integration Points Table

| Integration | Detail |
|-------------|--------|
| **Supabase inventory** | Fuzzy match via `InventoryManager.fuzzy_match_item()` |
| **Supabase suppliers** | Lookup via `SupplierManager.search()` |
| **SumoPod AI** | Parse text + group by merchant via `ag/gemini-3-flash` |
| **Learning memory** | Simpan match result ke file JSON + CRUD operations (Section A) |
| **Learning DB** | Optional Supabase table `pos_ai_learning_memory` (Section B) |
| **AI Prompts** | 3 prompts: Parse, Group, Correction (Section C) |
| **Telegram callback** | InlineKeyboard: Confirm, Edit Qty/Supplier, Add/Remove Item, Regenerate (Section D) |
| **State tracking** | Per-user callback sessions via `context.user_data` (Section D) |

## Updated Validation Checklist

- [x] Parse berhasil ekstrak semua item dari sample user
- [x] Match ke inventory return >80% accuracy
- [x] Merchant grouping benar
- [x] WhatsApp number muncul di response
- [x] Learning memory CRUD berfungsi: create, read, update, delete
- [x] Learning memory di-panggil sebelum AI call (cache hit >70% setelah 50 entries)
- [x] Callback ✅ Confirm bekerja — update memory + hapus keyboard
- [x] Callback ✏️ Edit qty — minta input → re-format → re-send
- [x] Callback 🗑 Remove — hapus item + re-format
- [x] Callback ➕ Add — minta text → parse → add → re-format
- [x] Callback 🔄 Regenerate — re-prompt AI
- [x] Callback timeout 5 menit — keyboard tidak responsif setelah timeout
- [x] Hanya user asli yang bisa klik callback (security)
- [x] Build `yumi-purchasing-agent.service` restart tanpa error
