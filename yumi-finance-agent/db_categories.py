"""db_categories.py — Kategorisasi berbasis database Supabase.

Memanfaatkan data dari tabel:
- pos.inventory.category → finance category mapping
- pos.products.category_source_id → pos.categories.name
- pos.recipes (ingredient → product linkage)
- pos.base_recipes.category

Digunakan oleh categories.py untuk meningkatkan akurasi auto-kategorisasi.
"""

import re
import logging
import httpx

logger = logging.getLogger("yumi-finance.db_categories")

# ── Mapping inventory zone → finance category ───────────────────────
# Kolom category di pos.inventory adalah TEXT (operational zone)
# Dipetakan ke kategori keuangan (FINANCE_CATEGORIES keys)
ZONE_TO_FINANCE: dict[str, str | None] = {
    # Bar / Minuman
    "bar": "bahan_minuman",
    "minuman": "bahan_minuman",
    "drink": "bahan_minuman",
    "coffee": "bahan_minuman",
    "kopi": "bahan_minuman",
    "coffee_bar": "bahan_minuman",
    "beverage": "bahan_minuman",
    # Dapur / Makanan (ambigu — butuh sub-categorization via keyword/recipe)
    "kitchen": None,
    "dapur": None,
    "food": None,
    "makanan": None,
    # Pastry / Bakery
    "pastry": "bahan_makanan",
    "bakery": "bahan_makanan",
    "roti": "bahan_makanan",
    # Packaging
    "packaging": "packaging",
    "pack": "packaging",
    "packing": "packaging",
    "kemasan": "packaging",
    "wadah": "packaging",
    # Cleaning
    "cleaning": "cleaning",
    "clean": "cleaning",
    "kebersihan": "cleaning",
    "sanitasi": "cleaning",
    "sanitary": "cleaning",
    # Gas & Energi
    "gas": "gas_energi",
    "gas_energi": "gas_energi",
    "energy": "gas_energi",
    "listrik": "gas_energi",
    "utilities": "gas_energi",
    # Operasional
    "operational": "operasional",
    "operasional": "operasional",
    "office": "operasional",
    "umum": "operasional",
    # Sewa & Internet
    "sewa": "sewa_wifi",
    "sewa_wifi": "sewa_wifi",
    "internet": "sewa_wifi",
    # Transport
    "transport": "transport",
    "transportasi": "transport",
    "delivery": "transport",
    "kirim": "transport",
    # Promosi
    "promosi": "promosi",
    "promotion": "promosi",
    "marketing": "promosi",
    "iklan": "promosi",
    # Peralatan
    "peralatan": "peralatan",
    "equipment": "peralatan",
    "alat": "peralatan",
    "mesin": "peralatan",
    "maintenance": "peralatan",
    # Gaji
    "gaji": "gaji",
    "salary": "gaji",
    "honor": "gaji",
    # Bahan Segar (jarang dipakai sebagai zone, fallback via keyword)
    "segar": "bahan_segar",
    "sayur": "bahan_segar",
    "vegetable": "bahan_segar",
    "buah": "bahan_segar",
    "fruit": "bahan_segar",
}

# ── Mapping POS product category name → finance category ────────────
# pos.categories.name → FINANCE_CATEGORIES key
# Untuk resep: jika ingredient dipakai oleh product dengan kategori X,
# maka ingredient cenderung masuk finance category Y.
PRODUCT_CAT_TO_FINANCE: dict[str, str] = {
    "coffee": "bahan_minuman",
    "non coffee": "bahan_minuman",
    "non-coffee": "bahan_minuman",
    "non_coffee": "bahan_minuman",
    "minuman": "bahan_minuman",
    "drink": "bahan_minuman",
    "beverage": "bahan_minuman",
    "signature": "bahan_minuman",
    "mocktail": "bahan_minuman",
    "smoothie": "bahan_minuman",
    "milkshake": "bahan_minuman",
    "tea": "bahan_minuman",
    "teh": "bahan_minuman",
    "kopi": "bahan_minuman",
    "es kopi": "bahan_minuman",
    "iced coffee": "bahan_minuman",
    "hot coffee": "bahan_minuman",
    "makanan": "bahan_makanan",
    "food": "bahan_makanan",
    "main course": "bahan_makanan",
    "appetizer": "bahan_makanan",
    "dessert": "bahan_makanan",
    "snack": "bahan_makanan",
    "cemilan": "bahan_makanan",
    "rice": "bahan_makanan",
    "nasi": "bahan_makanan",
    "mie": "bahan_makanan",
    "pasta": "bahan_makanan",
    "pastry": "bahan_makanan",
    "bakery": "bahan_makanan",
    "roti": "bahan_makanan",
    "cake": "bahan_makanan",
    "sayur": "bahan_segar",
    "vegetable": "bahan_segar",
    "salad": "bahan_segar",
    "buah": "bahan_segar",
    "fruit": "bahan_segar",
}

# ── Kitchen zone sub-categorization keywords ────────────────────────
# Untuk inventory dengan category='kitchen', cari keyword ini
# untuk bedakan bahan_makanan vs bahan_segar
_KITCHEN_FOOD_KEYWORDS = [
    "beras", "nasi", "mie", "indomie", "pasta", "spaghetti",
    "tepung", "terigu", "tapioka", "maizena", "sagu",
    "minyak", "mentega", "butter", "margarin",
    "daging", "ayam", "sapi", "ikan", "udang", "telur",
    "tahu", "tempe", "nugget", "sosis", "bakso",
    "bumbu", "kecap", "saus", "sambal",
    "garam", "merica", "lada", "royco", "masako", "kaldu",
    "gula pasir", "gula putih", "gula halus",
    "kornet", "kari", "kare",
]

_KITCHEN_SEGAR_KEYWORDS = [
    "sayur", "sayuran", "selada", "kol", "wortel", "tomat",
    "brokoli", "bayam", "kangkung", "sawi", "kentang",
    "buah", "jeruk", "lemon", "alpukat", "pisang", "stroberi",
    "mint", "basil", "kemangi", "daun bawang",
    "jamur", "terong", "buncis",
]


def _categorize_kitchen(item_name_lower: str) -> str | None:
    """Sub-categorize kitchen zone items: bahan_makanan vs bahan_segar."""
    for kw in _KITCHEN_FOOD_KEYWORDS:
        if kw in item_name_lower:
            return "bahan_makanan"
    for kw in _KITCHEN_SEGAR_KEYWORDS:
        if kw in item_name_lower:
            return "bahan_segar"
    # Default: keyword dari categories.py akan handle
    return None


# ── DB-backed category resolver ─────────────────────────────────────

class DBCategoryResolver:
    """Resolver kategorisasi berbasis data Supabase.

    Di-build saat startup dengan fetch dari DB:
    1. Semua inventory items + category zone
    2. Semua products + category name
    3. Semua recipes → ingredient → product linkage

    Digunakan untuk pre-lookup sebelum AI fallback.
    """

    def __init__(self):
        # Maps: item_name_lowercase → (finance_category_key, source_label)
        # source_label untuk debugging: 'inventory_zone', 'recipe_context', 'product_name'
        self._item_map: dict[str, tuple[str, str]] = {}
        # Maps: fingerprint_normalized → finance_category_key
        self._alias_map: dict[str, str] = {}

        # Product → POS category name lookup (via recipes)
        # inventory_id → set of pos_category_names
        self._recipe_context: dict[str, set[str]] = {}

        # All inventory items with zone
        self._inventory_by_id: dict[str, dict] = {}

        # Product names → finance category (from product POS category)
        self._product_name_map: dict[str, str] = {}

        self._loaded = False

    async def build(
        self,
        supabase_url: str,
        supabase_key: str,
        service_role_key: str,
    ) -> None:
        """Fetch all data from Supabase dan build lookup maps."""
        base = supabase_url.rstrip("/")
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {service_role_key}",
        }
        headers_no_auth = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
        }

        self._item_map.clear()
        self._alias_map.clear()
        self._recipe_context.clear()
        self._inventory_by_id.clear()
        self._product_name_map.clear()

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                # ── 1. Fetch inventory ──────────────────────────────
                # pos_inventory view tidak punya kolom aliases — fetch terpisah
                inv_resp = await client.get(
                    f"{base}/rest/v1/pos_inventory",
                    headers=headers_no_auth,
                    params={
                        "select": "_id,ingredientName,category",
                        "limit": 500,
                    },
                )
                if inv_resp.status_code == 200:
                    inventory_items = inv_resp.json()
                else:
                    # Fallback: coba service_role untuk snake_case table
                    inv_resp2 = await client.get(
                        f"{base}/rest/v1/inventory",
                        headers=headers,
                        params={"select": "source_id,ingredient_name,category", "limit": 500},
                    )
                    if inv_resp2.status_code == 200:
                        inventory_items = [
                            {
                                "_id": i.get("source_id", ""),
                                "ingredientName": i.get("ingredient_name", ""),
                                "category": i.get("category", ""),
                            }
                            for i in inv_resp2.json()
                        ]
                    else:
                        logger.warning("Failed to fetch inventory: %s %s",
                                       inv_resp.status_code, inv_resp.text[:200])
                        inventory_items = []

                # Fetch aliases separately (snake_case table, Accept-Profile: pos)
                try:
                    alias_resp = await client.get(
                        f"{base}/rest/v1/inventory",
                        headers={
                            "apikey": supabase_key,
                            "Authorization": f"Bearer {service_role_key}",
                            "Accept-Profile": "pos",
                        },
                        params={"select": "ingredient_name,aliases", "limit": 500},
                    )
                    if alias_resp.status_code == 200:
                        for alias_row in alias_resp.json():
                            alias_name = (alias_row.get("ingredient_name") or "").strip().lower()
                            raw_aliases = alias_row.get("aliases") or []
                            if not alias_name or not raw_aliases:
                                continue

                            # Find the finance category for this inventory item
                            fin_target = None
                            for item in inventory_items:
                                if (item.get("ingredientName") or "").strip().lower() == alias_name:
                                    zone = (item.get("category") or "").strip().lower()
                                    if zone in ZONE_TO_FINANCE:
                                        fin_target = ZONE_TO_FINANCE[zone]
                                    elif zone in ("kitchen", "dapur", "food", "makanan"):
                                        sub_cat = _categorize_kitchen(alias_name)
                                        if sub_cat:
                                            fin_target = sub_cat
                                    break

                            if fin_target:
                                if isinstance(raw_aliases, str):
                                    try:
                                        import json
                                        raw_aliases = json.loads(raw_aliases)
                                    except (json.JSONDecodeError, TypeError):
                                        raw_aliases = []
                                for alias in raw_aliases:
                                    alias_str = str(alias).strip().lower()
                                    if alias_str and len(alias_str) > 1:
                                        self._alias_map[alias_str] = fin_target
                except Exception as e:
                    logger.warning("Failed to fetch inventory aliases: %s", e)

                logger.info("DBCategoryResolver: fetched %d inventory items", len(inventory_items))

                # ── 2. Build inventory zone map ─────────────────────
                food_item_names = []  # untuk yang zone kitchen ambiguous
                for item in inventory_items:
                    inv_id = item.get("_id", "")
                    name = (item.get("ingredientName") or "").strip()
                    zone = (item.get("category") or "").strip().lower()
                    raw_aliases = item.get("aliases")

                    if not name:
                        continue

                    # Save for recipe context lookup
                    self._inventory_by_id[inv_id] = {
                        "name": name.lower(),
                        "zone": zone,
                    }

                    # Resolve zone → finance category
                    fin_cat = ZONE_TO_FINANCE.get(zone) if zone else None

                    if zone == "kitchen" or zone == "dapur" or (zone and zone in ("food", "makanan")):
                        # Kitchen zone — try sub-categorization
                        sub_cat = _categorize_kitchen(name.lower())
                        if sub_cat:
                            self._item_map[name.lower()] = (sub_cat, f"kitchen_subcat:{sub_cat}")
                            food_item_names.append((name.lower(), sub_cat))
                        else:
                            # Mark as unresolved kitchen — will use recipe context
                            food_item_names.append((name.lower(), None))
                    elif fin_cat:
                        self._item_map[name.lower()] = (fin_cat, f"inventory_zone:{zone}")
                    elif zone:
                        # Unknown zone — store anyway for keyword fallback
                        self._item_map[name.lower()] = (None, f"unknown_zone:{zone}")

                # ── 3. Fetch categories ─────────────────────────────
                cat_map: dict[str, str] = {}  # source_id → category_name
                try:
                    cat_resp = await client.get(
                        f"{base}/rest/v1/pos_categories",
                        headers=headers_no_auth,
                        params={"select": "_id,name", "limit": 100},
                    )
                    if cat_resp.status_code == 200:
                        for c in cat_resp.json():
                            cat_map[c["_id"]] = (c.get("name") or "").strip().lower()
                    logger.info("DBCategoryResolver: fetched %d POS categories", len(cat_map))
                except Exception as e:
                    logger.warning("Failed to fetch categories: %s", e)

                # ── 4. Fetch products ───────────────────────────────
                product_cat_map: dict[str, str] = {}  # product_id → pos_category_name
                product_name_map: dict[str, str] = {}  # product_name_lower → product_id
                try:
                    prod_resp = await client.get(
                        f"{base}/rest/v1/pos_products_all",
                        headers=headers_no_auth,
                        params={"select": "_id,name,categoryId", "limit": 500},
                    )
                    if prod_resp.status_code == 200:
                        for p in prod_resp.json():
                            pid = p.get("_id", "")
                            pname = (p.get("name") or "").strip().lower()
                            cat_id = p.get("categoryId", "")
                            if pid and pname:
                                product_name_map[pname] = pid
                                cat_name = cat_map.get(cat_id, "")
                                product_cat_map[pid] = cat_name
                                # Map product name directly to finance category
                                if cat_name:
                                    fin_cat_for_product = self._map_product_cat_to_finance(cat_name, pname)
                                    if fin_cat_for_product:
                                        self._product_name_map[pname] = fin_cat_for_product
                    logger.info("DBCategoryResolver: fetched %d products", len(product_name_map))
                except Exception as e:
                    logger.warning("Failed to fetch products: %s", e)

                # ── 5. Fetch recipes → build ingredient→product→category context ──
                try:
                    recipe_resp = await client.get(
                        f"{base}/rest/v1/pos_recipes",
                        headers=headers_no_auth,
                        params={"select": "productId,ingredients", "limit": 500},
                    )
                    if recipe_resp.status_code == 200:
                        recipes = recipe_resp.json()
                        for recipe in recipes:
                            prod_id = recipe.get("productId", "")
                            ingredients = recipe.get("ingredients", [])
                            if not prod_id or not ingredients:
                                continue
                            prod_cat_name = product_cat_map.get(prod_id, "")

                            for ing in ingredients:
                                inv_id = ing.get("inventoryId", "")
                                if not inv_id:
                                    continue
                                if inv_id not in self._recipe_context:
                                    self._recipe_context[inv_id] = set()
                                if prod_cat_name:
                                    self._recipe_context[inv_id].add(prod_cat_name)
                    logger.info("DBCategoryResolver: fetched recipes, built context for %d inventory items",
                                len(self._recipe_context))
                except Exception as e:
                    logger.warning("Failed to fetch recipes: %s", e)

                # ── 6. Resolve ambiguous kitchen items via recipe context ──
                for name_lower, sub_cat in food_item_names:
                    if sub_cat is not None:
                        continue  # already resolved

                    # Find inventory_id for this name
                    inv_id = None
                    for iid, info in self._inventory_by_id.items():
                        if info.get("name") == name_lower:
                            inv_id = iid
                            break

                    if not inv_id:
                        continue

                    # Check recipe context
                    prod_cats = self._recipe_context.get(inv_id, set())
                    if not prod_cats:
                        continue

                    # Count votes per finance category
                    votes: dict[str, int] = {}
                    for pc in prod_cats:
                        fin = PRODUCT_CAT_TO_FINANCE.get(pc)
                        if fin:
                            votes[fin] = votes.get(fin, 0) + 1

                    if votes:
                        best_fin = max(votes, key=votes.get)
                        self._item_map[name_lower] = (best_fin, f"recipe_context:{best_fin}")
                        logger.debug("Resolved kitchen item '%s' → %s via recipe (votes: %s)",
                                     name_lower, best_fin, votes)

                self._loaded = True
                logger.info("DBCategoryResolver: built %d item mappings, %d alias mappings, %d product mappings",
                            len(self._item_map), len(self._alias_map), len(self._product_name_map))

        except Exception as e:
            logger.warning("DBCategoryResolver.build failed: %s", e)
            self._loaded = False

    def _map_product_cat_to_finance(self, pos_cat_name: str, product_name: str) -> str | None:
        """Map POS category name to finance category with fallback to product name keyword."""
        # Direct lookup
        pc_lower = pos_cat_name.lower().strip()
        result = PRODUCT_CAT_TO_FINANCE.get(pc_lower)
        if result:
            return result

        # Partial match
        for key, val in PRODUCT_CAT_TO_FINANCE.items():
            if key in pc_lower or pc_lower in key:
                return val

        return None

    def lookup(self, item_name: str) -> tuple[str | None, str]:
        """Cari finance category untuk item name.

        Args:
            item_name: Nama item (raw, case insensitive).

        Returns:
            (finance_category_key or None, source_description)
            source_description untuk tracing: 'exact_match', 'alias_match',
            'product_match', 'recipe_context', 'inventory_zone', etc.
        """
        if not self._loaded or not item_name:
            return None, ""

        name_lower = item_name.strip().lower()

        # 1. Exact match
        result = self._item_map.get(name_lower)
        if result and result[0]:
            return result

        # 2. Alias match
        alias_result = self._alias_map.get(name_lower)
        if alias_result:
            return alias_result, "alias_match"

        # 3. Partial match — cari substring
        for key, (fin_cat, source) in self._item_map.items():
            if fin_cat and (key in name_lower or name_lower in key):
                return fin_cat, f"partial_match:({key})→{source}"
            # Token match
            if fin_cat:
                key_tokens = set(key.split())
                name_tokens = set(name_lower.split())
                if key_tokens & name_tokens:  # ada token yang sama
                    return fin_cat, f"token_match:({key})→{source}"

        # 4. Product name match
        for prod_name, fin_cat in self._product_name_map.items():
            if prod_name in name_lower or name_lower in prod_name:
                return fin_cat, f"product_match:{prod_name}"

        return None, ""

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def clear(self):
        """Reset semua cache."""
        self._item_map.clear()
        self._alias_map.clear()
        self._recipe_context.clear()
        self._inventory_by_id.clear()
        self._product_name_map.clear()
        self._loaded = False


# ── Global singleton ────────────────────────────────────────────────
_resolver = DBCategoryResolver()


def get_resolver() -> DBCategoryResolver:
    return _resolver


async def build_resolver(
    supabase_url: str,
    supabase_key: str,
    service_role_key: str,
) -> None:
    """Build global resolver (panggil di startup)."""
    await _resolver.build(supabase_url, supabase_key, service_role_key)
