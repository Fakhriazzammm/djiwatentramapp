# Plan: 🔴🟡 Stock Deduction from Marketlist Group Chat

## Goal
Anggota grup marketlist bisa mengirim pesan dengan simbol 🔴 atau 🟡 diikuti nama bahan, dan bot akan langsung mengurangi stok di database inventory.

## Current Context

### Existing Infrastructure
- **Yumi Purchasing Agent** (`yumi-purchasing-agent/app.py`) — sudah handle message, marketlist, callback
- **`handle_message()`** (line 387) — entry point semua text dari user
- **`inventory.get_all_inventory()`** — ambil semua inventory dari Supabase
- **SumoPodClient** (`sumopod_client.py`) — AI chat completion untuk parsing/fuzzy match
- **`InventoryManager`** (`inventory.py`) — metode `apply_stock_action()` untuk update stok
- **Supabase REST API** — PATCH untuk update quantity langsung

### What Exists vs What's New
- Existing marketlist flow (`_handle_marketlist_input`) → parsing daftar belanja, grouping merchant
- **New**: 🔴/🟡 reaction → langsung modify inventory quantity (bukan parsing marketlist)

## Proposed Approach

### Flow

```
User di grup marketlist:
  "🔴 Minyak Goreng"
  "🟡 garam, merica, micin"
  
  1. Deteksi ada simbol 🔴 atau 🟡 di pesan
  2. Ekstrak item names (bisa 1 atau banyak, pisah koma/enter)
  3. Klasifikasi: 🔴 = set to 0, 🟡 = potong setengah
  4. AI fuzzy match nama ke inventory database
  5. Apply action via Supabase PATCH
  6. Balas dengan ringkasan perubahan
```

### Why AI? 
User bisa nulis asal: "minyak goreng" bisa cocok ke `Minyak Goreng`, `Minyak Sunco`, `Minyak Rizki`, `Minyak Tropical 1L`. Tanpa AI, keyword matching sederhana akan salah. AI juga handle typo, case, spacing.

## Step-by-Step Plan

### Step 1: Buat Fungsi `_parse_stock_reaction(text)`
- Input: raw text dari Telegram
- Deteksi 🔴 atau 🟡
- Parse items: split by koma/enter/bullet
- Return: `{type: "🔴"|"🟡", items: ["minyak goreng", "garam", ...]}`

Location: **app.py** (fungsi baru, atau modul terpisah `stock_reaction.py`)

### Step 2: Buat Fungsi `_ai_match_inventory(items: list[str], all_inv: list[dict]) -> list[dict]`
- Gunakan SumoPod AI untuk cocokkan tiap item user ke inventory database
- AI prompt: daftar semua nama inventory, minta AI pilih yang paling cocok
- Return matched item + confidence
- Fallback: fuzzy match via `rapidfuzz` (already imported in inventory.py)

### Step 3: Buat Fungsi `_apply_stock_deductions(matches: list[dict], action_type: str)`
- action_type = "habis" (🔴) → set quantity = 0
- action_type = "setengah" (🟡) → set quantity = qty / 2
- Panggil Supabase PATCH untuk setiap matched item
- Store history di memory untuk rollback: `_stock_reaction_history[timestamp] = {before: {...}, after: {...}}`

### Step 4: Integrasi ke `handle_message()`
- Di awal `handle_message()`, cek apakah text mengandung 🔴 atau 🟡
- Jika iya, panggil Step 1→2→3 alih-alih orchestrator normal
- Kirim balasan: "✅ Minyak Goreng → 0 (HABIS)\n✅ Garam → 25 gram (50%)\n❌ 'abcde' tidak ditemukan"
- Sertakan tombol undo/rollback di balasan

### Step 5: Validasi & Testing
- Test dengan berbagai format: "🔴 minyak", "🔴minyak", "🔴minyak goreng, garam"
- Test dengan nama tidak lengkap: "🔴 paha" → cocok ke "Paha Filet"
- Test dengan 🟡 dan cek stok terpotong setengah
- Test item tidak ditemukan → feedback ke user
- Test rollback: klik undo → qty kembali ke sebelum

## Files Changed

| File | Action | Description |
|---|---|---|
| `yumi-purchasing-agent/app.py` | **EDIT** | Tambah `handle_stock_reaction()`, integrasi ke `handle_message()` |
| `yumi-purchasing-agent/inventory.py` (symlink) | **EDIT** | Tambah method `batch_update_quantity()` |
| (Optional) `yumi-purchasing-agent/stock_reaction.py` | **CREATE** | Module baru untuk parsing & matching |

## Database Operations

### Supabase REST PATCH (service_role key)
```http
PATCH /rest/v1/pos_inventory?_id=eq.{_id}
{
  "quantity": 0  // untuk 🔴
}

PATCH /rest/v1/pos_inventory?_id=eq.{_id}
{
  "quantity": {current_qty / 2}  // untuk 🟡
}
```

### Data yang diperlukan
- `pos_inventory` — `_id, ingredientName, quantity` untuk matching & update

## AI Integration

### SumoPod Model
- Model: `mimo-v2-flash` (fast/cheap untuk parsing simple)
- Atau `gpt-4o` jika perlu akurasi tinggi

### AI Prompt Design — Full System Prompt

**System Prompt:**
```
Kamu adalah asisten inventory yang COCOKKAN nama bahan dari user ke database inventory.

ATURAN:
- Handle typo, singkatan, nama tidak lengkap, case, spasi berlebih
- "minyak" bisa berarti Minyak Goreng, Minyak Sunco, Minyak Rizki, Minyak Tropical 1L
- Jika ada MULTIPLE kemungkinan, pilih yang PALING UMUM / PALING SERING DIPAKAI
- Jika ragu antara 2 item yang mirip, pilih yang quantity-nya lebih kecil (lebih urgent)
- JANGAN pernah menjawab lebih dari 1 item per input
- Jika TIDAK ADA yang cocok sama sekali, jawab: TIDAK_COCOK
- Jika nama mengandung brand (ABC, Filma, Del Monte, dll), prioritaskan brand match

Format jawaban untuk SETIAP item:
NAMA_INVENTORY|_ID|CONFIDENCE_SCORE(0-100)|ALASAN_SINGKAT

Contoh:
User: "minyak goreng"
Inventory: ["Minyak Goreng|id1|600ml", "Minyak Sunco|id2|600ml", "Minyak Rizki|id3|2000ml", "Minyak Tropical 1L|id4|2000ml"]
Jawab: Minyak Goreng|id1|95|Exact match nama

User: "paha"
Inventory: ["Paha Filet|id5|2000 gram", "Kulit Ayam|id6|2000 gram", "Tulang|id7|2000 gram"]
Jawab: Paha Filet|id5|85|Nama parsial: "paha" match "Paha Filet"

User: "asdfgh"
Inventory: [...]
Jawab: TIDAK_COCOK
```

**Few-shot examples untuk disertakan di prompt:**

1. **Nama tidak lengkap**:
   - User: "saus tiram" → Inventory: "Saus Tiram (Mahsuri)" ✓
   
2. **Typo/kasaran**:
   - User: "kecap asin" → Inventory: "Kecap Asin ABC" ✓
   - User: "merica" → Inventory: "Merica" ✓

3. **Multi-match dengan konteks**:
   - User: "minyak" → Inventory punya: Minyak Goreng (600ml, th=2000), Minyak Sunco (600ml, th=2000), Minyak Rizki (2000ml, th=2000), Minyak Tropical 1L (2000ml, th=2000), Minyak Bawang Putih (150 gram, th=200), Minyak Wijen (6 botol, th=5)
   - AI harus pilih: Minyak Goreng (paling umum untuk "minyak" tanpa spesifikasi)

4. **Satu baris banyak item**:
   - User: "minyak goreng, garam, merica" → Parse jadi 3 item, match masing-masing

5. **Brand dalam nama**:
   - User: "filma" → Inventory: "Margarine (Filma)" ✓ (bukan Butter atau Minyak)
   - User: "abc kecap" → Inventory: "Kecap Asin ABC" ✓ (urutan terbalik)

### Batching Strategy

Daripada panggil AI untuk setiap item satu per satu (lambat), kirim SEMUA item user dalam SATU prompt:

```
User mengirim beberapa nama bahan. Cocokkan SETIAP nama ke inventory.

Item dari user (dipisah koma):
{minyak goreng, garam, merica, saus tiram}

Daftar inventory (nama|_id|qty):
{Minyak Goreng|id1|600ml, Garam|id2|50 gram, Merica|id3|50 gram, Saus Tiram (Mahsuri)|id4|1 botol, ...}

Format jawaban (satu baris per item, urutan sesuai input):
minyak goreng → Minyak Goreng|id1|95
garam → Garam|id2|100
merica → Merica|id3|100
saus tiram → Saus Tiram (Mahsuri)|id4|90
```

Ini 1 API call instead of N calls, lebih cepat.

### Fallback: RapidFuzz

Jika AI error / timeout, fallback ke rapidfuzz:
```python
from rapidfuzz import fuzz, process
best = process.extractOne(item_name, inventory_names, scorer=fuzz.WRatio, score_cutoff=70)
```

## Error Handling

### 1. Item Tidak Ditemukan (No Match)
- **Cause**: User nulis nama yang tidak ada di database, atau typo parah
- **Response**: 
  ```
  ❌ "abcde" tidak ditemukan di inventory.
     Mungkin maksud: [suggestion 1], [suggestion 2]?
  ```
- **Implementation**: AI return `TIDAK_COCOK` → fallback ke rapidfuzz dengan score cutoff lebih rendah (50) untuk kasih suggestion. Kasih inline keyboard: ✅ Ya / ❌ Batal untuk tiap suggestion.

### 2. Multiple Match (Ambiguous)
- **Cause**: "minyak" bisa match ke 4 item berbeda
- **AI Strategy**: Pilih satu berdasarkan prioritas:
  1. Nama yang paling cocok (highest score)
  2. Quantity paling kecil (lebih urgent)
  3. Threshold paling dekat
- **User Notification**: 
  ```
  ⚠️ "minyak" cocok ke beberapa item:
  • Minyak Goreng (600ml)
  • Minyak Sunco (600ml)
  • Minyak Rizki (2000ml)
  
  Saya pilih Minyak Goreng (paling umum).
  🔄 /undo_xxx untuk batalkan
  ```

### 3. Partial Match (Batch Item Gagal Sebagian)
- **Response**: Campuran ✅ sukses dan ❌ gagal dalam 1 pesan
  ```
  ✅ Minyak Goreng → 0 (HABIS)
  ✅ Garam → 25 gram (50%)
  ❌ "xyz" tidak ditemukan
  ❌ "abc" tidak ditemukan. Mungkin: Abcdef?
  ```

### 4. Database Error
- **Cause**: Supabase timeout / network error / service_role key expired
- **Response**: 
  ```
  ⚠️ Gagal update database untuk 2 item:
  • Minyak Goreng — DB error: timeout
  • Garam — DB error: timeout
  
  🔄 Coba lagi? /retry_xxx
  ```
- **Implementation**: Track success/failure per item. Partial success = reply partial. Jangan rollback yang sudah sukses.

### 5. Duplicate / Sparse Items
- **Cause**: User kirim 2x 🔴 untuk item yang sama (stok sudah 0, dipotong lagi)
- **Response**: 
  ```
  ⚠️ "Minyak Goreng" sudah 0 (HABIS). Tidak ada yang perlu dipotong.
  ```
- **Implementation**: Cek qty sebelum PATCH. Jika qty ≤ 0 untuk 🔴, skip dengan warning.

### 6. Invalid Format
- **Cause**: User kirim "🔴" saja tanpa nama, atau "🔴🔴 minyak" (2 simbol)
- **Response**: 
  ```
  Format tidak dikenali. Contoh: 
  🔴 Minyak Goreng
  🟡 garam, merica
  ```

### 7. Negative Quantity (🟡)
- **Cause**: qty = 1, potong setengah = 0.5. Untuk pcs, 0.5 pcs tidak masuk akal
- **Rule**: 
  - Unit "pcs", "pack", "botol", "pouch", "toros" → bulatkan ke bawah (floor): 1 → 0
  - Unit "gram", "ml", "kg", "liter" → simpan desimal: 1 → 0.5
- **Implementation**: `math.floor(qty/2)` untuk discrete units, `qty/2` untuk continuous units

## Rollback / Undo

### Motivation
User bisa salah kirim 🔴 "minyak" padahal maksudnya bahan lain. Perlu mekanisme undo.

### Approach 1: Inline Keyboard Undo (Recommended)

Setelah setiap aksi, bot kirim pesan dengan tombol "↩️ Undo" (callback data: `undo_{timestamp}`).

**Data yang disimpan** (in-memory dict):
```python
_stock_reaction_history = {}  # {timestamp: {items: [{_id, name, old_qty, new_qty, unit}], user_id, chat_id}}

# Simpan sebelum PATCH
history_entry = {
    "items": [
        {"_id": "xxx", "name": "Minyak Goreng", "old_qty": 600, "new_qty": 0, "unit": "ml"},
        {"_id": "yyy", "name": "Garam", "old_qty": 50, "new_qty": 25, "unit": "gram"},
    ],
    "user_id": str(update.effective_user.id),
    "chat_id": str(update.effective_chat.id),
    "timestamp": datetime.now().isoformat(),
}
_stock_reaction_history[ts] = history_entry
```

**Reply message**:
```
✅ Minyak Goreng → 0 (HABIS) 🔴
✅ Garam → 25 gram (50%) 🟡

[↩️ Undo] [⏰ 2 menit]
```

**Callback handler `undo_{timestamp}`**:
1. Cari history entry di `_stock_reaction_history`
2. Untuk tiap item, PATCH qty kembali ke `old_qty`
3. Edit message: tambah "↩️ **Undone!** Qty dikembalikan."
4. Hapus inline keyboard (disable undo setelah dipakai)

**Expiry**: History entries otomatis expired setelah 5 menit (gunakan `asyncio.create_task` dengan delay atau cek timestamp saat undo).

### Approach 2: Per-Item Undo (Advanced)

Untuk batch dengan banyak item, user mungkin cuma mau undo 1 item, bukan semuanya.

Kirim keyboard dengan tombol per item:
```
✅ Minyak Goreng → 0 (HABIS)
✅ Garam → 25 gram (50%)
✅ Merica → 25 gram (50%)

[↩️ Undo All] [↩️ Minyak] [↩️ Garam] [↩️ Merica]
```

Callback: `undo_{timestamp}_all` atau `undo_{timestamp}_index_0`

**Tradeoff**: Keyboard bisa kepanjangan kalau item > 5. Limit ke max 5 tombol, sisanya "↩️ Undo All" saja.

## Verification

1. Kirim "🔴 Minyak Goreng" di grup → cek DB qty jadi 0
2. Kirim "🟡 garam, merica" → cek qty masing-masing jadi setengah
3. Kirim "🔴 paha" → cek Paha Filet qty jadi 0
4. Kirim "🟡 bahan yang tidak ada" → dapat feedback item tidak ditemukan
5. Kirim "🔴" saja (tanpa nama) → dapat format error
6. Klik tombol "↩️ Undo" → qty kembali ke sebelum
7. Kirim 🔴 untuk item yang sudah 0 → dapat warning "sudah habis"
8. Kirim batch 5 item dalam 1 pesan → semua terproses

## Risks & Open Questions

1. **Multiple matches**: "minyak" bisa cocok ke 4 item. Prompt AI + fallback rapidfuzz sudah handle.
2. **Decimal handling**: Floor untuk discrete units (pcs/pack), float untuk continuous (gram/ml).
3. **Race condition**: 2 user kirim 🔴 item sama. Perlu lock per-item. Implementasi: `_item_locks = {}` dengan `asyncio.Lock()` per `_id`.
4. **Confirmation**: Langsung execute, tapi sediakan undo. Untuk 🔴 (destructive), bisa tambah konfirmasi "Yakin?" untuk item qty besar (>50% threshold).
5. **Group scope**: Hanya grup STOCK_GROUP_ID. Cek `update.effective_chat.id`.
6. **Memory leak**: `_stock_reaction_history` perlu cleanup. Cron job tiap 10 menit hapus entry > 5 menit.
7. **Undo expired**: Kalau user klik undo setelah >5 menit, reply "⏰ Undo expired (maks 5 menit)."

---

## Marketlist Detail — Auto Kirim Setelah Stock Deduction

Setelah 🔴 atau 🟡 diproses, bot otomatis mengirim **Marketlist Detail** ke grup — daftar bahan yang perlu dibeli berdasarkan stok terkini (yang sudah dikurangi).

### Format Output

```
🛒 Marketlist Detail — 14/05 10:13

🏪 Merpati Plastik 🧁 Toko Bahan Kue
📞 0812-2287-5454
  • Kentang — 3 kg @ Rp65.000 = Rp195.000
  • Merica — 0.25 kg @ Rp80.000 = Rp20.000
  💰 Subtotal: Rp215.000

🏪 Warman 🏷 supplier
  • Bernardi Horeca Sosis — 2 kg @ Rp70.500 = Rp141.000
  💰 Subtotal: Rp141.000

────────────────────────────
🛍 Total: 23 item • Rp152.933.650
```

### Data Flow

```
🔴/🟡 action applied
  ↓
Panggil inventory.get_all_inventory() — data terbaru
  ↓
Filter items yang perlu dibeli:
  qty <= lowStockThreshold (stok menipis)
  ↓
Hitung qty beli:
  🔴 item (qty=0): buy_qty = threshold (beli full threshold)
  🟡 item (qty÷2): buy_qty = max(0, threshold - qty_baru)
  ↓
Group per merchant (preferredStoreId)
  ↓
Ambil nama + phone + category dari pos_inventory_stores
  ↓
Hitung subtotal per merchant + grand total
  ↓
Format & kirim ke grup marketlist
```

### Step: Buat Fungsi `_generate_marketlist_detail()`

```python
async def _generate_marketlist_detail() -> str:
    """Generate marketlist detail dari inventory yang stoknya menipis."""
    all_inv = await inventory.get_all_inventory()
    stores = await _get_stores()  # pos_inventory_stores
    
    items_to_buy = []
    for item in all_inv:
        name = item.get("ingredientName", "")
        qty = float(item.get("quantity") or 0)
        th = float(item.get("lowStockThreshold") or 0)
        price = float(item.get("lastPurchasePrice") or 0)
        unit = (item.get("unit") or "").strip()
        store_id = (item.get("preferredStoreId") or "") or ""
        
        if th <= 0 or qty > th:
            continue
        
        buy_qty = th - qty  # berapa yang perlu dibeli
        total_cost = buy_qty * price
        
        items_to_buy.append({
            "name": name, "buy_qty": buy_qty, "unit": unit,
            "price": price, "total": total_cost, "store_id": store_id
        })
    
    # Group per merchant
    groups = {}
    for item in items_to_buy:
        store = stores.get(item["store_id"], {"name": "Lainnya", "phone": "", "category": ""})
        sid = item["store_id"]
        if sid not in groups:
            groups[sid] = {"store": store, "items": [], "subtotal": 0}
        groups[sid]["items"].append(item)
        groups[sid]["subtotal"] += item["total"]
    
    # Format output
    lines = [f"🛒 Marketlist Detail — {datetime.now(WIB):%d/%m %H:%M}", ""]
    total_items = 0
    grand_total = 0
    
    for sid, grp in sorted(groups.items()):
        store = grp["store"]
        name = store.get("name", "Lainnya")
        phone = store.get("phone", "")
        cat = f" {store.get('type') or store.get('category', '') or ''}"
        
        lines.append(f"🏪 {name}{' 🏷' + cat if cat.strip() else ''}")
        if phone:
            lines.append(f"📞 {phone}")
        for item in grp["items"]:
            lines.append(f"  • {item['name']} — {item['buy_qty']:g} {item['unit']} @ Rp{item['price']:,.0f} = Rp{item['total']:,.0f}")
        lines.append(f"  💰 Subtotal: Rp{grp['subtotal']:,.0f}")
        lines.append("")
        total_items += len(grp["items"])
        grand_total += grp["subtotal"]
    
    lines.append("─" * 28)
    lines.append(f"🛍 Total: {total_items} item • Rp{grand_total:,.0f}")
    
    return "\n".join(lines)
```

### Integration Point

Setelah `_apply_stock_deductions()` selesai, panggil `_generate_marketlist_detail()` dan kirim sebagai reply ke pesan user:

```python
# Di handle_stock_reaction(), setelah PATCH selesai:
marketlist_text = await _generate_marketlist_detail()
await msg.reply_text(marketlist_text)
```

### Format Rules

| Element | Format | Contoh |
|---|---|---|
| Header | `🛒 Marketlist Detail — DD/MM HH:MM` | 🛒 Marketlist Detail — 14/05 10:13 |
| Merchant | `🏪 {Nama} {emoji_kategori}` | 🏪 Merpati Plastik 🧁 Toko Bahan Kue |
| Phone | `📞 {nomor}` | 📞 0812-2287-5454 |
| Item | `  • {nama} — {qty} {unit} @ Rp{harga} = Rp{total}` |   • Kentang — 3 kg @ Rp65.000 = Rp195.000 |
| Subtotal | `  💰 Subtotal: Rp{nilai}` |   💰 Subtotal: Rp215.000 |
| Separator | `─` × 28 | ──────────────────────────── |
| Footer | `🛍 Total: {N} item • Rp{grand_total}` | 🛍 Total: 23 item • Rp152.933.650 |

### Edge Cases

1. **Tidak ada item yang perlu dibeli**: Kirim "✅ Semua stok aman. Tidak ada yang perlu dibeli."
2. **Item tanpa harga (price=0)**: Tampilkan `Rp0` dan jangan hitung di subtotal, atau tambah "💰 Harga belum diinput"
3. **Item tanpa merchant (no preferredStoreId)**: Group ke "🏪 Lainnya"
4. **Buy qty terlalu kecil**: Untuk gram/ml, jika buy_qty < 100 tampilkan dalam gram (misal "50 gram"), jika ≥ 1000 tampilkan dalam kg ("1.5 kg"). Untuk pcs/pack, bulatkan ke atas (ceil).
5. **Merchant tanpa phone**: Jangan tampilkan baris 📞

### Additional Files Changed

| File | Action | Description |
|---|---|---|
| `yumi-purchasing-agent/app.py` | **EDIT** | Tambah `_generate_marketlist_detail()`, panggil setelah stock deduction |
| `yumi-purchasing-agent/marketlist.py` | **EDIT** | Atau reuse fungsi format yang sudah ada |

