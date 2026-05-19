"""inventory.py — Module inventory Yumi Finance AI Agent.

Cek stok, restok, fuzzy match bahan baru, anti-duplikasi.
"""

import logging
import httpx
import re
from datetime import datetime, timezone, timedelta
from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))

# ── Fuzzy match threshold ──────────────────────────────────────────
MIN_SCORE_AUTO = 60       # auto-match tanpa konfirmasi
MIN_SCORE_SUGGEST = 45    # tanya user
MIN_SCORE_NEW = 30        # dianggap barang baru

# ── Regex: extract qty suffix ──────────────────────────────────────
_QTY_SUFFIX_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|sachet|renceng|ikat|toros|bungkus|botol|gelas)\b',
    re.IGNORECASE,
)

_UNIT_TO_BASE = {
    "ml": 1, "liter": 1000, "lt": 1000, "l": 1000,
    "kg": 1000, "gram": 1, "gr": 1, "g": 1,
    "pcs": 1, "pack": 1, "sachet": 1, "renceng": 1,
    "ikat": 1, "toros": 1, "bungkus": 1, "botol": 1, "gelas": 1,
}


def _clean_name(name: str) -> str:
    """Bersihkan nama item: lowercase, hapus extra space, hapus qty suffix."""
    cleaned = name.lower().strip()
    # Hapus qty suffix dari nama untuk matching
    cleaned = _QTY_SUFFIX_RE.sub("", cleaned).strip()
    # Hapus multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned


def _extract_qty_suffix(name: str) -> tuple[float, str]:
    """Extract volume/weight suffix dari nama item."""
    m = _QTY_SUFFIX_RE.search(name)
    if m:
        qty = float(m.group(1))
        unit = m.group(2).lower()
        multiplier = _UNIT_TO_BASE.get(unit, 1)
        if unit in ("liter", "lt", "l"):
            std_unit = "ml"
        elif unit in ("kg", "gram", "gr", "g"):
            std_unit = "gram"
        elif unit == "ml":
            std_unit = "ml"
        else:
            std_unit = unit
        return qty * multiplier, std_unit
    return 0, ""


def _format_qty(amount: float, unit: str) -> str:
    """Format quantity untuk display."""
    if unit == "ml" and amount >= 1000:
        return f"{amount/1000:.0f}L"
    elif unit == "gram" and amount >= 1000:
        return f"{amount/1000:.1f}kg"
    else:
        return f"{amount:.0f} {unit}"


class InventoryManager:
    """Manager untuk operasi inventory."""

    def __init__(self, supabase_url: str, supabase_key: str, service_role_key: str, supabase_access_token: str = ""):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.service_role_key = service_role_key
        self.supabase_access_token = supabase_access_token
        # Extract project ref from URL
        self.project_ref = supabase_url.rstrip("/").split("//")[-1].split(".")[0] if supabase_url else ""

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
        }

    def _service_headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    async def _fetch(self, view: str, query: str = "select=*") -> list:
        url = f"{self.supabase_url}/rest/v1/{view}?{query}"
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json()

    async def _patch(self, view: str, query: str, data: dict) -> bool:
        """Update data via PATCH."""
        url = f"{self.supabase_url}/rest/v1/{view}?{query}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(url, headers=self._service_headers(), json=data)
            return resp.status_code < 400

    async def _post(self, view: str, data: dict) -> dict | None:
        """Insert data via POST."""
        url = f"{self.supabase_url}/rest/v1/{view}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, headers=self._service_headers(), json=data)
            if resp.status_code < 400:
                return resp.json()
            return None

    # ── Cek stok ───────────────────────────────────────────────────

    async def check_stock(self, item_name: str | None = None) -> str:
        """Cek status stok. Jika nama diberikan, cek spesifik."""
        rows = await self._fetch(
            "pos_inventory",
            "select=ingredientName,quantity,lowStockThreshold,unit&order=ingredientName.asc&limit=200",
        )

        if not rows:
            return "📦 Inventory kosong."

        if item_name:
            # Cari item spesifik dengan fuzzy match
            item_clean = _clean_name(item_name)
            best = None
            best_score = 0
            for r in rows:
                name = (r.get("ingredientName") or "").strip()
                score = fuzz.token_sort_ratio(item_clean, _clean_name(name))
                if score > best_score:
                    best_score = score
                    best = r

            if best and best_score >= MIN_SCORE_SUGGEST:
                name = best.get("ingredientName", "?")
                qty = float(best.get("quantity") or 0)
                thresh = float(best.get("lowStockThreshold") or 0)
                unit = best.get("unit") or ""
                unit_s = f" {unit}" if unit else ""
                status = "⚠️ MENIPIS" if qty <= thresh else "✅ AMAN"
                return (
                    f"📦 Stok: {name}\n"
                    f"   Sisa: {qty:g}{unit_s}\n"
                    f"   Threshold: {thresh:g}{unit_s}\n"
                    f"   Status: {status}"
                )
            elif best_score >= MIN_SCORE_NEW:
                return f"❓ '{item_name}' tidak ditemukan. Mungkin maksud: **{best['ingredientName']}** ({best_score}% match)?"
            else:
                return f"❌ '{item_name}' tidak ditemukan di inventory."

        # Semua stok
        low = []
        safe = []
        for r in rows:
            qty = float(r.get("quantity") or 0)
            thresh = float(r.get("lowStockThreshold") or 0)
            name = r.get("ingredientName", "?")
            unit = r.get("unit") or ""
            unit_s = f" {unit}" if unit else ""
            item_str = f"• {name}: {qty:g}{unit_s} (threshold: {thresh:g}{unit_s})"
            if qty <= thresh:
                low.append(item_str)
            else:
                safe.append(item_str)

        lines = ["📦 Ringkasan Inventory", ""]
        if low:
            lines.append(f"⚠️ Stok Menipis ({len(low)}):")
            lines.extend(low[:15])
            lines.append("")
        lines.append(f"✅ Stok Aman ({len(safe)} item)")
        if len(safe) <= 10:
            lines.extend(safe[:10])

        return "\n".join(lines)

    # ── Restok & fuzzy match ───────────────────────────────────────

    async def get_all_inventory(self) -> list[dict]:
        """Ambil semua inventory untuk fuzzy matching."""
        return await self._fetch(
            "pos_inventory",
            "select=_id,ingredientName,quantity,lowStockThreshold,unit,lastPurchasePrice,preferredStoreId,preferredPurchaseUnit,preferredPurchaseQuantity,conversionFactor,displayUnit",
        )

    async def get_all_inventory_aliases(self) -> list[dict]:
        """Ambil inventory aliases dari DB untuk alias resolution cache.
        
        Memakai snake_case inventory (Accept-Profile: pos) karena
        pos_inventory view (public) tidak punya kolom aliases.
        """
        url = f"{self.supabase_url}/rest/v1/inventory?select=ingredient_name,aliases"
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept-Profile": "pos",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            result = resp.json()
            # Map snake_case back to camelCase for consistency
            return [
                {"ingredient_name": r.get("ingredient_name", ""), "aliases": r.get("aliases") or []}
                for r in result
            ]

    async def fuzzy_match_item(
        self, receipt_name: str, inventory_list: list[dict] | None = None
    ) -> tuple[dict | None, int]:
        """Fuzzy match nama item receipt ke inventory.

        Returns:
            (matched_item_dict or None, score)
            score >= 60: auto-match
            score >= 45: suggest
            score < 45: no match
        """
        if inventory_list is None:
            inventory_list = await self.get_all_inventory()

        receipt_clean = _clean_name(receipt_name)
        best = None
        best_score = 0

        for inv_item in inventory_list:
            inv_name = (inv_item.get("ingredientName") or "").strip()
            if not inv_name:
                continue
            # Token sort ratio — immune to word order
            score = fuzz.token_sort_ratio(receipt_clean, _clean_name(inv_name))
            # Partial ratio — bonus untuk partial match
            partial = fuzz.partial_ratio(receipt_clean, _clean_name(inv_name))
            score = max(score, partial)
            if score > best_score:
                best_score = score
                best = inv_item

        return best, best_score

    async def restock_item(
        self, inventory_id: str, current_qty: float, add_qty: float,
        unit: str = "", price: float = 0,
    ) -> bool:
        """Tambah stok item. Jika price > 0, update lastPurchasePrice juga."""
        new_qty = current_qty + add_qty
        data = {"quantity": new_qty}
        if unit:
            data["unit"] = unit
        if price > 0:
            data["lastPurchasePrice"] = price
        return await self._patch("pos_inventory", f"_id=eq.{inventory_id}", data)

    async def add_new_item(self, name: str, qty: float, unit: str, price: float = 0) -> dict | None:
        """Tambah item baru ke inventory."""
        data = {
            "ingredientName": name.strip(),
            "quantity": qty,
            "lowStockThreshold": 0,
            "unit": unit or "pcs",
            "lastPurchasePrice": price,
        }
        return await self._post("pos_inventory", data)

    async def log_purchase(self, ingredient_name: str, qty_added: float, unit: str, total_cost: float, merchant: str = "") -> bool:
        """Catat purchase log."""
        data = {
            "ingredient_name": ingredient_name,
            "quantity_added": qty_added,
            "unit": unit,
            "total_cost": total_cost,
            "merchant": merchant or "Yumi Finance",
            "created_at": datetime.now(WIB).strftime("%Y-%m-%dT%H:%M:%S"),
        }
        result = await self._post("pos_purchase_logs", data)
        return result is not None

    # ── Menu Stock Sync ────────────────────────────────────────────

    async def _sync_menu_stocks(self, inventory_ids: list[str] | None = None) -> int:
        """Recalculate menu product quantities based on bottleneck ingredients.

        For each recipe, calculates potentialStock = min over ingredients of
        (inventory.quantity / ingredient.amount) rounded down, then updates the
        product's quantity to max(current, potentialStock).

        Args:
            inventory_ids: If provided, only recalculate products whose recipes
                           use these inventory IDs. If None, recalculate all.

        Returns:
            Number of products updated.
        """
        # 1. Fetch all recipes
        recipes = await self._fetch("pos_recipes", "select=ingredients,productId")
        if not recipes:
            logger.info("Menu stock sync: no recipes found.")
            return 0

        # 2. Fetch all inventory for quick lookup
        inventory_rows = await self._fetch("pos_inventory", "select=_id,quantity")
        inv_qty_map: dict[str, float] = {}
        for row in inventory_rows:
            inv_qty_map[row["_id"]] = float(row.get("quantity", 0) or 0)

        # 3. Fetch all products for current quantity lookup
        products = await self._fetch("pos_products_all", "select=_id,quantity&limit=1000")
        prod_map: dict[str, dict] = {}
        for p in products:
            prod_map[p["_id"]] = p

        updated_count = 0
        target_inv_set = set(inventory_ids) if inventory_ids else None

        for recipe in recipes:
            product_id = recipe.get("productId", "")
            if not product_id:
                continue

            ingredients: list = recipe.get("ingredients", [])
            if not ingredients:
                continue

            # If filtering by inventory IDs, skip recipes that don't use any
            if target_inv_set is not None:
                recipe_inv_ids = {ing.get("inventoryId", "") for ing in ingredients}
                if not recipe_inv_ids.intersection(target_inv_set):
                    continue

            # Calculate bottleneck: min servings across all ingredients
            potential_stock: int | None = None
            has_valid_ingredient = False
            for ing in ingredients:
                inv_id = ing.get("inventoryId", "")
                amount = float(ing.get("amount", 0) or 0)
                if not inv_id or amount <= 0:
                    continue
                has_valid_ingredient = True
                inv_qty = inv_qty_map.get(inv_id, 0)
                servings = int(inv_qty / amount)  # floor division
                if potential_stock is None or servings < potential_stock:
                    potential_stock = servings

            if not has_valid_ingredient or potential_stock is None:
                continue

            # Get current product quantity
            product = prod_map.get(product_id)
            if not product:
                continue

            current_qty = float(product.get("quantity", 0) or 0)
            new_qty = max(current_qty, float(potential_stock))

            if new_qty == current_qty:
                continue

            # Update via Management API SQL endpoint
            if self.supabase_access_token and self.project_ref:
                mgmt_url = f"https://api.supabase.com/v1/projects/{self.project_ref}/database/query"
                sql = f"UPDATE pos.products SET quantity = {new_qty} WHERE source_id = '{product_id}'"
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(
                        mgmt_url,
                        headers={"Authorization": f"Bearer {self.supabase_access_token}", "Content-Type": "application/json"},
                        json={"query": sql},
                    )
                    if resp.status_code < 400:
                        updated_count += 1
                    logger.debug(
                        "Menu stock sync: product %s qty %s -> %s",
                        product_id, current_qty, new_qty,
                    )

        logger.info("Menu stock sync: %d product(s) updated", updated_count)
        return updated_count

    async def sync_menu_stock_from_inventory(self) -> int:
        """Recalculate all menu product quantities based on bottleneck ingredients.

        After restocking, call this to update every menu product's quantity
        to reflect the limiting ingredient.

        Returns:
            Number of products updated.
        """
        return await self._sync_menu_stocks()

    async def sync_all_menu_stocks(self) -> int:
        """Full recalculation for ALL products with recipes.

        Calculates bottleneck (min servings across all ingredients) and sets
        each product's quantity to max(current, potential_stock).
        """
        return await self._sync_menu_stocks()

    async def sync_menu_stock_for_inventory(self, inventory_ids: list) -> int:
        """Recalculate only products whose recipes use the given inventory IDs.

        Args:
            inventory_ids: List of inventory _id values that were restocked.

        Returns:
            Number of products updated.
        """
        return await self._sync_menu_stocks(inventory_ids=inventory_ids)

    # ── Category Management ─────────────────────────────────────────

    async def get_all_categories(self) -> list[dict]:
        """Ambil semua kategori dari pos.categories."""
        try:
            return await self._fetch(
                "pos_categories",
                "select=_id,name,displayOrder,parentId,track&order=displayOrder.asc",
            )
        except Exception:
            return []

    async def create_category(
        self, name: str, display_order: int = 99, parent_id: str | None = None
    ) -> dict | None:
        """Buat kategori baru di pos.categories."""
        import uuid
        source_id = str(uuid.uuid4())
        data = {
            "source_id": source_id,
            "name": name.strip(),
            "display_order": display_order,
            "parent_source_id": parent_id,
            "track": "inventory",
            "creation_time": datetime.now(WIB).timestamp(),
            "raw": {"created_by": "yumi_finance_agent", "created_at": datetime.now(WIB).isoformat()},
        }
        return await self._post("categories", data)
