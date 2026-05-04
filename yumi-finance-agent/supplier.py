"""supplier.py — Supplier Directory untuk Yumi Finance Agent.

Lookup supplier by category, search by name/keyword, get contact info.
Data dari Google Sheet DATA SUPPLIER, di-import ke pos.suppliers.
"""

import logging
import httpx

logger = logging.getLogger(__name__)


class SupplierManager:
    """Manager untuk supplier directory operations."""

    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept-Profile": "pos",
        }

    async def _fetch(self, table: str, query: str = "select=*") -> list:
        url = f"{self.supabase_url}/rest/v1/{table}?{query}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json() or []

    # ── Lookup ────────────────────────────────────────────────────

    async def get_by_category(self, category: str) -> list[dict]:
        """Get suppliers by category (case-insensitive)."""
        cat_lower = category.lower().strip()
        rows = await self._fetch(
            "suppliers",
            f"select=name,category,grade,price_range,address,phone,notes&order=grade.asc&limit=50",
        )
        return [
            r for r in rows
            if cat_lower in (r.get("category") or "").lower()
        ]

    async def search(self, keyword: str) -> list[dict]:
        """Search suppliers by name, category, or notes."""
        kw = keyword.lower().strip()
        rows = await self._fetch(
            "suppliers",
            "select=name,category,grade,price_range,address,phone,notes&limit=50",
        )
        results = []
        for r in rows:
            name = (r.get("name") or "").lower()
            cat = (r.get("category") or "").lower()
            notes = (r.get("notes") or "").lower()
            if kw in name or kw in cat or kw in notes:
                results.append(r)
        return results

    async def get_all_categories(self) -> list[str]:
        """Get distinct categories."""
        rows = await self._fetch(
            "suppliers",
            "select=category&order=category.asc&limit=50",
        )
        cats = set()
        for r in rows:
            cat = (r.get("category") or "").strip()
            if cat:
                cats.add(cat)
        return sorted(cats)

    # ── Format untuk Telegram ─────────────────────────────────────

    @staticmethod
    def format_supplier(s: dict, compact: bool = False) -> str:
        """Format satu supplier untuk display Telegram."""
        name = s.get("name", "?")
        category = s.get("category", "")
        grade = s.get("grade", "")
        phone = s.get("phone", "")
        address = s.get("address", "")
        price_range = s.get("price_range", "")
        notes = (s.get("notes") or "").replace("- ", "").replace(" - ", ", ")

        grade_icon = {"A": "⭐", "B": "✅", "C": "⚠️"}.get(grade, "")
        grade_str = f"{grade_icon}{grade}" if grade else ""

        if compact:
            phone_str = f" 📞{phone}" if phone else ""
            return f"• {name} {grade_str}{phone_str}"

        lines = []
        header = f"{name}"
        if grade_str:
            header += f" {grade_str}"
        lines.append(header)
        if category:
            lines.append(f"  🏷️ {category}")
        if price_range:
            lines.append(f"  💰 {price_range}")
        if phone:
            lines.append(f"  📞 {phone}")
        if address:
            lines.append(f"  📍 {address}")
        if notes:
            lines.append(f"  📦 {notes[:120]}")
        return "\n".join(lines)

    @staticmethod
    def format_supplier_list(suppliers: list[dict], title: str = "📋 Supplier") -> str:
        """Format list supplier untuk Telegram."""
        if not suppliers:
            return f"{title}\n\nTidak ditemukan."

        lines = [f"{title} ({len(suppliers)}):", ""]
        for s in suppliers:
            lines.append(SupplierManager.format_supplier(s))
            lines.append("")
        return "\n".join(lines).strip()
