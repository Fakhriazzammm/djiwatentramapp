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

    def __init__(self, supabase_url: str, supabase_key: str, service_role_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.service_role_key = service_role_key

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept-Profile": "pos",
        }

    def _service_headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
            "Accept-Profile": "pos",
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
            "select=_id,ingredientName,quantity,lowStockThreshold,unit,lastPurchasePrice",
        )

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
        self, inventory_id: str, current_qty: float, add_qty: float, unit: str = ""
    ) -> bool:
        """Tambah stok item."""
        new_qty = current_qty + add_qty
        data = {"quantity": new_qty}
        if unit:
            data["unit"] = unit
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
