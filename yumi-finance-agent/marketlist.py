"""
Marketlist module untuk yumi-ai-bot.
Mengirim daftar belanja bahan baku ke grup Telegram.
"""
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))

# Ingredient → category mapping (dibuild saat startup)
INGREDIENT_CATEGORY: dict[str, str] = {}


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


async def generate_marketlist(fetch_fn, supplier_manager=None):
    """Fetch inventory from Supabase and generate full marketlist message."""
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
    ml_text = format_marketlist(low_items)

    # ── Supplier Recommendations (async) ──────────────────────
    if supplier_manager and low_items:
        try:
            item_names = set()
            for item in low_items:
                name = (item.get("ingredientName") or "").strip()
                if name:
                    item_names.add(name.lower())
            found = {}
            for name in list(item_names)[:10]:  # limit to 10 searches
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
    """Format daftar belanja seperti list belanja pasar dengan numbering."""
    if not items:
        return "✅ Semua stok aman, tidak ada yang perlu dibeli."

    now = datetime.now(WIB)
    header = f"🛒 MARKETLIST — {now.strftime('%d/%m %H:%M')}"

    groups = {"bar": [], "kitchen": [], "lainnya": []}
    total_cost = 0
    total_item = 0

    labels = {"bar": "☕ BAR", "kitchen": "🍳 KITCHEN", "lainnya": "📦 LAINNYA"}
    lines = [header]

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
        lines.append("Nama Barang / Banyaknya / Harga")

        for i, (name, qty, thresh, unit, price) in enumerate(group_items, 1):
            # Hitung kebutuhan (yang perlu dibeli)
            need = max(thresh - qty, 0)
            if need <= 0:
                need = max(thresh, 1)

            cost = int(need * price) if price else 0

            # Format banyaknya
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

            # Format harga dengan titik (Rp7.000, Rp45.000)
            if cost >= 1_000_000:
                h_str = f"Rp{cost:,}".replace(",", ".")
            elif cost >= 1_000:
                h_str = f"Rp{cost:,}".replace(",", ".")
            elif cost > 0:
                h_str = f"Rp{cost:,}"
            else:
                h_str = "Rp0"

            lines.append(f" {i}. {name} / {banyaknya} / {h_str}")
            total_cost += cost
            total_item += 1

    lines.append("")
    lines.append("────────────────────────────────")
    lines.append(f"🛍 {total_item} item • Total: Rp{total_cost:,}".replace(",", "."))

    return "\n".join(lines)
