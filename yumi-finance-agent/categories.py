"""categories.py — Kategori keuangan & auto-kategorisasi berbasis keyword."""

import re

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
