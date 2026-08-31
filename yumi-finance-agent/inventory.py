"""inventory.py — Module inventory Yumi Finance AI Agent.

Cek stok, restok, fuzzy match bahan baru, anti-duplikasi.
"""

import logging
import hashlib
import json
import httpx
import re
from datetime import datetime, timezone, timedelta
from rapidfuzz import fuzz, process

# Import alias resolver untuk matching berbasis nama kanonik
from item_normalization import expand_item_alias, normalize_unit

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))

# ── Fuzzy match threshold ──────────────────────────────────────────
MIN_SCORE_AUTO = 60       # auto-match tanpa konfirmasi
MIN_SCORE_SUGGEST = 45    # tanya user
MIN_SCORE_NEW = 30        # dianggap barang baru

# ── Regex: extract qty suffix ──────────────────────────────────────
_QTY_SUFFIX_RE = re.compile(
    r'(\d+(?:[.,]\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|sachet|renceng|ikat|toros|bungkus|botol|gelas)\b',
    re.IGNORECASE,
)

_UNIT_TO_BASE = {
    "ml": 1, "liter": 1000, "lt": 1000, "l": 1000,
    "kg": 1000, "gram": 1, "gr": 1, "g": 1,
    "pcs": 1, "pack": 1, "sachet": 1, "renceng": 1,
    "ikat": 1, "toros": 1, "bungkus": 1, "botol": 1, "gelas": 1,
}

# Brand/supplier words yg sering muncul di struk tapi bukan bagian nama item
_BRAND_NOISE_WORDS = {
    "brand", "original", "premium", "classic", "deluxe", "special",
    "extra", "super", "ultra", "plus", "new", "enriched", "fortified",
    "vit", "vitamin", "dll", "etc",
}

# Multi-word brands yg perlu dilindungi (jangan distrip)
_PROTECTED_BRANDS = [
    "gold", "silver", "platinum", "black", "white", "red", "blue",
    "green", "yellow", "fresh", "milk", "cream", "cheese",
]

_PROTEIN_GROUPS = {
    "chicken": {"ayam", "chicken"},
    "beef": {"sapi", "beef"},
    "fish": {"ikan", "fish"},
    "seafood": {"udang", "cumi", "kerang", "seafood"},
}


def _has_conflicting_protein(receipt_tokens: set[str], inventory_tokens: set[str]) -> bool:
    receipt_groups = {group for group, words in _PROTEIN_GROUPS.items() if receipt_tokens & words}
    inventory_groups = {group for group, words in _PROTEIN_GROUPS.items() if inventory_tokens & words}
    return bool(receipt_groups and inventory_groups and receipt_groups.isdisjoint(inventory_groups))

# ── Common brand prefixes to strip (brand name as prefix of product) ──
# e.g. "Yoa Basil" -> brand "Yoa" diketahui, cari "Basil" di DB
# Diisi via alias system di item_normalization, bukan hardcode di sini


def _clean_name(name: str) -> str:
    """Bersihkan nama item: lowercase, hapus extra space, hapus qty suffix, strip brand noise."""
    if not name:
        return ""
    cleaned = name.lower().strip()
    # Hapus qty suffix dari nama untuk matching
    cleaned = _QTY_SUFFIX_RE.sub("", cleaned).strip()
    # Hapus tanda baca: koma, titik, kurung, petik, dll
    cleaned = re.sub(r'[^\w\s]', ' ', cleaned)
    # Hapus angka berdiri sendiri (tp jaga yg menyatu kayak "2x500ml" udah dihapus di atas)
    cleaned = re.sub(r'\b\d+\b', ' ', cleaned)
    # Hapus "x" separator: "2x500ml" -> udah dihapus, tapi standalone "x" juga
    # Hapus multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def _word_overlap_score(tokens_a: set[str], tokens_b: set[str]) -> float:
    """Hitung rasio kata yang sama antara dua set token.
    
    Returns: 0.0 - 1.0 (1.0 = semua token sama)
    Berguna untuk menekan false positive dari random char overlap.
    """
    if not tokens_a or not tokens_b:
        return 0.0
    common = tokens_a & tokens_b
    # Jaccard-like: common / union size, weighted by length
    # Tapi untuk matching item, lebih baik common / max(len(a), len(b))
    # karena item sering punya jumlah kata berbeda
    return len(common) / max(len(tokens_a), len(tokens_b), 1)


def _word_overlap_bonus(tokens_a: set[str], tokens_b: set[str]) -> int:
    """Berikan score tambahan untuk kata-kata yang sama persis.
    
    Returns: 0-30, berdasarkan jumlah kata bersama.
    """
    if not tokens_a or not tokens_b:
        return 0
    common = tokens_a & tokens_b
    if not common:
        return 0
    # Fokus pada kata non-trivial (>2 chars)
    meaningful = {w for w in common if len(w) > 2}
    if not meaningful:
        # Trivial words only - give small bonus
        return min(len(common) * 5, 10)
    return min(len(meaningful) * 10, 30)


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

    async def get_approved_candidate_mappings(self) -> dict[str, dict]:
        """Load explicit candidate approvals as receipt-name → inventory redirect.

        Staging classifications are intentionally ignored until a reviewer marks
        the candidate APPROVED. This prevents fuzzy suggestions from becoming
        persistent aliases or duplicate inventory rows.
        """
        url = f"{self.supabase_url}/rest/v1/inventory_item_candidates"
        params = {
            "select": "normalized_name,proposed_inventory_source_id,proposed_canonical_name",
            "match_status": "eq.APPROVED",
            "proposed_inventory_source_id": "not.is.null",
            "limit": "5000",
        }
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept-Profile": "pos",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            rows = resp.json()
        return {
            str(row.get("normalized_name") or "").strip().casefold(): row
            for row in rows
            if str(row.get("normalized_name") or "").strip()
            and row.get("proposed_inventory_source_id")
        }

    async def fuzzy_match_item(
        self, receipt_name: str, inventory_list: list[dict] | None = None,
        item_price: float = 0.0, merchant: str = "",
    ) -> tuple[dict | None, int]:
        """Fuzzy match nama item receipt ke inventory — multi-strategy scoring.

        Strategi (digabung):
        1. Alias resolution via expand_item_alias (DB alias cache)
        2. token_sort_ratio + token_set_ratio (rapidfuzz)
        3. partial_ratio untuk substring match
        4. Word overlap penalty/bonus untuk kurangi false positive
        5. Substring check (satu nama ada di dalam nama lain)
        6. Price proximity bonus (jika item_price diberikan)
        7. Merchant history bonus (jika merchant diberikan)

        Args:
            receipt_name: nama item dari OCR
            inventory_list: list inventory (jika None, fetch dari Supabase)
            item_price: harga item dari OCR, untuk price-aware matching
            merchant: nama merchant untuk history-aware matching

        Returns:
            (matched_item_dict or None, score)
            score >= 60: auto-match
            score >= 45: suggest
            score < 45: no match
        """
        if inventory_list is None:
            inventory_list = await self.get_all_inventory()

        # Cache merchant history (kalau merchant diberikan)
        _merchant_freq: dict[str, int] = {}
        if merchant:
            try:
                _merchant_freq = await self.get_merchant_item_history(merchant)
            except Exception:
                pass

        receipt_name = (receipt_name or "").strip()
        if not receipt_name:
            return None, 0

        # Step 1: Resolve alias — "FM GF" → "Freshmilk Greenfield"
        alias_name, alias_from = expand_item_alias(receipt_name)
        receipt_for_match = alias_name or receipt_name

        receipt_clean = _clean_name(receipt_for_match)
        receipt_tokens = set(receipt_clean.split())

        best = None
        best_score = 0
        best_sub_score = 0  # second-best untuk debugging

        for inv_item in inventory_list:
            inv_name = (inv_item.get("ingredientName") or "").strip()
            if not inv_name:
                continue

            inv_clean = _clean_name(inv_name)
            inv_tokens = set(inv_clean.split())

            if not receipt_clean or not inv_clean:
                continue
            if _has_conflicting_protein(receipt_tokens, inv_tokens):
                continue

            # ── Multi-strategy scoring ──────────────────────────────
            # 2a. Token sort ratio — immune to word order
            score_ts = fuzz.token_sort_ratio(receipt_clean, inv_clean)
            # 2b. Token set ratio — better for partial overlap
            score_tset = fuzz.token_set_ratio(receipt_clean, inv_clean)
            # 2c. Partial ratio — bonus jika satu nama adalah substring dari yang lain
            score_partial = fuzz.partial_ratio(receipt_clean, inv_clean)
            # 2d. Token sort with original (uncleaned) — kadang original punya info lebih
            score_orig = fuzz.token_sort_ratio(
                _clean_name(receipt_name), _clean_name(inv_name)
            )

            # 3. Word overlap — kurangi false positive dari random char overlap
            overlap = _word_overlap_score(receipt_tokens, inv_tokens)
            overlap_bonus = _word_overlap_bonus(receipt_tokens, inv_tokens)

            # 4. Substring check — jika salah satu nama ada di dalam yang lain
            substring_bonus = 0
            if len(receipt_clean) >= 3:
                if receipt_clean in inv_clean or inv_clean in receipt_clean:
                    substring_bonus = 15

            # ── Combine scores ──────────────────────────────────────
            # Weight: token_set_ratio most reliable for partial, token_sort for reorder
            combined = max(
                score_tset,           # token set — best for partial word match
                score_ts,             # token sort — good for reordered words
                score_partial,        # partial — catches substring
            )

            # Penalty: jika tidak ada word overlap sama sekali, turunkan score
            if overlap == 0.0 and combined >= 50:
                # False positive: high fuzzy score with zero word overlap
                # e.g. "Wincheez Gold" vs "Schweppes Soda" has characters in common
                # but NO actual words match
                combined = max(combined - 25, 20)

            # Bonus: word overlap yang baik
            if overlap >= 0.3:
                combined = min(combined + overlap_bonus, 100)
            elif overlap >= 0.2 and combined >= 40:
                combined = min(combined + overlap_bonus, 100)

            # Bonus: substring match
            if substring_bonus and combined < 85:
                combined = min(combined + substring_bonus, 100)

            # ── Price proximity bonus ──────────────────────────────
            if item_price > 0:
                inv_price = float(inv_item.get("lastPurchasePrice") or 0)
                if inv_price > 0:
                    deviation = abs(item_price - inv_price) / max(item_price, inv_price, 1)
                    if deviation <= 0.15:
                        combined = min(combined + 20, 100)
                    elif deviation <= 0.30:
                        combined = min(combined + 10, 100)
                    elif deviation <= 0.50:
                        combined = min(combined + 5, 100)

            # ── Merchant history bonus ─────────────────────────────
            if _merchant_freq:
                inv_name_lower = inv_name.lower()
                freq = _merchant_freq.get(inv_name_lower, 0)
                if freq >= 5:
                    combined = min(combined + 15, 100)
                elif freq >= 2:
                    combined = min(combined + 10, 100)
                elif freq >= 1:
                    combined = min(combined + 5, 100)

            # Ensure combined >= 0
            combined = max(combined, 0)

            if combined > best_score:
                best_score = combined
                best = inv_item
                best_sub_score = score_tset

        return best, int(best_score)

    async def _record_purchase_movement_if_ready(
        self, inventory_id: str, add_qty: float, unit: str,
        price: float = 0, source_reference_id: str = "", trace_id: str = "", ocr_item_id: str = "",
    ) -> bool | None:
        """Use the base-unit RPC only when purchase unit is unambiguous.

        Returns True when the ledger handled the quantity, None when legacy
        fallback is required, and raises on an indeterminate RPC failure.
        """
        if not source_reference_id:
            return None
        url = f"{self.supabase_url}/rest/v1/inventory"
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept-Profile": "pos",
        }
        params = {"select": "source_id,quantity,unit,base_unit,unit_status", "source_id": f"eq.{inventory_id}"}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            rows = response.json()
        if not rows:
            raise ValueError(f"Inventory item tidak ditemukan: {inventory_id}")
        row = rows[0]
        base_unit = normalize_unit(str(row.get("base_unit") or ""))
        purchase_unit = normalize_unit(unit)
        if row.get("unit_status") != "READY" or not base_unit or purchase_unit != base_unit:
            return None

        movement_id = "invtx_purchase_" + hashlib.sha256(
            f"{source_reference_id}:{inventory_id}".encode("utf-8")
        ).hexdigest()[:32]
        rpc_url = f"{self.supabase_url}/rest/v1/rpc/record_inventory_movement"
        payload = {
            "p_source_id": movement_id,
            "p_inventory_source_id": inventory_id,
            "p_movement_type": "purchase",
            "p_direction": "in",
            "p_quantity_base": add_qty,
            "p_unit_base": base_unit,
            "p_source_type": "financial_transaction",
            "p_source_reference_id": source_reference_id,
            "p_cost_per_base_unit": price if price > 0 else None,
            "p_notes": "Purchase receipt dual-write",
            "p_raw": {
                "source": "yumi-finance-agent",
                "purchaseUnit": unit,
                "traceId": trace_id,
                "ocrItemId": ocr_item_id,
            },
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(rpc_url, headers={**headers, "Content-Type": "application/json"}, json=payload)
            response.raise_for_status()
        return True

    async def restock_item(
        self, inventory_id: str, current_qty: float, add_qty: float,
        unit: str = "", price: float = 0, source_reference_id: str = "",
        trace_id: str = "", ocr_item_id: str = "",
    ) -> bool:
        """Tambah stok item. Jika price > 0, update lastPurchasePrice juga."""
        new_qty = current_qty + add_qty
        movement_handled = await self._record_purchase_movement_if_ready(
            inventory_id, add_qty, unit, price, source_reference_id, trace_id, ocr_item_id
        )
        data = {} if movement_handled else {"quantity": new_qty}
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

    async def log_purchase(
        self, ingredient_name: str, qty_added: float, unit: str,
        total_cost: float, merchant: str = "", inventory_id: str = "",
        source_transaction_id: str = "", trace_id: str = "", ocr_item_id: str = "",
    ) -> bool:
        """Catat purchase log."""
        data = {
            "ingredient_name": ingredient_name,
            "quantity_added": qty_added,
            "unit": unit,
            "total_cost": total_cost,
            "merchant": merchant or "Yumi Finance",
            "inventory_id": inventory_id or None,
            "ocr_raw_text": json.dumps({
                "sourceTransactionId": source_transaction_id,
                "traceId": trace_id,
                "ocrItemId": ocr_item_id,
            }, ensure_ascii=False),
            "created_at": datetime.now(WIB).strftime("%Y-%m-%dT%H:%M:%S"),
        }
        result = await self._post("pos_purchase_logs", data)
        return result is not None

    async def add_alias(self, inventory_id: str, new_alias: str) -> bool:
        """Tambah alias ke inventory item. Append ke array aliases jika belum ada.

        Args:
            inventory_id: _id dari item di pos.inventory
            new_alias: alias name to add

        Returns:
            True jika berhasil
        """
        new_alias = (new_alias or "").strip()
        if not new_alias or not inventory_id:
            return False

        # Pakai service_role_key + Accept-Profile: pos untuk akses snake_case
        url = f"{self.supabase_url}/rest/v1/inventory?_id=eq.{inventory_id}"
        headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept-Profile": "pos",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

        # Ambil aliases existing dulu
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url + "&select=aliases,ingredient_name", headers=headers)
            if resp.status_code >= 400:
                logger.warning("add_alias: failed to fetch item %s: %s", inventory_id, resp.text)
                return False

            data = resp.json()
            if not data:
                return False

            existing = data[0].get("aliases") or []
            ingredient_name = data[0].get("ingredient_name", "")

            # Cek duplikat (case-insensitive)
            alias_lower = new_alias.lower()
            already_exists = any(e.lower() == alias_lower for e in existing)
            if already_exists:
                return True

            # Append
            updated = existing + [new_alias]

            # PATCH
            patch_resp = await client.patch(
                url,
                headers=headers,
                json={"aliases": updated},
            )

            if patch_resp.status_code < 400:
                logger.info("Alias added: '%s' -> '%s'", new_alias, ingredient_name or inventory_id)
                # Refresh alias cache di item_normalization
                from item_normalization import load_aliases_from_db  # noqa: F811
                all_aliases = await self.get_all_inventory_aliases()
                load_aliases_from_db(all_aliases)
                return True

            logger.warning("add_alias PATCH failed: %s", patch_resp.text)
            return False

    async def get_merchant_item_history(self, merchant: str, limit_days: int = 90) -> dict[str, int]:
        """Ambil history pembelian per merchant — item → frequency.

        Returns:
            { "gula pasir": 5, "tepung": 3, ... }
            (item name lowercase → count of purchases)
        """
        merchant = (merchant or "").strip()
        if not merchant or merchant.lower() in ("yumi finance", ""):
            return {}

        since = (datetime.now(WIB) - timedelta(days=limit_days)).strftime("%Y-%m-%dT%H:%M:%S")

        try:
            # Gunakan ilike untuk partial match merchant name
            safe_merchant = merchant.replace("'", "''")
            rows = await self._fetch(
                "pos_purchase_logs",
                f"select=ingredient_name,merchant&merchant=ilike.*{safe_merchant}*&created_at=gte.{since}&limit=500",
            )
        except Exception as e:
            logger.warning("get_merchant_item_history error: %s", e)
            return {}

        freq: dict[str, int] = {}
        for r in rows:
            name = (r.get("ingredient_name") or "").strip()
            if name:
                name_lower = name.lower()
                freq[name_lower] = freq.get(name_lower, 0) + 1

        return freq

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


# ── Standalone inventory matching (untuk bulk path) ─────────────────


def _find_inventory_match(
    receipt_name: str, inventory_list: list[dict],
    item_price: float = 0.0,
) -> dict | None:
    """Cari item receipt di inventory list — SINGLE-THREAD wrapper.

    Mirip fuzzy_match_item() tapi synchronous (tanpa await),
    digunakan oleh bulk OCR path yang perlu match tanpa async.

    Args:
        receipt_name: nama item dari OCR
        inventory_list: list inventory
        item_price: harga item dari OCR, untuk price-aware matching

    Returns dict {_id, ingredientName, quantity, score, ...} atau None.
    score >= 60 = auto-match, >= 45 = suggest.
    """
    receipt_name = (receipt_name or "").strip()
    if not receipt_name or not inventory_list:
        return None

    # Resolve alias
    alias_name, _ = expand_item_alias(receipt_name)
    receipt_for_match = alias_name or receipt_name

    receipt_clean = _clean_name(receipt_for_match)
    receipt_tokens = set(receipt_clean.split())

    best = None
    best_score = 0

    for inv_item in inventory_list:
        inv_name = (inv_item.get("ingredientName") or "").strip()
        if not inv_name:
            continue

        inv_clean = _clean_name(inv_name)
        inv_tokens = set(inv_clean.split())

        if not receipt_clean or not inv_clean:
            continue

        # Multi-strategy scoring (sama dengan fuzzy_match_item)
        score_ts = fuzz.token_sort_ratio(receipt_clean, inv_clean)
        score_tset = fuzz.token_set_ratio(receipt_clean, inv_clean)
        score_partial = fuzz.partial_ratio(receipt_clean, inv_clean)

        overlap = _word_overlap_score(receipt_tokens, inv_tokens)
        overlap_bonus = _word_overlap_bonus(receipt_tokens, inv_tokens)

        substring_bonus = 0
        if len(receipt_clean) >= 3:
            if receipt_clean in inv_clean or inv_clean in receipt_clean:
                substring_bonus = 15

        combined = max(score_tset, score_ts, score_partial)

        # Penalty: no word overlap = false positive
        if overlap == 0.0 and combined >= 50:
            combined = max(combined - 25, 20)

        if overlap >= 0.3:
            combined = min(combined + overlap_bonus, 100)
        elif overlap >= 0.2 and combined >= 40:
            combined = min(combined + overlap_bonus, 100)

        if substring_bonus and combined < 85:
            combined = min(combined + substring_bonus, 100)

        # ── Price proximity bonus ──────────────────────────────
        if item_price > 0:
            inv_price = float(inv_item.get("lastPurchasePrice") or 0)
            if inv_price > 0:
                deviation = abs(item_price - inv_price) / max(item_price, inv_price, 1)
                if deviation <= 0.15:
                    combined = min(combined + 20, 100)
                elif deviation <= 0.30:
                    combined = min(combined + 10, 100)
                elif deviation <= 0.50:
                    combined = min(combined + 5, 100)

        combined = max(combined, 0)

        if combined > best_score:
            best_score = combined
            best = inv_item

    if best and best_score >= MIN_SCORE_NEW:
        result = dict(best)
        result["score"] = int(best_score)
        return result
    return None
