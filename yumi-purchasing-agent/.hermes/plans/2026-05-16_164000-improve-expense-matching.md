# Plan: Improve AI Expense Matching Accuracy

**Date:** 2026-05-16
**Author:** Hermes Agent
**Status:** Draft

---

## Goal

Meningkatkan akurasi pencocokan item expense ke inventory database. Dari contoh terakhir: 7/11 cocok (63%), target ≥ 90%.

---

## Current Context

### Data Flow
1. **Yumi Finance Agent** (@YummeFinanceAIbot) mencatat expense → `pos_financial_transactions` dengan `metadata.scanItems[]` berisi `{name, quantity, price}`
2. **Yumi Purchasing Agent** polling `pos_financial_transactions` tiap 30 detik (`_poll_new_expenses`), filter category di `MATCH_EXPENSE_CATEGORIES`
3. **`_ai_match_expense_items()`** — kirim SEMUA item + inventory list (max 150 item karena truncation 8000 chars) ke SumoPod AI dalam 1 shot
4. **Fallback:** `_fuzzy_match_expense_fallback()` — rapidfuzz WRatio, score_cutoff=60
5. **Output:** format message ke STOCK_GROUP_ID

### Existing Infrastructure (belum dipakai untuk expense matching)

| Komponen | Digunakan? | Untuk |
|---|---|---|
| `inventory._clean_name()` | ❌ | Normalisasi nama item (lowercase, strip qty suffix) |
| `learning_memory.py` | ❌ | Persistent alias DB dengan fuzzy search, `save_learning_entry()`, `search_learning_memory()` |
| `_QTY_SUFFIX_RE` di inventory.py | ❌ | Regex extract `"C1000 APPLE 140" → "C1000 APPLE"` |
| `SumoPodClient` | ✅ | Hanya untuk expense matching — bisa dipakai juga untuk alias lookup |

### Root Cause Analysis — Kenapa Banyak Tidak Cocok?

Dari contoh item tidak cocok:

| Item Masuk | Kenapa Gagal | Ada di Inventory Sebagai |
|---|---|---|
| `ROSE BRAND POUCH 2L` | Nama panjang + brand + ukuran + format berbeda | Mungkin "Kresek Piala Uk 28 Putih" atau berbeda kategori |
| `FF COCONUT UHT 946ML` | Brand "FF" + ukuran "946ML" nyatu | Mungkin "Coconut UHT" atau "Fresh Milk" |
| `YOR KAYUMANISBTG50GR` | Kode produk tanpa spasi + singkatan BTG→Batang | Mungkin "Kayumanis Batang" |
| `YOR KAYUMANISBBK40GR` | Kode produk tanpa spasi + singkatan BBK→Bubuk | Mungkin "Kayumanis Bubuk" |

**5 masalah utama:**
1. **No pre-processing** — nama item mentah (dengan brand, ukuran, kode produk) langsung dikirim ke AI
2. **No alias DB** — AI tidak belajar dari match sebelumnya (beda dengan marketlist yg punya `learning_memory.py`)
3. **One-shot matching** — 11 items + 150+ inventory dalam 1 prompt AI, akurasi turun drastis untuk receipt besar
4. **Truncation rawan** — kalau inventory > 150 item, sisanya tidak pernah dipertimbangkan AI
5. **Fallback lemah** — rapidfuzz WRatio saja tanpa brand-aware atau partial matching

---

## Proposed Approach: 3-Phase Improvement

### Phase 1 — Pre-processing Layer (Effort: Rendah, Impact: Tinggi)

**Sebelum** nama item dikirim ke AI, bersihkan dulu:

```
"ROSE BRAND POUCH 2L"      → "ROSE BRAND POUCH"
"FF COCONUT UHT 946ML"     → "COCONUT UHT"
"YOR KAYUMANISBTG50GR"     → "YOR KAYUMANIS BATANG"
"SCHWEPPES SOWATER250"     → "SCHWEPPES SODA WATER"
"SPRITE PET 1000ML"        → "SPRITE"
"YOU C1000 APPLE 140"      → "YOU C1000 APPLE"
"BREX RJK CIRENG 20S"      → "CIRENG"
```

**Teknik:**
1. **Strip size suffix** — pakai `_QTY_SUFFIX_RE` dari `inventory.py` (sudah ada!)
2. **Decode singkatan** — mapping: `BTG→Batang`, `BBK→Bubuk`, `SOWATER→Soda Water`, `RJK→Rujak`, `PET→Pet`
3. **Strip trailing numbers** — `140`, `20S`, `250` di akhir (tapi hati-hati dengan item seperti "C1000")
4. **Ekstrak brand untuk matching** — simpan brand (`FF`, `YOR`, `ROSE BRAND`) terpisah untuk dicocokkan dengan `defaultBrandName` di inventory

**File berubah:** `app.py` — tambah fungsi `_normalize_expense_name()`

### Phase 2 — Alias Database untuk Expense Matching (Effort: Rendah, Impact: Tinggi)

Gunakan `learning_memory.py` yang **sudah ada** untuk expense matching:

**Flow:**
1. Terima nama item dari scanItems (sudah di-preprocess)
2. Cari di alias DB: `search_learning_memory(normalized_name, min_score=0.7)`
3. Jika ketemu → return langsung (skip AI)
4. Jika tidak → kirim ke AI seperti biasa
5. Setelah AI berhasil match → `save_learning_entry()` dengan `userInput=normalized_name, matchedInventoryId=..., matchedIngredientName=...`
6. **Bonus:** untuk item yang tidak cocok, buat entry dengan `isCorrected=False` untuk tracking

**Schema entry expense alias** (field baru di learning_memory.json):
```json
{
  "id": "uuid",
  "type": "expense_match",
  "userInput": "COCONUT UHT",
  "parsedName": "FF COCONUT UHT 946ML",
  "matchedInventoryId": "inv_xxx",
  "matchedIngredientName": "Coconut UHT",
  "confidence": 95,
  "usageCount": 1,
  "createdAt": "..."
}
```

**File berubah:** `app.py` — panggil `search_learning_memory()` sebelum AI, `save_learning_entry()` setelah match

### Phase 3 — Multi-Strategy AI (Effort: Sedang, Impact: Sedang)

**Strategy 1 — Cek Alias DB** (instant)
**Strategy 2 — AI matching** (SumoPod)
**Strategy 3 — Fuzzy fallback multi-strategy** (rapidfuzz)

Untuk fuzzy fallback, ganti dari WRatio saja menjadi:

```python
strategies = [
    ("partial", partial_ratio, 70),       # "Coconut UHT" → "FF COCONUT UHT 946ML"
    ("token_sort", token_sort_ratio, 70),  # sorted token, insensitive to word order
    ("token_set", token_set_ratio, 65),    # best subset match
    ("WRatio", WRatio, 60),                # existing fallback
]
# Take best score across ALL strategies
```

**File berubah:** `app.py` — fungsi `_fuzzy_match_expense_fallback()`

---

## Step-by-Step Plan

### Step 1: Pre-processing Function

Buat fungsi `_normalize_expense_name(name: str) -> str` di `app.py`:

```python
def _normalize_expense_name(name: str) -> str:
    """Normalize expense item name for better matching."""
    # 1. Strip size suffix (pakai _QTY_SUFFIX_RE yang sudah ada)
    # 2. Decode common abbreviations (BTG→Batang, BBK→Bubuk, dll)
    # 3. Strip trailing numbers like "140", "20S" (tapi hati-hati)
    # 4. Strip brand prefix jika terlalu spesifik
    
    # Reuse existing regex from inventory.py
    name = _QTY_SUFFIX_RE.sub("", name).strip()
    
    # Decode abbreviations
    ABBR_MAP = {
        r'\bBTG\b': 'Batang', r'\bBBK\b': 'Bubuk',
        r'\bSOWATER\b': 'Soda Water', r'\bRJK\b': 'Rujak',
        r'\bPET\b': 'Pet', r'\bLMNS\b': 'Lemon',
    }
    for pattern, replacement in ABBR_MAP.items():
        name = re.sub(pattern, replacement, name, flags=re.IGNORECASE)
    
    # Strip trailing size numbers (e.g., "250", "20S", "140")
    name = re.sub(r'\s*\d+[A-Z]?\s*$', '', name).strip()
    
    return name
```

**Files changed:** `app.py` (~30 lines added)

### Step 2: Integrate Alias DB

Modifikasi `_ai_match_expense_items()`:

```python
async def _ai_match_expense_items(sp_client, items, all_inv):
    """Match expense items dengan alias DB lookup dulu."""
    matched = []
    ai_items = []  # items that need AI matching
    
    for it in items:
        raw_name = it.get('name', '')
        norm_name = _normalize_expense_name(raw_name)
        
        # Cek alias DB dulu
        alias_matches = search_learning_memory(norm_name, min_score=0.7)
        # Filter hanya untuk expense_match type
        expense_aliases = [e for e in alias_matches if e.get("type") == "expense_match"]
        
        if expense_aliases:
            best = expense_aliases[0]
            matched.append({
                "input": raw_name,
                "matched": True,
                "inv_name": best["matchedIngredientName"],
                "_id": best["matchedInventoryId"],
                "score": int(best["confidence"]),
                "unit": None,
            })
            increment_usage(best["id"])
        else:
            ai_items.append(it)  # perlu AI
    
    if not ai_items:
        return matched
    
    # Lanjut AI matching untuk sisanya (existing code)
    # ... lalu save hasil AI ke learning_memory
```

**Files changed:** `app.py`, `learning_memory.py` (tambah field `type`)

### Step 3: Save Successful Matches to Learning Memory

Setelah AI berhasil match, simpan ke alias DB:

```python
# Di _match_expense_items(), setelah AI match sukses
if m["matched"] and m["score"] >= 70:
    save_learning_entry(
        user_input=_normalize_expense_name(m["input"]),
        parsed_name=m["input"],
        matched_inventory_id=m["_id"],
        matched_ingredient_name=m["inv_name"],
        confidence=m["score"],
    )
```

Tambahkan `type` field ke `save_learning_entry()` parameter untuk membedakan expense_match vs marketlist.

**Files changed:** `app.py`, `learning_memory.py`

### Step 4: Improve Fuzzy Fallback

Ganti `_fuzzy_match_expense_fallback()` dengan multi-strategy:

```python
def _fuzzy_match_expense_fallback(items, all_inv):
    inv_names = {i.get("ingredientName", ""): i for i in all_inv if i.get("ingredientName")}
    results = []
    
    for item in items:
        name = _normalize_expense_name(item.get('name', ''))
        
        strategies = [
            ("partial", partial_ratio),
            ("token_sort", token_sort_ratio),
            ("token_set", token_set_ratio),
            ("WRatio", WRatio),
        ]
        
        best_score = 0
        best_match = None
        for strategy_name, scorer in strategies:
            match = process.extractOne(name, inv_names.keys(), scorer=scorer, score_cutoff=60)
            if match and match[1] > best_score:
                best_score = match[1]
                best_match = match
        
        if best_match and best_score >= 60:
            match_name = best_match[0]
            inv_item = inv_names[match_name]
            results.append({...})
        else:
            results.append({"input": item.get('name', ''), "matched": False, ...})
    
    return results
```

**Files changed:** `app.py`

### Step 5: Better Inventory Context for AI

**Problem:** Jika inventory > 150 item, AI tidak melihat semua.

**Solusi:** Chunk inventory dan matching bertahap:
1. Cari candidate inventory berdasarkan keyword overlap
2. Kirim hanya candidate (~30 item) ke AI, bukan semua inventory
3. Jika tidak ada candidate → full fuzzy fallback

Atau solusi lebih sederhana: **filter inventory by category match** — kalau expense category "bahan_minuman", kirim hanya inventory kategori minuman.

**Files changed:** `app.py`

### Step 6: User Correction Command

Tambahkan command di grup Stock untuk koreksi:

```
/koreksi <nama_dari_struk> → <nama_inventory>
```

Contoh:
```
/koreksi ROSE BRAND POUCH 2L → Kresek Piala Uk 28 Putih
```

Fungsi `handle_expense_correction()`:
1. Parse input: `scanName → inventoryName`
2. Cari inventory by name (rapidfuzz)
3. Simpan ke learning_memory sebagai alias
4. Reply konfirmasi

**Files changed:** `app.py` — tambah handler command `/koreksi`

---

## Files Changed Summary

| File | Changes | Complexity |
|---|---|---|
| `app.py` | Add `_normalize_expense_name()`, integrate alias DB lookup before AI, save matches to learning_memory, multi-strategy fuzzy fallback | Medium (~100 lines) |
| `learning_memory.py` | Add `type` field (expense_match vs marketlist), update `save_learning_entry()` signature | Low (~10 lines) |
| `learning_memory.json` | Auto-populated as matches accumulate | None |

---

## Testing / Validation

### Test Cases

1. **Item dengan ukuran:** `"SPRITE PET 1000ML"` → harus match ke "Sprite"
2. **Item dengan kode:** `"YOR KAYUMANISBTG50GR"` → harus match ke "Kayumanis Batang"  
3. **Item dengan brand:** `"FF COCONUT UHT 946ML"` → harus match ke "Coconut UHT"
4. **Alias DB:** setelah sekali match, item yang sama harus langsung match tanpa AI
5. **Multiple item receipt:** 15+ items tetap akurat

### Validation Steps

1. Jalankan polling biasa, tunggu expense baru muncul
2. Cek log: `[EXPENSE-MATCH]` untuk lihat apakah alias DB dipakai
3. Cek `learning_memory.json` apakah entries terisi
4. Kirim `/koreksi` command untuk test user correction

---

## Risks & Tradeoffs

| Risk | Mitigasi |
|---|---|
| **False positives alias DB** — item yang beda tapi mirip dianggap sama | Gunakan `min_score=0.7` strict + filter by `type="expense_match"` |
| **Over-normalization** — "C1000" kehilangan angka penting | Hanya strip trailing number, bukan angka di tengah |
| **Alias DB bloat** — ribuan entries seiring waktu | Implementasi `max_entries=5000` + LRU eviction |
| **SumoPod timeout untuk banyak item** | Phase 3 chunking — kirim per batch kecil |

---

## Open Questions

1. **Apakah perlu filter inventory by category dulu?** — Kalau expense category "bahan_minuman", kirim hanya inventory minuman ke AI untuk mengurangi noise. Ini bisa improve akurasi signifikan.
2. **Apakah `/koreksi` perlu inline button atau cukup text command?** — Text command lebih sederhana, inline button lebih user-friendly.
3. **Apakah alias DB perlu expire (misal 30 hari)?** — Untuk expense matching, item biasanya berulang tiap bulan, jadi persistent lebih baik.
4. **Bagaimana dengan item non-kitchen?** — Kayak "ROSE BRAND POUCH 2L" mungkin bukan bahan dapur. Perlu filter kitchen dulu? Atau tetap match tapi bedain kategori?

---

## Implementation Order

```
Phase 1: Pre-processing → (hari ini)
Phase 2: Alias DB + auto-save → (setelah Phase 1)
Phase 3: Multi-strategy fuzzy → (setelah Phase 2)
Optional: User correction → (jika masih ada yang tidak cocok)
```
