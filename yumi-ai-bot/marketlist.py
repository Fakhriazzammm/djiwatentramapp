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


def format_marketlist(items):
    """Format daftar belanja compact dengan grouping bar/kitchen/lainnya."""
    if not items:
        return "✅ Semua stok aman, tidak ada yang perlu dibeli."

    now = datetime.now(WIB)
    header = f"🛒 MARKETLIST — {now.strftime('%d/%m %H:%M')}"

    groups = {"bar": [], "kitchen": [], "lainnya": []}
    total_habis = 0
    total_menipis = 0
    harga_habis = 0
    harga_menipis = 0

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

        for name, qty, thresh, unit, price in group_items:
            icon = "❌" if qty <= 0 else "⚠️"
            need = max(thresh, 1) if qty <= 0 else max(thresh - qty, 0)
            unit_s = f" {unit}" if unit else ""
            cost = int(need * price) if price else 0

            # Format harga compact
            if cost >= 1_000_000:
                raw = f"{cost/1_000_000:.1f}"
                h_str = raw.rstrip('0').rstrip('.') + 'jt'
            elif cost >= 10_000:
                h_str = f"{cost//1000}k"
            elif cost > 0:
                h_str = f"Rp{cost:,}"
            else:
                h_str = "Rp0"

            line = f"{icon} {name} — {int(qty)}/{int(thresh)}{unit_s} — {h_str}"
            lines.append(line)

            if qty <= 0:
                total_habis += 1
                harga_habis += cost
            else:
                total_menipis += 1
                harga_menipis += cost

    total_harga = harga_habis + harga_menipis
    total_item = total_habis + total_menipis

    lines.append("────────────────────────────────")
    parts = []
    if total_habis:
        parts.append(f"❌ {total_habis} habis {harga_habis:,}")
    if total_menipis:
        parts.append(f"⚠️ {total_menipis} menipis {harga_menipis:,}")
    lines.append("  ".join(parts))
    lines.append(f"🛍 {total_item} item  •  Rp {total_harga:,}")

    return "\n".join(lines)
