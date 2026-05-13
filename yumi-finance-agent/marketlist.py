"""
Marketlist module untuk yumi-ai-bot.
Mengirim daftar belanja bahan baku ke grup Telegram.
Dengan AI-powered auto supplier category tagging.
"""
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))

# Ingredient → category mapping (dibuild saat startup)
INGREDIENT_CATEGORY: dict[str, str] = {}

# ── Supplier Category Auto-Tag ────────────────────────────────
# Keyword fallback mapping. AI takes priority; this catches what AI misses.
_SUPPLIER_CAT_KEYWORDS: list[tuple[str, str, str]] = [
    ("telur ayam", "Bhn Fresh", "Bahan Baku Fresh"),
    ("telor ayam", "Bhn Fresh", "Bahan Baku Fresh"),
    ("telur", "Bhn Fresh", "Bahan Baku Fresh"),
    ("telor", "Bhn Fresh", "Bahan Baku Fresh"),
    ("arabica", "Roastery", "Roastery"),
    ("robusta", "Roastery", "Roastery"),
    ("single origin", "Roastery", "Roastery"),
    ("bajawa", "Roastery", "Roastery"),
    ("beans", "Roastery", "Roastery"),
    ("minyak bawang putih", "Bhn Kue", "Toko Bahan Kue"),
    ("minyak wijen", "Bhn Kue", "Toko Bahan Kue"),
    ("minyak goreng", "Bhn Kue", "Toko Bahan Kue"),
    ("minyak", "Bhn Kue", "Toko Bahan Kue"),
    ("saus tomat", "Bhn Kue", "Toko Bahan Kue"),
    ("saus sambel", "Bhn Kue", "Toko Bahan Kue"),
    ("saus tiram", "Bhn Kue", "Toko Bahan Kue"),
    ("saus mustard", "Bhn Kue", "Toko Bahan Kue"),
    ("saus inggris", "Bhn Kue", "Toko Bahan Kue"),
    ("saus", "Bhn Kue", "Toko Bahan Kue"),
    ("nasi ayam", "Bhn Fresh", "Bahan Baku Fresh"),
    ("nasi goreng", "Bhn Fresh", "Bahan Baku Fresh"),
    ("nasi", "Bhn Fresh", "Bahan Baku Fresh"),
    ("bubur", "Bhn Fresh", "Bahan Baku Fresh"),
    ("yamin", "Bhn Fresh", "Bahan Baku Fresh"),
    ("kecap ikan", "Bhn Kue", "Toko Bahan Kue"),
    ("kecap inggris", "Bhn Kue", "Toko Bahan Kue"),
    ("kecap asin", "Bhn Kue", "Toko Bahan Kue"),
    ("kecap manis", "Bhn Kue", "Toko Bahan Kue"),
    ("dark soy", "Bhn Kue", "Toko Bahan Kue"),
    ("kecap", "Bhn Kue", "Toko Bahan Kue"),
    ("lada bubuk", "Bhn Kue", "Toko Bahan Kue"),
    ("lada hitam", "Bhn Kue", "Toko Bahan Kue"),
    ("lada", "Bhn Kue", "Toko Bahan Kue"),
    ("merica", "Bhn Kue", "Toko Bahan Kue"),
    ("garlic powder", "Bhn Kue", "Toko Bahan Kue"),
    ("paprika powder", "Bhn Kue", "Toko Bahan Kue"),
    ("bawang goreng", "Bhn Fresh", "Bahan Baku Fresh"),
    ("micin", "Bhn Kue", "Toko Bahan Kue"),
    ("kaldu", "Bhn Kue", "Toko Bahan Kue"),
    ("angkak", "Bhn Kue", "Toko Bahan Kue"),
    ("garam", "Bhn Kue", "Toko Bahan Kue"),
    ("gula pasir", "Bhn Kue", "Toko Bahan Kue"),
    ("gula aren", "Bhn Kue", "Toko Bahan Kue"),
    ("palm sugar", "Bhn Kue", "Toko Bahan Kue"),
    ("fresh milk", "Milk", "Milk"),
    ("freshmilk", "Milk", "Milk"),
    ("greenfield", "Milk", "Milk"),
    ("sirup", "Sirup", "Sirup"),
    ("monin", "Sirup", "Sirup"),
    ("sunquick", "Sirup", "Sirup"),
    ("daging ayam", "Daging", "Daging"),
    ("daging sapi", "Daging", "Daging"),
    ("daging", "Daging", "Daging"),
    ("ayam cincang", "Daging", "Daging"),
    ("ayam giling", "Daging", "Daging"),
    ("ayam", "Daging", "Daging"),
    ("sapi cincang", "Daging", "Daging"),
    ("sapi", "Daging", "Daging"),
    ("cincang", "Daging", "Daging"),
    ("fillet", "Daging", "Daging"),
    ("paha", "Daging", "Daging"),
    ("patty", "Daging", "Daging"),
    ("hamburg", "Daging", "Daging"),
    ("baso", "Daging", "Daging"),
    ("bakso", "Daging", "Daging"),
    ("sosis", "Daging", "Daging"),
    ("bernardi", "Daging", "Daging"),
    ("kulit ayam", "Daging", "Daging"),
    ("tulang", "Daging", "Daging"),
    ("ngohion", "Daging", "Daging"),
    ("tongcai", "Daging", "Daging"),
    ("tepung", "Bhn Kue", "Toko Bahan Kue"),
    ("terigu", "Bhn Kue", "Toko Bahan Kue"),
    ("margarin", "Bhn Kue", "Toko Bahan Kue"),
    ("butter", "Bhn Kue", "Toko Bahan Kue"),
    ("keju", "Bhn Kue", "Toko Bahan Kue"),
    ("mozarella", "Bhn Kue", "Toko Bahan Kue"),
    ("cheddar", "Bhn Kue", "Toko Bahan Kue"),
    ("white cream", "Bhn Kue", "Toko Bahan Kue"),
    ("whipped cream", "Bhn Kue", "Toko Bahan Kue"),
    ("cream", "Bhn Kue", "Toko Bahan Kue"),
    ("mayones", "Bhn Kue", "Toko Bahan Kue"),
    ("mayonaise", "Bhn Kue", "Toko Bahan Kue"),
    ("maestro", "Bhn Kue", "Toko Bahan Kue"),
    ("tapioka", "Bhn Kue", "Toko Bahan Kue"),
    ("maizena", "Bhn Kue", "Toko Bahan Kue"),
    ("vanilla", "Bhn Kue", "Toko Bahan Kue"),
    ("roti", "Bhn Kue", "Toko Bahan Kue"),
    ("bread", "Bhn Kue", "Toko Bahan Kue"),
    ("fla", "Bhn Kue", "Toko Bahan Kue"),
    ("coconut delight", "Bhn Minum", "Bahan Minuman"),
    ("susu coconut", "Bhn Minum", "Bahan Minuman"),
    ("matcha", "Bhn Minum", "Bahan Minuman"),
    ("coklat powder", "Bhn Minum", "Bahan Minuman"),
    ("coklat bubuk", "Bhn Minum", "Bahan Minuman"),
    ("susu kental", "Bhn Minum", "Bahan Minuman"),
    ("skm", "Bhn Minum", "Bahan Minuman"),
    ("carnation", "Bhn Minum", "Bahan Minuman"),
    ("frisianflag", "Bhn Minum", "Bahan Minuman"),
    ("sprite", "Bhn Minum", "Bahan Minuman"),
    ("c1000", "Bhn Minum", "Bahan Minuman"),
    ("pulpy", "Bhn Minum", "Bahan Minuman"),
    ("big cola", "Bhn Minum", "Bahan Minuman"),
    ("apple juice", "Bhn Minum", "Bahan Minuman"),
    ("schweppes", "Bhn Minum", "Bahan Minuman"),
    ("soda water", "Bhn Minum", "Bahan Minuman"),
    ("lemon tea", "Bhn Minum", "Bahan Minuman"),
    ("max tea", "Bhn Minum", "Bahan Minuman"),
    ("peach tea", "Bhn Minum", "Bahan Minuman"),
    ("bawang bombai", "Sayur", "Sayur"),
    ("bawang merah", "Sayur", "Sayur"),
    ("bawang putih", "Sayur", "Sayur"),
    ("bawang daun", "Sayur", "Sayur"),
    ("bawang", "Sayur", "Sayur"),
    ("cabe", "Sayur", "Sayur"),
    ("selada", "Sayur", "Sayur"),
    ("timun", "Sayur", "Sayur"),
    ("kentang", "Sayur", "Sayur"),
    ("mix vegetable", "Sayur", "Sayur"),
    ("jeruk limau", "Sayur", "Sayur"),
    ("pisang", "Sayur", "Sayur"),
    ("kemiri", "Sayur", "Sayur"),
    ("sereh", "Sayur", "Sayur"),
    ("daun", "Sayur", "Sayur"),
    ("basil", "Sayur", "Sayur"),
    ("rosemary", "Sayur", "Sayur"),
    ("oregano", "Sayur", "Sayur"),
    ("kayu manis", "Sayur", "Sayur"),
    ("es batu", "Es Batu", "Es Batu"),
    ("air galon", "Galon", "Galon"),
    ("galon", "Galon", "Galon"),
    ("air mineral", "Galon", "Galon"),
    ("cleo", "Galon", "Galon"),
    ("le mineral", "Galon", "Galon"),
    ("ebi", "Bhn Fresh", "Bahan Baku Fresh"),
    ("wijen", "Bhn Fresh", "Bahan Baku Fresh"),
    ("beras", "Bhn Fresh", "Bahan Baku Fresh"),
    ("kemangi", "Bhn Fresh", "Bahan Baku Fresh"),
    ("ubi", "Ubi", "Ubi"),
    ("cireng", "Bhn Fresh", "Bahan Baku Fresh"),
    ("kerupuk", "Bhn Fresh", "Bahan Baku Fresh"),
    ("cup", "Packaging", "Packaging"),
    ("botol", "Packaging", "Packaging"),
    ("sedotan", "Packaging", "Packaging"),
    ("kresek", "Packaging", "Packaging"),
    ("tutup", "Packaging", "Packaging"),
    ("bento", "Packaging", "Packaging"),
    ("paperbowl", "Packaging", "Packaging"),
    ("sendok garpu", "Packaging", "Packaging"),
    ("cling", "Packaging", "Packaging"),
    ("soklin", "Cleaning", "Cleaning"),
    ("lifebuoy", "Cleaning", "Cleaning"),
    ("multi tisu", "Cleaning", "Cleaning"),
    ("gas", "Gas", "Gas"),
    ("baterai", "Gas", "Gas"),
    ("hoisin", "Bhn Kue", "Toko Bahan Kue"),
    ("barbeque", "Bhn Kue", "Toko Bahan Kue"),
    ("bubuk", "Bhn Minum", "Bahan Minuman"),
    ("richgold", "Bhn Kue", "Toko Bahan Kue"),
    ("bumbu", "Bhn Kue", "Toko Bahan Kue"),
]

# Cache: ingredient name (lowered) → supplier category short label
_supplier_cat_cache: dict[str, str] = {}
# Track which names were AI-categorized (for cache freshness)
_ai_categorized: set[str] = set()

# Supplier category short → icon mapping
SUPPLIER_CAT_ICONS: dict[str, str] = {
    "Roastery": "☕",
    "Sirup": "🍹",
    "Daging": "🥩",
    "Sayur": "🥬",
    "Bhn Kue": "🧁",
    "Bhn Minum": "🧋",
    "Milk": "🥛",
    "Es Batu": "🧊",
    "Galon": "💧",
    "Bhn Fresh": "🥚",
    "Ubi": "🍠",
    "Packaging": "📦",
    "Cleaning": "🧹",
    "Gas": "🔥",
}

# AI prompt template — filled with supplier categories from DB
_AI_PROMPT = """Kamu adalah asisten inventory untuk kafe/restoran. Kategorikan setiap bahan baku di bawah ini ke kategori supplier yang tepat.

Kategori supplier yang tersedia:
{categories}

Aturan:
- Roastery: biji kopi (arabica, robusta, beans, single origin)
- Sirup: sirup perasa minuman (peach, elder, green apple, monin, torani, sunquick)
- Daging: protein hewani (ayam, sapi, cincang, fillet, patty, bakso, sosis, tulang, kulit)
- Sayur: sayuran segar & herba (bawang, cabe, selada, timun, kentang, daun, basil, oregano, jeruk limau)
- Toko Bahan Kue: baking goods, bumbu kering, minyak, saus, kecap, tepung, gula, garam, cream, keju, mayones
- Bahan Minuman: minuman kemasan (sprite, c1000, pulpy, teh, soda), bubuk minuman (matcha, coklat), susu kental
- Milk: susu segar (fresh milk, greenfield)
- Es Batu: es batu
- Galon: air galon, air mineral
- Bahan Baku Fresh: telur, beras, nasi, bubur, kerupuk, wijen, ebi, kemangi
- Ubi: ubi
- Packaging: cup, botol, sedotan, kresek, tutup, bento, sendok, cling, paperbowl
- Cleaning: sabun, pembersih, tisu
- Gas: gas LPG, baterai

Balas HANYA JSON object (tanpa markdown, tanpa penjelasan):
{{"Nama Bahan Baku (persis)": "Kategori Supplier", ...}}

Contoh:
{{"Arabica Beans": "Roastery", "Daging Ayam": "Daging", "Tepung Terigu": "Toko Bahan Kue", "Cup 12 PET": "Packaging"}}

Jika ragu, gunakan "Toko Bahan Kue" sebagai default.
Sekarang kategorikan:\n{items}"""


def _keyword_guess(name: str) -> str:
    """Fallback: keyword-based guess. Returns short label or '—'."""
    key = name.lower().strip()
    for kw, cat, short in _SUPPLIER_CAT_KEYWORDS:
        if kw in key:
            return short
    return "—"


def guess_supplier_cat(name: str) -> str:
    """Return supplier category short label. AI-cached first, then keyword fallback."""
    key = name.lower().strip()
    if key in _supplier_cat_cache:
        return _supplier_cat_cache[key]
    # Keyword fallback
    result = _keyword_guess(name)
    _supplier_cat_cache[key] = result
    return result


async def ai_categorize_suppliers(
    names: list[str],
    sp_client,  # SumoPodClient
    supplier_categories: list[str] | None = None,
    timeout: int = 30,
) -> dict[str, str]:
    """Use SumoPod AI to categorize ingredient names into supplier categories.

    Returns dict: {name_lower: short_label}
    Caches results globally.
    """
    if not names:
        return {}

    # Filter already-cached names
    uncached = [n for n in names if n.lower().strip() not in _ai_categorized]
    if not uncached:
        return {n.lower(): guess_supplier_cat(n) for n in names}

    # Build category list for prompt
    if not supplier_categories:
        supplier_categories = [
            "Roastery", "Sirup", "Daging", "Sayur", "Toko Bahan Kue",
            "Bahan Minuman", "Milk", "Es Batu", "Galon",
            "Bahan Baku Fresh", "Ubi", "Packaging", "Cleaning", "Gas",
        ]
    cat_list = ", ".join(supplier_categories)
    items_list = "\n".join(f"- {n}" for n in uncached)
    prompt = _AI_PROMPT.format(categories=cat_list, items=items_list)

    # Short label mapping (AI returns full category name, we convert to short)
    FULL_TO_SHORT = {
        "roastery": "Roastery",
        "sirup": "Sirup",
        "daging": "Daging",
        "sayur": "Sayur",
        "toko bahan kue": "Bhn Kue",
        "bahan minuman": "Bhn Minum",
        "milk": "Milk",
        "es batu": "Es Batu",
        "galon": "Galon",
        "bahan baku fresh": "Bhn Fresh",
        "ubi": "Ubi",
        "packaging": "Packaging",
        "cleaning": "Cleaning",
        "gas": "Gas",
    }

    try:
        import httpx

        # Ambil API key dari sp_client
        api_key = sp_client.api_key
        base_url = sp_client.base_url

        payload = {
            "model": os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash"),
            "messages": [
                {"role": "system", "content": "Kamu adalah asisten inventory. Balas HANYA dengan JSON object."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "max_tokens": 1024,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]

        # Extract JSON from response
        json_match = re.search(r"\{[\s\S]*\}", content)
        if not json_match:
            logger.warning("AI categorize: no JSON in response: %s", content[:200])
            # Fallback to keyword
            for name in uncached:
                key = name.lower().strip()
                _supplier_cat_cache[key] = _keyword_guess(name)
                _ai_categorized.add(key)
            return {n.lower(): guess_supplier_cat(n) for n in names}

        result = json.loads(json_match[0])

        # Map back: convert full category names to short labels
        mapped: dict[str, str] = {}
        for raw_name, raw_cat in result.items():
            key = raw_name.lower().strip()
            cat_lower = str(raw_cat).lower().strip()
            short = FULL_TO_SHORT.get(cat_lower, _keyword_guess(raw_name))
            _supplier_cat_cache[key] = short
            _ai_categorized.add(key)
            mapped[key] = short
            logger.debug("AI: %s → %s", raw_name, short)

        # Any uncached names that AI missed → keyword fallback
        for name in uncached:
            key = name.lower().strip()
            if key not in _ai_categorized:
                _supplier_cat_cache[key] = _keyword_guess(name)
                _ai_categorized.add(key)

        logger.info("AI categorized %d/%d items (%d cached before)",
                     len(mapped), len(names), len(names) - len(uncached))
        return {n.lower(): guess_supplier_cat(n) for n in names}

    except Exception as e:
        logger.warning("AI categorize failed, using keyword fallback: %s", e)
        # Fallback to keyword for all uncached
        for name in uncached:
            key = name.lower().strip()
            _supplier_cat_cache[key] = _keyword_guess(name)
            _ai_categorized.add(key)
        return {n.lower(): guess_supplier_cat(n) for n in names}


async def build_lookup(fetch_fn):
    """Map setiap inventory ID ke kategori bar/kitchen/lainnya via recipe."""
    global INGREDIENT_CATEGORY
    try:
        recipes = await fetch_fn("pos_recipes", "select=ingredients,productId")
        products = await fetch_fn("pos_products", "select=_id,categoryId&limit=500")
        cats = await fetch_fn("pos_categories", "select=_id,name,parentId")

        cat_name = {}
        cat_parent = {}
        for c in cats:
            cat_name[c["_id"]] = (c.get("name") or "").strip().lower()
            cat_parent[c["_id"]] = c.get("parentId")

        def _is_under(cid, target):
            seen = set()
            while cid and cid not in seen:
                if cat_name.get(cid) == target:
                    return True
                seen.add(cid)
                cid = cat_parent.get(cid) or ""
            return False

        prod_cat = {}
        for p in products:
            cid = p.get("categoryId", "")
            if _is_under(cid, "minuman"):
                prod_cat[p["_id"]] = "bar"
            elif _is_under(cid, "makanan"):
                prod_cat[p["_id"]] = "kitchen"

        for r in recipes:
            cat = prod_cat.get(r.get("productId", ""), "lainnya")
            for ing in r.get("ingredients") or []:
                inv_id = ing.get("inventoryId", "")
                if inv_id and inv_id not in INGREDIENT_CATEGORY:
                    INGREDIENT_CATEGORY[inv_id] = cat

        logger.info("Marketlist: ingredient category lookup built (%d items)", len(INGREDIENT_CATEGORY))
    except Exception as e:
        logger.warning("Marketlist: build_lookup failed: %s", e)


def _parse_item(item: dict):
    """Extract and normalize item fields. Returns (name, qty, thresh, unit, price, inv_id)."""
    name = (item.get("ingredientName") or item.get("ingredient_name") or "?").strip()
    qty = float(item.get("quantity") or 0)
    thresh = float(item.get("lowStockThreshold") or 0)
    unit = (item.get("unit") or "").strip()
    price = float(item.get("lastPurchasePrice") or item.get("last_purchase_price") or 0)
    inv_id = item.get("_id", "")
    return name, qty, thresh, unit, price, inv_id


async def generate_marketlist(fetch_fn, supplier_manager=None, sp_client=None):
    """Fetch inventory from Supabase and generate full marketlist message.

    If sp_client (SumoPodClient) is provided, uses AI to auto-categorize
    items by supplier category before formatting.
    """
    await build_lookup(fetch_fn)
    try:
        rows = await fetch_fn(
            "pos_inventory",
            "select=ingredientName,quantity,lowStockThreshold,unit,lastPurchasePrice,_id,preferredPurchaseUnit,preferredPurchaseQuantity,conversionFactor,displayUnit"
        )
    except Exception:
        rows = await fetch_fn(
            "pos_inventory",
            "select=ingredientName,quantity,lowStockThreshold,unit,last_purchase_price,_id"
        )

    low_items = [
        r for r in rows
        if float(r.get("quantity") or 0) <= float(r.get("lowStockThreshold") or 0)
    ]

    # ── AI Auto-Categorize (pre-format) ──────────────────────────
    if sp_client and low_items:
        try:
            item_names = list({_parse_item(r)[0] for r in low_items})
            await ai_categorize_suppliers(item_names, sp_client)
        except Exception as e:
            logger.warning("AI categorize in generate_marketlist failed: %s", e)

    ml_text = format_marketlist(low_items)

    # ── Supplier Recommendations ──────────────────────────────
    if supplier_manager and low_items:
        try:
            item_names = set()
            for item in low_items:
                name = (item.get("ingredientName") or "").strip()
                if name:
                    item_names.add(name.lower())
            found = {}
            for name in list(item_names)[:10]:
                results = await supplier_manager.search(name)
                for s in results:
                    if s["name"] not in found:
                        found[s["name"]] = s
            if found:
                lines = ["", "📞 Supplier Terkait:"]
                for s in list(found.values())[:5]:
                    phone = s.get("phone", "")
                    phone_str = f" 📞{phone}" if phone else ""
                    grade = s.get("grade", "")
                    grade_str = f" ⭐{grade}" if grade else ""
                    lines.append(f"  • {s['name']}{grade_str}{phone_str}")
                ml_text += "\n".join(lines)
        except Exception:
            pass

    return ml_text


def format_marketlist(items, supplier_manager=None):
    """Format daftar belanja seperti list belanja pasar dengan numbering + auto supplier tag."""
    if not items:
        return "✅ Semua stok aman, tidak ada yang perlu dibeli."

    now = datetime.now(WIB)
    header = f"🛒 MARKETLIST — {now.strftime('%d/%m %H:%M')}"

    groups = {"bar": [], "kitchen": [], "lainnya": []}
    total_cost = 0
    total_item = 0

    labels = {"bar": "☕ BAR", "kitchen": "🍳 KITCHEN", "lainnya": "📦 LAINNYA"}
    lines = [header]

    # ── Collect per-supplier-category stats ───────────────────
    supp_cat_items: dict[str, list[tuple[str, int, str, str]]] = {}
    supp_cat_totals: dict[str, int] = {}

    for key in ["bar", "kitchen", "lainnya"]:
        group_items: list = groups[key]

        for item in items:
            name, qty, thresh, unit, price, inv_id = _parse_item(item)
            cat = INGREDIENT_CATEGORY.get(inv_id, "lainnya")
            if cat != key:
                continue
            group_items.append((name, qty, thresh, unit, price))

        if not group_items:
            continue

        lines.append("")
        lines.append(labels[key])
        lines.append("Nama Barang / Banyaknya / Harga / Supplier")

        for i, (name, qty, thresh, unit, price) in enumerate(group_items, 1):
            need = max(thresh - qty, 0)
            if need <= 0:
                need = max(thresh, 1)

            cost = int((need / 1000.0) * price) if price and unit in ("ml", "gr", "g") else (int(need * price) if price else 0)

            if unit:
                if unit in ("ml", "gr", "g"):
                    if need >= 1000:
                        banyaknya = f"{need/1000:.0f}{unit.replace('ml','L').replace('gr','kg').replace('g','kg')}"
                    else:
                        banyaknya = f"{int(need)} {unit}"
                elif unit in ("pcs", "biji", "pack", "bungkus", "ikat", "toros"):
                    banyaknya = f"{int(need)} {unit}"
                else:
                    banyaknya = f"{int(need)} {unit}"
            else:
                banyaknya = str(int(need))

            if cost >= 1_000_000:
                h_str = f"Rp{cost:,}".replace(",", ".")
            elif cost >= 1_000:
                h_str = f"Rp{cost:,}".replace(",", ".")
            elif cost > 0:
                h_str = f"Rp{cost:,}"
            else:
                h_str = "Rp0"

            # ── Auto supplier category tag ─────────────────
            scat_label = guess_supplier_cat(name)
            scat_icon = SUPPLIER_CAT_ICONS.get(scat_label, "")
            if scat_label == "—":
                tag = "—"
            else:
                tag = f"{scat_icon} {scat_label}"

            lines.append(f" {i}. {name} / {banyaknya} / {h_str} / {tag}")
            total_cost += cost
            total_item += 1

            if scat_label != "—":
                sc_key = scat_label
            else:
                sc_key = "Lainnya"
            if sc_key not in supp_cat_items:
                supp_cat_items[sc_key] = []
            supp_cat_items[sc_key].append((name, cost, scat_label, scat_icon))
            supp_cat_totals[sc_key] = supp_cat_totals.get(sc_key, 0) + cost

    lines.append("")
    lines.append("────────────────────────────────")
    lines.append(f"🛍 {total_item} item • Total: Rp{total_cost:,}".replace(",", "."))

    # ── Supplier Category Summary ─────────────────────────────
    if supp_cat_items:
        lines.append("")
        lines.append("📋 Belanja Per Supplier:")
        for scat, sitems in sorted(supp_cat_items.items(), key=lambda x: -supp_cat_totals.get(x[0], 0)):
            total_sc = supp_cat_totals.get(scat, 0)
            icon = sitems[0][3] if sitems else ""
            count = len(sitems)
            lines.append(f"  {icon} {scat}: {count} item — Rp{total_sc:,}".replace(",", "."))

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# NEW: AI Marketlist Input Processing (user posts raw text)
# ═══════════════════════════════════════════════════════════════

_MARKETLIST_PARSE_SYSTEM = """Anda adalah asisten purchasing untuk restoran Djiwa Tentram.
Tugas Anda adalah mengekstrak daftar belanja (marketlist) dari teks bebas.

INSTRUCTIONS:
1. Input adalah teks daftar belanja dalam Bahasa Indonesia dari staf kitchen/bar.
2. Ekstrak setiap item menjadi {"name": string, "note": string | null}.
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
"""

_MARKETLIST_GROUP_SYSTEM = """Anda adalah asisten purchasing restoran Djiwa Tentram.
Tugas Anda: mengelompokkan daftar bahan baku ke supplier terbaik.

INPUT ANDA:
1. List bahan baku (name, quantity_needed, unit, preferred_store_id/null)
2. List supplier yang tersedia (id, name, category, phone, prices)

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
"""

_PARSE_MODEL = os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")
_GROUP_MODEL = os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")


async def _ai_chat(prompt: str, system: str, api_key: str, base_url: str,
                   model: str, temperature: float = 0.1, max_tokens: int = 1024,
                   timeout: int = 15) -> str:
    """Low-level AI call via SumoPod-compatible API."""
    import httpx
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def parse_marketlist_text(text: str, sp_client) -> list[dict]:
    """Parse raw marketlist text into structured items using AI.

    Returns: [{"name": str, "note": str | None}, ...]
    Falls back to regex on AI failure.
    """
    if not text or not text.strip():
        return []

    # Clean: remove header lines like "market list kitchen", "kitchen:", "bar:"
    cleaned = "\n".join(
        line for line in text.splitlines()
        if not re.match(
            r'^(?:market\s*list|belanja\s*list|daftar\s*belanja)',
            line.strip(), re.IGNORECASE
        ) and not re.match(
            r'^(?:kitchen|bar|dapur)\s*:?\s*$',
            line.strip(), re.IGNORECASE
        )
    )
    if not cleaned.strip():
        return []

    try:
        content = await _ai_chat(
            prompt=cleaned,
            system=_MARKETLIST_PARSE_SYSTEM,
            api_key=sp_client.api_key,
            base_url=sp_client.base_url,
            model=_PARSE_MODEL,
            temperature=0.1,
            max_tokens=1024,
            timeout=15,
        )
        json_match = re.search(r"\[[\s\S]*\]", content)
        if json_match:
            import json as _json
            result = _json.loads(json_match[0])
            if isinstance(result, list) and all(isinstance(i, dict) for i in result):
                logger.info("parse_marketlist_text: AI parsed %d items", len(result))
                return result
    except Exception as e:
        logger.warning("parse_marketlist_text AI failed: %s", e)

    # Fallback: regex parse
    logger.info("parse_marketlist_text: using regex fallback")
    items = []
    for line in cleaned.splitlines():
        stripped = line.strip().lstrip("-•* \t")
        if not stripped:
            continue
        # Check for note in parentheses
        note_match = re.search(r"\(([^)]*)\)", stripped)
        note = note_match.group(1).strip() if note_match else None
        name = re.sub(r"\s*\([^)]*\)", "", stripped).strip()
        if name:
            items.append({"name": name, "note": note})
    return items


async def match_marketlist_to_inventory(
    parsed_items: list[dict],
    inventory_manager,
) -> list[dict]:
    """Match parsed items to inventory DB.

    Each input item gets enriched with inventory data if matched.
    Returns: [{
        "input_name": str,
        "input_note": str | None,
        "matched": bool,
        "score": int,
        "inv_id": str | None,
        "name": str | None,          # matched ingredient name
        "quantity": float,
        "lowStockThreshold": float,
        "unit": str,
        "lastPurchasePrice": float,
        "preferredStoreId": str | None,
    }, ...]
    """
    all_inventory = await inventory_manager.get_all_inventory()
    results = []
    for item in parsed_items:
        input_name = item.get("name", "").strip()
        if not input_name:
            continue
        matched, score = await inventory_manager.fuzzy_match_item(input_name, all_inventory)
        enriched = {
            "input_name": input_name,
            "input_note": item.get("note"),
            "matched": matched is not None and score >= 45,
            "score": score,
            "inv_id": matched["_id"] if matched else None,
            "name": matched["ingredientName"] if matched else input_name,
            "quantity": float(matched.get("quantity", 0)) if matched else 0,
            "lowStockThreshold": float(matched.get("lowStockThreshold", 0)) if matched else 0,
            "unit": (matched.get("unit") or "").strip() if matched else "",
            "lastPurchasePrice": float(matched.get("lastPurchasePrice", 0) or 0) if matched else 0,
            "preferredStoreId": matched.get("preferredStoreId") if matched else None,
            "preferredPurchaseUnit": (matched.get("preferredPurchaseUnit") or "").strip() if matched else "",
            "preferredPurchaseQuantity": float(matched.get("preferredPurchaseQuantity", 0) or 0) if matched else 0,
            "conversionFactor": float(matched.get("conversionFactor", 0) or 0) if matched else 0,
            "displayUnit": (matched.get("displayUnit") or "").strip() if matched else "",
        }
        results.append(enriched)
        logger.debug(
            "Marketlist match: %s → %s (score=%d, matched=%s)",
            input_name,
            enriched["name"],
            score,
            enriched["matched"],
        )
    return results


async def group_by_merchant(
    enriched_items: list[dict],
    supplier_manager,
    sp_client,
) -> dict:
    """Group enriched items by merchant/supplier using AI.

    Returns: {
        "groups": [{"supplier_name", "supplier_phone", "items": [...], "subtotal": float}],
        "unmatched": [...],
        "grand_total": float,
    }
    """
    # Get all suppliers from DB via the proper method
    supplier_list = []
    try:
        supplier_list = await supplier_manager.get_all_suppliers()
    except Exception as e:
        logger.warning("group_by_merchant: could not load suppliers: %s", e)

    # If no supplier data, use simple grouping by preferredStoreId
    if not supplier_list:
        logger.info("group_by_merchant: no suppliers, using simple grouping")
        return _simple_group_by_preferred(enriched_items)

    # Build supplier lookup by ID
    supplier_by_id = {}
    for s in supplier_list:
        sid = s.get("_id", "") or s.get("id", "")
        if sid:
            supplier_by_id[sid] = s

    # Group by preferredStoreId first (rule-based, fast)
    preferred_groups: dict[str, list[dict]] = {}
    unmatched = []
    for item in enriched_items:
        store_id = item.get("preferredStoreId")
        if store_id and store_id in supplier_by_id:
            preferred_groups.setdefault(store_id, []).append(item)
        else:
            unmatched.append(item)

    # Build groups from preferred stores
    groups = []
    grand_total = 0
    for store_id, items in preferred_groups.items():
        sup = supplier_by_id[store_id]
        subtotal = sum(
            _stock_normalize(_calc_buy_qty(i), i.get("unit", ""), i.get("lastPurchasePrice", 0) or 0)[1]
            for i in items
        )
        group_items = []
        for i in items:
            buy_qty = _calc_buy_qty(i)
            price = i.get("lastPurchasePrice", 0) or 0
            unit = i.get("unit", "")
            norm_qty, _ = _stock_normalize(buy_qty, unit, price)
            group_items.append({
                "name": i.get("name", i.get("input_name", "?")),
                "qty": buy_qty,
                "unit": i.get("unit", ""),
                "displayUnit": i.get("displayUnit", "") or i.get("preferredPurchaseUnit", ""),
                "conversionFactor": float(i.get("conversionFactor", 0) or 0),
                "price": price,
                "subtotal": norm_qty * price,
            })
        groups.append({
            "supplier_name": sup.get("name", "?"),
            "supplier_phone": sup.get("phone", ""),
            "supplier_category": (sup.get("category") or sup.get("type", "")).strip(),
            "items": group_items,
            "subtotal": subtotal,
        })
        grand_total += subtotal

    # For unmatched items, try AI grouping
    if unmatched and sp_client:
        try:
            ai_result = await _ai_group_unmatched(unmatched, supplier_list, sp_client)
            if ai_result and ai_result.get("groups"):
                groups.extend(ai_result["groups"])
                grand_total += ai_result.get("grand_total", 0)
                unmatched = ai_result.get("unmatched", [])
        except Exception as e:
            logger.warning("AI group_by_merchant failed: %s", e)

    # Any leftover unmatched items → lump in "Lainnya"
    if unmatched:
        group_items = []
        subtotal = 0
        for i in unmatched:
            buy_qty = _calc_buy_qty(i)
            price = i.get("lastPurchasePrice", 0) or 0
            unit = i.get("unit", "")
            norm_qty, _ = _stock_normalize(buy_qty, unit, price)
            group_items.append({
                "name": i.get("name", i.get("input_name", "?")),
                "qty": buy_qty,
                "unit": i.get("unit", ""),
                "displayUnit": i.get("displayUnit", "") or i.get("preferredPurchaseUnit", ""),
                "conversionFactor": float(i.get("conversionFactor", 0) or 0),
                "price": price,
                "subtotal": norm_qty * price,
            })
            subtotal += norm_qty * price
        groups.append({
            "supplier_name": "🏪 Lainnya",
            "supplier_phone": "",
            "supplier_category": "",
            "items": group_items,
            "subtotal": subtotal,
        })
        grand_total += subtotal

    return {
        "groups": groups,
        "unmatched": unmatched,
        "grand_total": grand_total,
    }


def _normalize_qty_unit(qty: float, unit: str, price: float) -> tuple[float, str, float]:
    """Normalize stock unit to purchase display unit.

    Database stores stock in gram/ml (stock unit) but lastPurchasePrice
    is per kg/L (purchase unit). This converts both for display/cost.

    Returns:
        (normalized_qty, display_unit, display_price)
        - gram→kg (qty>=1000): qty/1000, 'kg', price unchanged
        - gram→gram (qty<1000): qty unchanged, 'gram', price/1000 (per gram)
        - ml→L (qty>=1000): qty/1000, 'L', price unchanged
        - ml→ml (qty<1000): qty unchanged, 'ml', price/1000 (per ml)
        - Others: unchanged
    """
    nqty, nunit, nprice = qty, unit, price
    if unit in ("gram", "gr", "g"):
        if qty >= 1000:
            nunit = "kg"
            nqty = qty / 1000.0
            # price stays same (per kg)
        else:
            nunit = "gram"
            nprice = price / 1000.0  # convert to per gram
    elif unit == "ml":
        if qty >= 1000:
            nunit = "L"
            nqty = qty / 1000.0
        else:
            nprice = price / 1000.0  # per ml
    return nqty, nunit, nprice


def _stock_normalize(qty: float, unit: str, price: float) -> tuple[float, float]:
    """Normalize qty & price for stock units priced per kg/L.
    
    Returns (normalized_qty, normal_subtotal_per_unit).
    - gram/ml → divide qty by 1000, keep price (it's per kg/L)
    - others → keep as-is
    """
    if unit in ("gram", "gr", "g", "ml", "milliliter"):
        norm_qty = qty / 1000.0
    else:
        norm_qty = qty
    return norm_qty, norm_qty * price


def _unit_min_qty(unit: str) -> float:
    """Return minimum meaningful purchase quantity for a unit type.
    
    Items stocked in grams/ml shouldn't default to 1 unit (= 1 gram = useless).
    """
    u = (unit or "").lower().strip()
    if u in ("gram", "gr", "g"):
        return 250.0    # 250g — minimum wajar
    if u in ("ml", "milliliter"):
        return 250.0    # 250ml
    if u in ("kg", "l", "liter", "pack", "pcs", "bottle", "botol", "toros", "ikat", "toros"):
        return 1.0
    return 1.0


def _calc_buy_qty(item: dict) -> float:
    """Calculate recommended buy quantity for an item (in stock unit).
    
    Priority:
    1. _suggestedQty from learning memory (validated by previous AI/human)
    2. Threshold-based: fill up to lowStockThreshold (dynamic, always correct)
    3. preferredPurchaseQuantity — only if explicitly meaningful (> 1)
    4. Fallback: unit-aware minimum to prevent absurd quantities
    """
    unit = item.get("unit", "")
    min_qty = _unit_min_qty(unit)

    # Priority 1: Suggested qty from previous successful matches (learning memory)
    sq = float(item.get("_suggestedQty", 0) or 0)
    if sq > 0 and sq >= min_qty:
        return sq

    # Priority 2: Threshold-based — fill up to lowStockThreshold
    qty = float(item.get("quantity", 0))
    thresh = float(item.get("lowStockThreshold", 0) or 0)
    need = max(thresh - qty, 0)
    if need <= 0:
        # Already at/above threshold — still restock at least threshold or min
        need = max(thresh, min_qty)

    # Priority 3: preferredPurchaseQuantity — only when meaningful
    ppq = float(item.get("preferredPurchaseQuantity", 0) or 0)
    if ppq > 1 and ppq >= need:
        return ppq

    # Ensure result meets minimum
    return max(need, min_qty)


async def _ai_group_unmatched(
    unmatched: list[dict],
    supplier_list: list[dict],
    sp_client,
) -> dict:
    """Use AI to group unmatched items to suppliers."""
    import json as _json
    from sumopod_client import SUMODOP_BASE

    items_for_ai = []
    for i in unmatched:
        items_for_ai.append({
            "name": i.get("name", i.get("input_name", "?")),
            "qty": _calc_buy_qty(i),
            "unit": i.get("unit", ""),
            "preferred_store_id": i.get("preferredStoreId"),
        })

    suppliers_for_ai = []
    for s in supplier_list[:20]:  # limit to 20 suppliers
        suppliers_for_ai.append({
            "id": s.get("_id", s.get("id", "")),
            "name": s.get("name", ""),
            "category": s.get("category", ""),
            "phone": s.get("phone", ""),
        })

    prompt = _json.dumps({
        "items": items_for_ai,
        "suppliers": suppliers_for_ai,
    }, ensure_ascii=False)

    try:
        content = await _ai_chat(
            prompt=prompt,
            system=_MARKETLIST_GROUP_SYSTEM,
            api_key=sp_client.api_key,
            base_url=sp_client.base_url,
            model=_GROUP_MODEL,
            temperature=0.3,
            max_tokens=2048,
            timeout=20,
        )
        json_match = re.search(r"\{[\s\S]*\}", content)
        if json_match:
            result = _json.loads(json_match[0])
            return result
    except Exception as e:
        logger.warning("AI group_unmatched failed: %s", e)
    return {"groups": [], "unmatched": unmatched, "grand_total": 0}


def _simple_group_by_preferred(enriched_items: list[dict]) -> dict:
    """Simple grouping when no supplier data available; all items in one group."""
    items = []
    grand_total = 0
    for i in enriched_items:
        buy_qty = _calc_buy_qty(i)
        price = i.get("lastPurchasePrice", 0) or 0
        unit = i.get("unit", "")
        # Normalize qty: gram→kg so subtotal = qty_kg × price_per_kg
        norm_qty, _ = _stock_normalize(buy_qty, unit, price)
        items.append({
            "name": i.get("name", i.get("input_name", "?")),
            "qty": buy_qty,
            "unit": unit,
            "displayUnit": i.get("displayUnit", "") or i.get("preferredPurchaseUnit", ""),
            "conversionFactor": float(i.get("conversionFactor", 0) or 0),
            "price": price,
            "subtotal": norm_qty * price,
        })
        grand_total += norm_qty * price
    return {
        "groups": [{
            "supplier_name": "📦 Inventory",
            "supplier_phone": "",
            "items": items,
            "subtotal": grand_total,
        }],
        "unmatched": [],
        "grand_total": grand_total,
    }


def format_merchant_marketlist(groups: list[dict], grand_total: float,
                               timestamp: str | None = None, items_count: int = 0,
                               unmatched_items: list[str] | None = None) -> str:
    """Format marketlist grouped by merchant for Telegram response.

    Args:
        groups: [{"supplier_name", "supplier_phone", "items": [...], "subtotal": float}]
        grand_total: total of all groups
        timestamp: optional timestamp string
        items_count: total number of items (if 0, calculated from groups)
        unmatched_items: optional list of item names that couldn't be matched to inventory
    """
    from datetime import datetime, timezone, timedelta
    WIB = timezone(timedelta(hours=7))

    if not timestamp:
        timestamp = datetime.now(WIB).strftime("%d/%m %H:%M")

    if items_count == 0:
        items_count = sum(len(g.get("items", [])) for g in groups)

    now = datetime.now(WIB)
    header = f"🛒 Marketlist Detail — {timestamp}"

    lines = [header, ""]

    for g in groups:
        sup_name = g.get("supplier_name", "🏪 Toko")
        sup_phone = g.get("supplier_phone", "")
        sup_category = g.get("supplier_category", "")
        items = g.get("items", [])
        subtotal = g.get("subtotal", 0)

        # Category icon for quick visual scanning
        cat_icons = {"Sayur": "🥬", "Daging": "🥩", "Toko Bahan Kue": "🧁", "Bahan Minuman": "🧋",
                     "Milk": "🥛", "Roastery": "☕", "Sirup": "🍹", "Galon": "💧", "Es Batu": "🧊",
                     "Bahan Baku Fresh": "🥚", "Ubi": "🍠", "Print/Percetakan": "🖨️",
                     "Packaging": "📦", "Cleaning": "🧹", "Gas": "🔥"}
        cat_icon = cat_icons.get(sup_category, "🏷️")

        # Skip store emoji if name already starts with one
        if not sup_name.startswith("🏪") and not sup_name.startswith("📦"):
            header_line = f"🏪 {sup_name}"
        else:
            header_line = sup_name
        if sup_category:
            header_line += f" [{cat_icon} {sup_category}]"
        lines.append(header_line)
        if sup_phone:
            lines.append(f"📞 {sup_phone}")

        for item in items:
            name = item.get("name", "?")
            qty = float(item.get("qty", 0))
            unit = item.get("unit", "")
            price = float(item.get("price", 0))
            sub = float(item.get("subtotal", 0))

            # Determine display unit — prefer displayUnit/preferredPurchaseUnit from DB
            disp_unit_override = item.get("displayUnit", "") or ""
            cf = float(item.get("conversionFactor", 0) or 0)

            if disp_unit_override and cf > 0:
                # Use display unit with conversion factor
                disp_qty = qty / cf
                disp_unit = disp_unit_override
                # Price stays as-is (already per purchase unit)
                disp_price = price
            elif disp_unit_override and unit in ("gram", "gr", "g") and disp_unit_override in ("kg", "pack", "pcs"):
                # displayUnit=kg but no conversionFactor → use heuristic
                cf_val = 1000.0
                disp_qty = qty / cf_val
                disp_unit = disp_unit_override
                disp_price = price
            else:
                # Fall back to stock-unit normalization
                disp_qty, disp_unit, disp_price = _normalize_qty_unit(qty, unit, price)

            unit_s = f" {disp_unit}" if disp_unit else ""
            price_s = f"Rp{int(disp_price):,}".replace(",", ".")
            sub_s = f"Rp{int(sub):,}".replace(",", ".")

            qty_s = f"{disp_qty:g}{unit_s}" if disp_qty > 0 else ""
            item_line = f"  • {name}"
            if qty_s:
                item_line += f" — {qty_s}"
            if price > 0:
                item_line += f" @ {price_s}"
            if sub > 0:
                item_line += f" = {sub_s}"
            lines.append(item_line)

        if subtotal > 0:
            sub_s = f"Rp{int(subtotal):,}".replace(",", ".")
            lines.append(f"  💰 Subtotal: {sub_s}")

        lines.append("")

    lines.append("────────────────────────────")
    total_s = f"Rp{int(grand_total):,}".replace(",", ".")
    lines.append(f"🛍 Total: {items_count} item • {total_s}")

    # Unmatched items — low/no match in inventory
    if unmatched_items:
        lines.append("")
        lines.append("⚠️ *Tidak ditemukan di database:*")
        for name in unmatched_items[:5]:
            lines.append(f"  • {name}")
        if len(unmatched_items) > 5:
            lines.append(f"  ... +{len(unmatched_items) - 5} lainnya")

    return "\n".join(lines)


def recalculate_with_qty(groups: list[dict], item_idx: int, new_qty: float) -> list[dict]:
    """Recalculate groups after editing an item's quantity. Returns modified groups."""
    # Flatten all items with group index
    flat = []
    for gi, g in enumerate(groups):
        for ii, item in enumerate(g.get("items", [])):
            flat.append((gi, ii, item))

    if item_idx < 0 or item_idx >= len(flat):
        return groups

    gi, ii, item = flat[item_idx]
    item["qty"] = new_qty
    price = float(item.get("price", 0))
    unit = item.get("unit", "")
    # Normalize for correct subtotal
    norm_qty, _ = _stock_normalize(new_qty, unit, price)
    item["subtotal"] = norm_qty * price

    # Recalculate group subtotal
    groups[gi]["subtotal"] = sum(
        float(i.get("subtotal", 0)) for i in groups[gi].get("items", [])
    )

    return groups


def remove_item_and_reformat(groups: list[dict], item_idx: int) -> tuple[list[dict], int]:
    """Remove an item from groups. Returns (modified_groups, new_total_items)."""
    flat = []
    for gi, g in enumerate(groups):
        for ii, item in enumerate(g.get("items", [])):
            flat.append((gi, ii, item))

    if item_idx < 0 or item_idx >= len(flat):
        return groups, sum(len(g.get("items", [])) for g in groups)

    gi, ii, _ = flat[item_idx]
    items = groups[gi].get("items", [])
    if ii < len(items):
        items.pop(ii)

    # Recalculate group subtotal
    groups[gi]["subtotal"] = sum(
        float(i.get("subtotal", 0)) for i in items
    )

    # Remove empty groups
    groups = [g for g in groups if g.get("items")]

    total_items = sum(len(g.get("items", [])) for g in groups)
    return groups, total_items


async def process_input_marketlist(
    text: str,
    sp_client,
    inventory_manager,
    supplier_manager,
) -> dict:
    """Full pipeline: parse → match → enrich → group → format.

    Returns: {
        "success": bool,
        "groups": [...],
        "unmatched": [...],
        "grand_total": float,
        "items_count": int,
        "formatted_text": str,
        "raw_parsed": [...],
        "enriched": [...],
        "entry_id": str | None,
    }
    """
    from sumopod_client import SUMODOP_BASE

    # Step 1: Parse
    parsed = await parse_marketlist_text(text, sp_client)
    if not parsed:
        return {
            "success": False,
            "formatted_text": "🤔 Tidak ada bahan yang bisa diproses. Coba tulis lebih jelas dengan format daftar per baris.",
            "groups": [],
            "unmatched": [],
            "grand_total": 0,
            "items_count": 0,
            "raw_parsed": [],
            "enriched": [],
            "entry_id": None,
        }

    # Step 1b: Check learning memory — accelerate matching by skipping fuzzy search
    # Strategy: cache stores matchedInventoryId only; still fetch real inventory data
    memory_hits = 0
    memory_id_map: dict[str, str] = {}  # item_name -> matchedInventoryId
    memory_suggested_qty: dict[str, float] = {}  # item_name -> suggestedQty
    from learning_memory import search_learning_memory, save_learning_entry

    for item in parsed:
        item_name = item.get("name", "")
        matches = search_learning_memory(item_name)
        if matches:
            best = matches[0]
            if best.get("confirmedByUser") or best.get("confidence", 0) >= 0.75:
                inv_id = best.get("matchedInventoryId", "")
                if inv_id:
                    memory_id_map[item_name] = inv_id
                    memory_suggested_qty[item_name] = float(best.get("suggestedQty", 0) or 0)
                    memory_hits += 1

    logger.info("process_input_marketlist: %d items parsed, %d memory hits", len(parsed), memory_hits)

    # Step 2: Match to inventory
    # Items with memory hit → direct lookup by inventory ID (skip fuzzy matching)
    # Items without → run fuzzy match as normal
    all_inventory = await inventory_manager.get_all_inventory()
    inventory_by_id = {i.get("_id", ""): i for i in all_inventory if i.get("_id")}

    enriched = []
    uncached = []
    for item in parsed:
        item_name = item.get("name", "")
        inv_id = memory_id_map.get(item_name)
        if inv_id and inv_id in inventory_by_id:
            # Direct lookup with fresh DB data
            matched = inventory_by_id[inv_id]
            enriched.append({
                "input_name": item_name,
                "input_note": item.get("note"),
                "matched": True,
                "score": 100,
                "inv_id": inv_id,
                "name": matched.get("ingredientName", item_name),
                "quantity": float(matched.get("quantity", 0) or 0),
                "lowStockThreshold": float(matched.get("lowStockThreshold", 0) or 0),
                "unit": (matched.get("unit") or "").strip(),
                "lastPurchasePrice": float(matched.get("lastPurchasePrice", 0) or 0),
                "preferredStoreId": matched.get("preferredStoreId"),
                "preferredPurchaseUnit": (matched.get("preferredPurchaseUnit") or "").strip(),
                "preferredPurchaseQuantity": float(matched.get("preferredPurchaseQuantity", 0) or 0),
                "conversionFactor": float(matched.get("conversionFactor", 0) or 0),
                "displayUnit": (matched.get("displayUnit") or "").strip(),
                "_from_memory": True,
                "_suggestedQty": memory_suggested_qty.get(item_name, 0),
            })
        else:
            uncached.append(item)

    if uncached:
        enriched_uncached = await match_marketlist_to_inventory(uncached, inventory_manager)
        enriched.extend(enriched_uncached)

    # Increment usage for memory-hit entries
    for item in enriched:
        if item.get("_from_memory"):
            from learning_memory import increment_usage
            # Find the matching entry and increment
            for entry in search_learning_memory(item.get("input_name", "")):
                if entry.get("matchedInventoryId") == item.get("inv_id"):
                    increment_usage(entry["id"])
                    break

    # Step 3: Group by merchant
    result = await group_by_merchant(enriched, supplier_manager, sp_client)

    # Step 4: Format with unmatched indicator
    unmatched_names = [
        e.get("input_name", e.get("name", "?"))
        for e in enriched if not e.get("matched")
    ]
    formatted = format_merchant_marketlist(
        result["groups"],
        result["grand_total"],
        items_count=len(enriched),
        unmatched_items=unmatched_names,
    )

    # Step 5: Save learning memory entries for successful matches
    entry_id = None
    for item in enriched:
        if item.get("matched") and item.get("inv_id"):
            entry_id = save_learning_entry(
                user_input=item.get("input_name", ""),
                parsed_name=item.get("name", ""),
                matched_inventory_id=item.get("inv_id", ""),
                matched_ingredient_name=item.get("name", ""),
                suggested_supplier="",
                suggested_supplier_phone="",
                suggested_qty=_calc_buy_qty(item),
                suggested_unit=item.get("unit", ""),
                suggested_price=item.get("lastPurchasePrice", 0),
                confidence=item.get("score", 0) / 100.0,
            )

    result["formatted_text"] = formatted
    result["items_count"] = len(enriched)
    result["raw_parsed"] = parsed
    result["enriched"] = enriched
    result["success"] = True
    result["entry_id"] = entry_id
    return result

