"""
Marketlist module untuk yumi-ai-bot.
Mengirim daftar belanja bahan baku ke grup Telegram.
Dengan AI-powered auto supplier category tagging.
"""
import json
import logging
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
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Kamu adalah asisten inventory. Balas HANYA dengan JSON object."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "max_tokens": 1024,
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
            "select=ingredientName,quantity,lowStockThreshold,unit,lastPurchasePrice,_id"
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

            cost = int(need * price) if price else 0

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
