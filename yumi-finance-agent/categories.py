"""categories.py — Kategori keuangan & auto-kategorisasi berbasis keyword."""

import re
import os
import logging
import httpx
import json

logger = logging.getLogger("yumi-finance.categories")

# ── Master kategori ────────────────────────────────────────────────
# Kategori spesifik untuk café/resto — Djiwa Tentram Cafe & Resto
FINANCE_CATEGORIES = {
    # ── Income ──────────────────────────────────────────────────
    "penjualan": {
        "label": "Penjualan",
        "icon": "💰",
        "type": "income",
        "keywords": [
            "penjualan", "omzet", "order", "pesanan", "dine in",
            "takeaway", "online", "gojek", "grab", "shopee",
        ],
    },

    # ── Expense: Bahan Baku ────────────────────────────────────
    "bahan_minuman": {
        "label": "Bahan Minuman",
        "icon": "☕",
        "type": "expense",
        "keywords": [
            # Kopi
            "kopi", "coffee", "biji kopi", "coffee bean", "robusta", "arabica",
            "espresso", "latte", "cappuccino", "americano", "cold brew",
            "kopi bubuk", "kopi sachet", "kopi instan", "ground coffee",
            "luwak", "gayo", "toraja", "mandailing", "kopi robusta",
            # Susu & Creamer
            "susu", "milk", "creamer", "krimer", "fresh milk", "uht",
            "susu segar", "susu kental", "susu evaporated", "susu almond",
            "susu oat", "oat milk", "soy milk", "susu kedelai",
            "whipped cream", "whip cream", "foam", "steam milk",
            # Sirup & Pemanis
            "sirup", "syrup", "monin", "torani", "da vinci", "caramel",
            "vanilla", "hazelnut", "chocolate", "coklat", "mocha",
            "gula aren", "brown sugar", "palm sugar", "gula merah",
            "gula cair", "liquid sugar", "simple syrup", "honey", "madu",
            # Teh & Bubuk
            "teh", "tea", "matcha", "green tea", "black tea", "earl grey",
            "chamomile", "jasmine", "teh tarik", "thai tea", "taro",
            "coklat bubuk", "cocoa", "red velvet", "milkshake", "smoothie",
            # Es & Air
            "es batu", "ice cube", "ice block", "es kristal",
            "air mineral", "aqua", "le minerale", "nestle",
        ],
        "item_keywords": [
            "kopi", "coffee", "robusta", "arabica", "espresso", "latte",
            "susu", "milk", "creamer", "krimer", "uht", "fresh milk",
            "sirup", "syrup", "monin", "torani", "caramel", "vanilla",
            "teh", "tea", "matcha", "taro", "coklat bubuk", "cocoa",
            "gula aren", "brown sugar", "whip", "foam",
            "es batu", "ice", "aqua", "mineral",
        ],
    },
    "bahan_makanan": {
        "label": "Bahan Makanan",
        "icon": "🍳",
        "type": "expense",
        "keywords": [
            # Karbohidrat
            "beras", "nasi", "rice", "mie", "noodle", "pasta", "spaghetti",
            "fettuccine", "indomie", "mie instan", "kwetiau", "bihun", "vermicelli",
            "roti", "bread", "tortilla", "burger bun", "hotdog bun",
            # Tepung & Adonan
            "tepung", "flour", "terigu", "tapioka", "maizena", "sagu",
            "corn starch", "breadcrumb", "baking powder", "ragi",
            # Minyak & Lemak
            "minyak", "oil", "minyak goreng", "cooking oil", "olive oil",
            "mentega", "butter", "margarin", "wisman", "blue band",
            "butter", "anchor", "elle vire",
            # Protein
            "daging", "meat", "ayam", "chicken", "sapi", "beef", "kambing",
            "ikan", "fish", "udang", "shrimp", "cumi", "squid", "telur", "egg",
            "tahu", "tofu", "tempe", "nugget", "sosis", "bakso",
            # Bumbu & Saus
            "bumbu", "seasoning", "kecap", "saos", "saus", "sambal",
            "garam", "salt", "merica", "pepper", "lada", "ketumbar",
            "bawang putih", "garlic", "bawang merah", "shallot", "jahe",
            "kunyit", "lengkuas", "serai", "daun salam", "kemiri",
            "cabe", "cabai", "chili", "paprika", "bombay", "onion",
            "kaldu", "broth", "stock", "royco", "maggi", "masako",
        ],
        "item_keywords": [
            "beras", "mie", "indomie", "pasta", "roti", "bread",
            "tepung", "flour", "terigu", "maizena", "tapioka",
            "minyak", "oil", "mentega", "butter", "margarin",
            "daging", "ayam", "sapi", "ikan", "udang", "telur",
            "tahu", "tempe", "nugget", "sosis", "bakso",
            "bumbu", "kecap", "saos", "saus", "sambal",
            "garam", "merica", "lada", "royco", "masako",
        ],
    },
    "bahan_segar": {
        "label": "Sayur & Bahan Segar",
        "icon": "🥬",
        "type": "expense",
        "keywords": [
            # Sayuran
            "sayur", "sayuran", "vegetable", "selada", "lettuce", "kol", "cabbage",
            "wortel", "carrot", "tomat", "tomato", "mentimun", "timun", "cucumber",
            "brokoli", "broccoli", "kembang kol", "cauliflower", "seledri",
            "bayam", "spinach", "kangkung", "sawi", "pakcoy", "caisim",
            "kentang", "potato", "ubi", "singkong", "jagung", "corn",
            "jamur", "mushroom", "terong", "buncis", "kacang panjang",
            # Buah
            "buah", "fruit", "jeruk", "orange", "lemon", "lime",
            "alpukat", "avocado", "pisang", "banana", "stroberi", "strawberry",
            "mangga", "mango", "nanas", "pineapple", "semangka", "melon",
            "anggur", "grape", "apel", "apple", "pir", "pear",
            # Herba & Rempah Segar
            "daun mint", "mint", "basil", "kemangi", "rosemary", "thyme",
            "daun bawang", "spring onion", "seledri segar",
            # Susu & Produk Segar
            "yogurt", "yoghurt", "keju", "cheese", "cheddar", "mozzarella",
            "cream cheese", "mascarpone", "parmesan",
        ],
        "item_keywords": [
            "sayur", "selada", "lettuce", "kol", "wortel", "tomat",
            "brokoli", "bayam", "kangkung", "sawi", "kentang",
            "buah", "jeruk", "lemon", "alpukat", "pisang", "stroberi",
            "mint", "basil", "kemangi", "daun bawang",
            "yogurt", "keju", "cheese", "cheddar", "mozzarella",
        ],
    },

    # ── Expense: Operasional Café ──────────────────────────────
    "packaging": {
        "label": "Packaging & Wadah",
        "icon": "📦",
        "type": "expense",
        "keywords": [
            # Gelas & Cup
            "cup", "gelas", "lid", "tutup", "dome lid", "flat lid",
            "paper cup", "plastic cup", "hot cup", "cold cup",
            "gelas kertas", "gelas plastik", "cup sealing",
            # Kemasan
            "plastik", "plastic", "kantong", "tas", "bag", "paper bag",
            "kotak", "box", "styrofoam", "aluminium foil", "cling wrap",
            # Sedotan & Alat Makan
            "sedotan", "straw", "sendok", "spoon", "garpu", "fork",
            "sumpit", "tusuk", "stirrer", "pengaduk",
            # Tissue & Lap
            "tisu", "tissue", "napkin", "serbet", "lap", "towel",
            "kertas", "paper", "receipt", "struk", "thermal paper",
        ],
        "item_keywords": [
            "cup", "gelas", "lid", "tutup", "sedotan", "straw",
            "plastik", "kantong", "tas", "kotak", "box",
            "sendok", "garpu", "tisu", "napkin", "serbet",
            "kertas", "thermal", "aluminium", "cling",
        ],
    },
    "cleaning": {
        "label": "Cleaning & Sanitasi",
        "icon": "🧹",
        "type": "expense",
        "keywords": [
            "sabun", "soap", "deterjen", "detergent", "pembersih",
            "cleaner", "disinfektan", "karbol", "wipol", "sos",
            "spons", "sponge", "sikat", "brush", "kanebo",
            "pel", "mop", "ember", "bucket", "sarung tangan", "gloves",
            "hand sanitizer", "sanitizer", "alkohol", "alcohol",
            "pembersih lantai", "pembersih kaca", "glass cleaner",
            "kamper", "kapur barus", "pengharum", "air freshener",
            "trash bag", "sampah", "garbage",
        ],
        "item_keywords": [
            "sabun", "soap", "deterjen", "pembersih", "cleaner",
            "disinfektan", "karbol", "wipol", "spons", "sikat",
            "pel", "mop", "sanitizer", "alkohol", "pengharum",
        ],
    },
    "gas_energi": {
        "label": "Gas & Energi",
        "icon": "🔥",
        "type": "expense",
        "keywords": [
            "gas", "lpg", "elpiji", "gas elpiji", "tabung gas",
            "bright gas", "gas 3kg", "gas 12kg", "isian gas",
            "listrik", "pln", "token", "pulsa listrik", "electricity",
            "token listrik", "voucher listrik",
            "air", "pdam", "air bersih", "water",
        ],
        "item_keywords": [
            "gas", "lpg", "elpiji", "tabung", "bright gas",
            "token", "listrik", "pln", "pdam", "pulsa",
        ],
    },
    "peralatan": {
        "label": "Peralatan & Mesin",
        "icon": "🔧",
        "type": "expense",
        "keywords": [
            # Mesin Kopi
            "mesin kopi", "coffee machine", "grinder", "penggiling",
            "espresso machine", "portafilter", "tamper", "group head",
            # Blender & Alat Dapur
            "blender", "mixer", "juicer", "toaster", "oven", "microwave",
            "kompor", "stove", "fryer", "deep fryer", "rice cooker",
            # Peralatan
            "pisau", "knife", "talenan", "wajan", "pan", "panci", "pot",
            "spatula", "saringan", "strainer", "timbangan", "scale",
            "termometer", "thermometer", "timer", "jigger", "shaker",
            # Perbaikan
            "service", "perbaikan", "maintenance", "renovasi",
            "spare part", "suku cadang", "filter", "gasket",
            "kulkas", "freezer", "chiller", "refrigerator", "ac",
        ],
        "item_keywords": [
            "mesin", "grinder", "blender", "mixer", "kompor", "oven",
            "pisau", "wajan", "panci", "spatula", "timbangan",
            "service", "spare part", "filter", "gasket",
            "kulkas", "freezer", "chiller", "ac",
            "portafilter", "tamper", "shaker", "jigger",
        ],
    },

    # ── Expense: Non-Bahan ────────────────────────────────────
    "gaji": {
        "label": "Gaji & Honor",
        "icon": "👥",
        "type": "expense",
        "keywords": [
            "gaji", "honor", "upah", "thr", "bonus", "lembur",
            "staff", "karyawan", "barista", "kasir", "koki",
            "chef", "waiter", "waitress", "pelayan", "kitchen",
        ],
    },
    "transport": {
        "label": "Transport & Delivery",
        "icon": "🚗",
        "type": "expense",
        "keywords": [
            "bensin", "solar", "transport", "ojek", "grabcar",
            "gosend", "grabexpress", "kirim", "delivery", "ongkir",
            "parkir", "parking", "tol", "bbm", "pertamina",
        ],
    },
    "promosi": {
        "label": "Promosi & Marketing",
        "icon": "📢",
        "type": "expense",
        "keywords": [
            "iklan", "promosi", "marketing", "spanduk", "banner",
            "instagram", "tiktok", "facebook", "ads", "poster",
            "brosur", "flyer", "mural", "neon box", "signage",
            "menu", "daftar menu", "menu book",
        ],
    },
    "sewa_wifi": {
        "label": "Sewa & Internet",
        "icon": "🏠",
        "type": "expense",
        "keywords": [
            "sewa", "rent", "wifi", "internet", "indihome", "biznet",
            "cctv", "keamanan", "security", "pajak", "tax",
            "asuransi", "insurance",
        ],
    },

    # ── Fallback ───────────────────────────────────────────────
    "operasional": {
        "label": "Operasional Lain",
        "icon": "📋",
        "type": "expense",
        "keywords": [
            "lain", "operasional", "umum", "general", "admin",
            "fotokopi", "print", "atk", "alat tulis",
            "dekorasi", "decoration", "bunga", "flower",
        ],
    },
    "lainnya": {
        "label": "Lainnya",
        "icon": "📌",
        "type": "both",
        "keywords": [],
    },
}

# ── Auto-kategorisasi ──────────────────────────────────────────────


def auto_categorize(text: str, amount: float = 0) -> tuple[str, str]:
    """Cari kategori terbaik berdasarkan keyword di text.
    Returns (category_key, confidence: 'high'|'medium'|'low').
    """
    text_lower = text.lower().strip()

    # Score tiap kategori (termasuk dynamic)
    all_cats = get_all_categories()
    best_cat = "lainnya"
    best_score = 0

    for cat_key, cat_info in all_cats.items():
        if cat_key == "lainnya":
            continue
        keywords = cat_info.get("keywords", [])
        score = 0
        for kw in keywords:
            if kw in text_lower:
                if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
                    score += 3
                else:
                    score += 1
        if score > best_score:
            best_score = score
            best_cat = cat_key

    # Tentukan confidence
    if best_score >= 3:
        confidence = "high"
    elif best_score >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    return best_cat, confidence


def categorize_item(item_name: str, item_price: float = 0) -> tuple[str, str, str]:
    """Kategorikan satu item belanjaan berdasarkan nama dan harga.

    Returns:
        (category_key, confidence: 'high'|'medium'|'low', suggested_label)
        suggested_label diisi jika confidence='low' (untuk membuat kategori baru).
    """
    name_lower = item_name.lower().strip()
    if not name_lower:
        return "lainnya", "low", ""

    best_cat = "lainnya"
    best_score = 0

    # Check semua kategori (built-in + dynamic)
    all_cats = get_all_categories()
    for cat_key, cat_info in all_cats.items():
        if cat_key == "lainnya":
            continue
        # Prioritaskan item_keywords, fallback ke keywords
        keywords = cat_info.get("item_keywords", cat_info.get("keywords", []))
        score = 0
        for kw in keywords:
            if kw in name_lower:
                if re.search(r'\b' + re.escape(kw) + r'\b', name_lower):
                    score += 5  # exact word match
                else:
                    score += 2  # partial match
        if score > best_score:
            best_score = score
            best_cat = cat_key

    # Tentukan confidence
    if best_score >= 5:
        confidence = "high"
    elif best_score >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate suggested label untuk kategori baru
    suggested = ""
    if confidence == "low":
        # Coba tebak dari nama item
        words = [w for w in name_lower.split() if len(w) > 2]
        if words:
            suggested = " ".join(words[:3]).title()
        else:
            suggested = item_name.strip().title()

    return best_cat, confidence, suggested


# ── Dynamic Categories (persisted to pos.categories) ─────────────────

# Cache categories yang di-fetch dari database
_db_categories: dict[str, dict] = {}
_db_categories_loaded = False


def get_all_categories() -> dict[str, dict]:
    """Get gabungan FINANCE_CATEGORIES + dynamic DB categories."""
    merged = dict(FINANCE_CATEGORIES)
    for key, info in _db_categories.items():
        merged[key] = info
    return merged


def add_dynamic_category(cat_key: str, label: str, icon: str = "📌", cat_type: str = "expense"):
    """Tambah kategori dinamis ke cache (akan dipakai untuk matching berikutnya)."""
    _db_categories[cat_key] = {
        "label": label,
        "icon": icon,
        "type": cat_type,
        "keywords": [label.lower(), cat_key.lower()],
    }


def reset_categories_cache():
    """Reset cache (dipanggil saat reload dari DB)."""
    global _db_categories_loaded
    _db_categories.clear()
    _db_categories_loaded = False
def get_category_label(cat_key: str) -> str:
    """Dapatkan label + icon untuk kategori."""
    all_cats = get_all_categories()
    info = all_cats.get(cat_key, all_cats.get("lainnya", FINANCE_CATEGORIES["lainnya"]))
    return f"{info['icon']} {info['label']}"


def categorize_item_with_memory(
    item_name: str,
    item_price: float = 0,
    merchant: str = "",
    memory_manager=None,
) -> tuple[str, str, str, float]:
    """Enhanced categorization: keyword matching + AI memory + merchant hints.

    Args:
        item_name: nama item dari OCR
        item_price: harga satuan
        merchant: nama toko (untuk merchant hint)
        memory_manager: instance MemoryManager (optional)

    Returns:
        (category_key, confidence_label, suggested_label, score_0_to_1)
    """
    # 1. Keyword matching (existing)
    cat_key, cat_conf, suggested = categorize_item(item_name, item_price)
    conf_scores = {"high": 0.8, "medium": 0.5, "low": 0.2}
    score = conf_scores.get(cat_conf, 0.2)

    # 2. AI Memory lookup
    if memory_manager:
        mem_cat, mem_conf = memory_manager.get_item_category(item_name)
        if mem_cat and mem_conf > score:
            cat_key = mem_cat
            score = mem_conf
            cat_conf = "high" if mem_conf > 0.8 else "medium"
            # Don't set suggested — memory match means we found it

    # 3. Merchant hint — if still uncertain
    if memory_manager and merchant and score < 0.7:
        merchant_hint = memory_manager.get_merchant_hint(merchant)
        if merchant_hint:
            typical_cats = merchant_hint.get("typical_categories", {}) or {}
            if typical_cats:
                top_cat = max(typical_cats, key=lambda k: typical_cats.get(k, 0))
                if top_cat != "lainnya" and cat_key == "lainnya":
                    cat_key = top_cat
                    score = 0.6
                    cat_conf = "medium"

    return cat_key, cat_conf, suggested, score


def format_amount(amount: int | float) -> str:
    """Format number with dots: 1500000 → Rp1.500.000"""
    if amount >= 1_000_000:
        return f"Rp{int(amount):,}".replace(",", ".")
    elif amount >= 1_000:
        return f"Rp{int(amount):,}".replace(",", ".")
    else:
        return f"Rp{int(amount):,}"


# ── AI-powered categorization ──────────────────────────────────────

# Cache kategori dinamis: (item_name_lower → category_key)
_ai_category_cache: dict[str, str] = {}

_AI_CAT_SYSTEM_PROMPT = """Kamu adalah asisten kategorisasi item cafe/resto.
Kategorikan SATU item berdasarkan keyword kategorinya.

Kategori yang tersedia:
{category_list}

Aturan:
1. Jawab HANYA dengan kode kategori (satu kata, huruf kecil).
2. Jika item mengandung kata dari keyword kategori, pilih kategori itu.
3. Gunakan akal sehat: "gula" → bahan_minuman, "kresek/kantong/pouch/plastik" → packaging
4. Jangan beri penjelasan, markdown, atau JSON.
5. Jika benar-benar tidak yakin: lainnya

Item: {item_name}"""


async def ai_categorize_item(
    item_name: str,
    item_price: float = 0,
    merchant: str = "",
) -> tuple[str, str, str]:
    """Kategorikan item pakai AI (LLM via 9router).

    Returns:
        (category_key, confidence, suggested_label)
    """
    name_lower = item_name.lower().strip()
    if not name_lower:
        return "lainnya", "low", ""

    # 1. Cek cache dulu (biar cepat & konsisten)
    cached = _ai_category_cache.get(name_lower)
    if cached:
        cat_info = get_all_categories().get(cached, {})
        label = cat_info.get("label", cached.title())
        return cached, "high", label

    # 2. Cek keyword matching dulu — kalo high confidence, skip AI
    cat_key, cat_conf, suggested = categorize_item(item_name, item_price)
    if cat_conf == "high":
        _ai_category_cache[name_lower] = cat_key
        return cat_key, "high", ""

    # 3. Panggil LLM via 9router
    all_cats = get_all_categories()
    cat_lines = []
    for k, v in all_cats.items():
        if k == "lainnya":
            continue
        label = v.get("label", k)
        keywords = v.get("item_keywords", v.get("keywords", []))
        kw_str = ", ".join(keywords[:8])
        cat_lines.append(f"  {k}: {label} — cocok untuk: {kw_str}")

    category_list_str = "\n".join(cat_lines)
    prompt = _AI_CAT_SYSTEM_PROMPT.format(
        category_list=category_list_str,
        item_name=item_name,
    )

    try:
        base_url = os.getenv("NINEROUTER_BASE_URL", "http://127.0.0.1:20128/v1")
        api_key = os.getenv("SUMOPOD_API_KEY", "")
        model = os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": f"Kategorikan item: {item_name}"},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 300,
                    "stream": False,
                },
            )
            resp.raise_for_status()

            # Handle streaming response (SSE chunks)
            raw = resp.text
            content = ""
            for line in raw.split("\n"):
                line = line.strip()
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        chunk = json.loads(line[6:])
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta:
                            content += delta["content"]
                    except (json.JSONDecodeError, IndexError, KeyError):
                        pass

            if not content:
                # Non-streaming response
                result = resp.json()
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")

            ai_cat = content.strip().lower()

            # Handle JSON wrapping (```json {...}``` or bare JSON)
            if ai_cat.startswith("```"):
                import re as _re
                m = _re.search(r"```(?:json)?\s*([\s\S]*?)```", ai_cat)
                if m:
                    ai_cat = m.group(1).strip().lower()
            if ai_cat.startswith("{"):
                try:
                    parsed = json.loads(ai_cat)
                    ai_cat = parsed.get("category") or parsed.get("key") or ai_cat
                except json.JSONDecodeError:
                    pass

            # Strip non-alphanumeric
            ai_cat = re.sub(r"[^a-z0-9_\s]", "", ai_cat).strip()

            # Try to extract first valid category from multi-word response
            if ai_cat not in all_cats and " " in ai_cat:
                words = ai_cat.split()
                for w in words:
                    wc = w.strip().lower()
                    if wc in all_cats:
                        ai_cat = wc
                        break

            # Last resort: keyword matching on model's response words
            if ai_cat not in all_cats and ai_cat:
                response_keywords = {
                    "packaging": "packaging", "wrap": "packaging", "bag": "packaging",
                    "plastic": "packaging", "container": "packaging",
                    "drink": "bahan_minuman", "beverage": "bahan_minuman", "minuman": "bahan_minuman",
                    "food": "bahan_makanan", "makanan": "bahan_makanan", "ingredient": "bahan_makanan",
                    "bahan": "bahan_makanan",
                    "vegetable": "bahan_segar", "sayur": "bahan_segar",
                    "clean": "cleaning", "cleaning": "cleaning",
                    "equipment": "peralatan", "alat": "peralatan",
                }
                words = ai_cat.lower().split()
                for w in words:
                    if w in response_keywords:
                        ai_cat = response_keywords[w]
                        break

        # Validasi: kalo response bukan kategori valid, fallback
        if ai_cat in all_cats:
            # Cache hasil AI
            _ai_category_cache[name_lower] = ai_cat
            category_info = all_cats.get(ai_cat, {})
            label = category_info.get("label", ai_cat.title())
            return ai_cat, "high", label

        # AI returned something weird — fallback ke keyword
        logger.warning("AI returned unknown category '%s' for '%s'", ai_cat, item_name)
        return cat_key, cat_conf, suggested

    except Exception as e:
        logger.warning("AI categorization failed for '%s': %s", item_name, e)
        return cat_key, cat_conf, suggested


async def auto_create_category_in_db(
    supabase_url: str,
    supabase_key: str,
    label: str,
    icon: str = "📌",
    cat_type: str = "expense",
) -> str | None:
    """Auto-create category di pos.categories (Supabase) + cache lokal.

    Returns category_key (slug) atau None jika gagal.
    """
    # Generate key dari label
    cat_key = re.sub(r'[^a-z0-9]', '_', label.lower().strip())
    cat_key = re.sub(r'_+', '_', cat_key).strip('_')
    if not cat_key:
        return None

    # Cek apakah sudah ada
    all_cats = get_all_categories()
    if cat_key in all_cats:
        return cat_key  # Already exists

    payload = {
        "name": label,
        "key": cat_key,
        "icon": icon,
        "type": cat_type,
    }

    try:
        rest_url = supabase_url.rstrip("/")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{rest_url}/rest/v1/pos.categories",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=payload,
            )
            if resp.status_code in (200, 201, 204):
                # Cache locally
                add_dynamic_category(cat_key, label, icon, cat_type)
                logger.info("Created dynamic category: %s (%s)", cat_key, label)
                return cat_key
            else:
                logger.warning("Failed to create category: %s %s", resp.status_code, resp.text)
                # Even if DB fails, cache locally
                add_dynamic_category(cat_key, label, icon, cat_type)
                return cat_key
    except Exception as e:
        logger.warning("Failed to create category in DB: %s", e)
        # Still cache locally
        add_dynamic_category(cat_key, label, icon, cat_type)
        return cat_key


def clear_ai_category_cache():
    """Reset AI cache (dipanggil saat reload)."""
    _ai_category_cache.clear()
