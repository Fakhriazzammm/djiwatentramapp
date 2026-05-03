"""categories.py — Kategori keuangan & auto-kategorisasi berbasis keyword."""

import re

# ── Master kategori ────────────────────────────────────────────────
FINANCE_CATEGORIES = {
    # Income
    "penjualan": {
        "label": "Penjualan",
        "icon": "💰",
        "type": "income",
        "keywords": [
            "penjualan", "omzet", "order", "pesanan", "dine in",
            "takeaway", "online", "gojek", "grab", "shopee",
        ],
    },
    # Expense
    "belanja_stok": {
        "label": "Belanja Stok",
        "icon": "📦",
        "type": "expense",
        "keywords": [
            "beli", "belanja", "stok", "bahan", "baku", "restok",
            "gula", "kopi", "susu", "teh", "sirup", "cream",
            "sayur", "buah", "daging", "ayam", "ikan", "telur",
            "tepung", "minyak", "bumbu", "kecap", "saos", "saus",
            "beras", "mie", "indomie",
        ],
    },
    "utilitas": {
        "label": "Utilitas",
        "icon": "💡",
        "type": "expense",
        "keywords": [
            "listrik", "air", "wifi", "pdam", "pln", "pulsa",
            "internet", "telepon", "sewa",
        ],
    },
    "gaji": {
        "label": "Gaji & Honor",
        "icon": "👥",
        "type": "expense",
        "keywords": [
            "gaji", "honor", "upah", "thr", "bonus", "lembur",
            "staff", "karyawan",
        ],
    },
    "transportasi": {
        "label": "Transportasi",
        "icon": "🚗",
        "type": "expense",
        "keywords": [
            "bensin", "solar", "transport", "ojek", "grabcar",
            "gosend", "kirim", "delivery", "ongkir",
        ],
    },
    "promosi": {
        "label": "Promosi & Marketing",
        "icon": "📢",
        "type": "expense",
        "keywords": [
            "iklan", "promosi", "marketing", "spanduk", "banner",
            "instagram", "tiktok", "facebook", "ads",
        ],
    },
    "perawatan": {
        "label": "Perawatan & Perbaikan",
        "icon": "🔧",
        "type": "expense",
        "keywords": [
            "service", "perbaikan", "renovasi", "ac", "kulkas",
            "mesin", "alat", "perawatan", "maintenance",
        ],
    },
    "operasional": {
        "label": "Operasional Lain",
        "icon": "📋",
        "type": "expense",
        "keywords": [
            "kertas", "plastik", "gelas", "sendok", "cup", "lid",
            "tas", "kantong", "serbet", "tisu", "cleaning",
            "sabun", "pembersih",
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

    # Score tiap kategori
    best_cat = "lainnya"
    best_score = 0

    for cat_key, cat_info in FINANCE_CATEGORIES.items():
        if cat_key == "lainnya":
            continue
        keywords = cat_info["keywords"]
        score = 0
        for kw in keywords:
            if kw in text_lower:
                # Weight: exact word match > partial match
                if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
                    score += 3
                else:
                    score += 1
        # Bonus untuk jumlah kata yang match
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


def get_category_label(cat_key: str) -> str:
    """Dapatkan label + icon untuk kategori."""
    info = FINANCE_CATEGORIES.get(cat_key, FINANCE_CATEGORIES["lainnya"])
    return f"{info['icon']} {info['label']}"


def format_amount(amount: int | float) -> str:
    """Format number with dots: 1500000 → Rp1.500.000"""
    if amount >= 1_000_000:
        return f"Rp{int(amount):,}".replace(",", ".")
    elif amount >= 1_000:
        return f"Rp{int(amount):,}".replace(",", ".")
    else:
        return f"Rp{int(amount):,}"
