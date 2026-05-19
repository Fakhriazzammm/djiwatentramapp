"""memory.py — AI Memory & Learning module untuk Yumi Finance Agent.

Continuous learning system yang menyimpan item→category mappings,
merchant profiles, price history, dan feedback log ke Supabase.
Semua data dipakai untuk meningkatkan akurasi kategorisasi dari waktu ke waktu.
"""

import logging
import re
import httpx
from datetime import datetime, timezone, timedelta

from item_normalization import expand_item_alias, normalize_unit

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))


def normalize_name(name: str) -> str:
    """Normalize item name for consistent matching: expand alias, strip qty/unit, lowercase."""
    original = (name or "").strip()
    expanded, _ = expand_item_alias(original)
    name = (expanded or original).lower().strip()

    # Remove quantity/unit suffixes: "1kg", "500ml", "2 pcs", etc.
    name = re.sub(
        r'\d+(?:[,.]\d+)?\s*(?:kg|gram|gr|g|ml|liter|lt|l|pcs|pack|sachet|ikat|bungkus|botol|gelas|bal|dus|karton|renceng|toros|ctn)\b',
        '', name,
    )

    # Normalize remaining standalone unit tokens
    tokens = [normalize_unit(tok) or tok for tok in re.split(r'\s+', name) if tok]
    name = " ".join(tokens)

    # Remove extra spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name


class MemoryManager:
    """Manager for AI memory operations — continuous learning from receipts."""

    def __init__(self, supabase_url: str, supabase_key: str, service_role_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.service_role_key = service_role_key
        # In-memory caches
        self.item_memory_cache: dict[str, dict] = {}  # normalized_name → {category, confidence, ...}
        self.merchant_cache: dict[str, dict] = {}

    def _service_headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
            "Accept-Profile": "pos",
        }

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Accept-Profile": "pos",
        }

    async def _post(self, table: str, data: dict) -> bool:
        url = f"{self.supabase_url}/rest/v1/{table}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, headers=self._service_headers(), json=data)
            return resp.status_code < 400

    async def _patch(self, table: str, query: str, data: dict) -> bool:
        url = f"{self.supabase_url}/rest/v1/{table}?{query}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(url, headers=self._service_headers(), json=data)
            return resp.status_code < 400

    async def _fetch(self, table: str, query: str = "select=*") -> list:
        url = f"{self.supabase_url}/rest/v1/{table}?{query}"
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=self._headers())
            resp.raise_for_status()
            return resp.json() or []

    # ── Item Memory ──────────────────────────────────────────────

    async def load_item_memory(self):
        """Load all item→category mappings into cache on startup."""
        rows = await self._fetch(
            "item_category_memory",
            "select=item_name_normalized,category_key,confidence,occurrence_count,source&order=confidence.desc&limit=5000",
        )
        self.item_memory_cache.clear()
        for r in rows:
            key = r["item_name_normalized"]
            if key not in self.item_memory_cache or r["confidence"] > self.item_memory_cache[key]["confidence"]:
                self.item_memory_cache[key] = {
                    "category": r["category_key"],
                    "confidence": float(r.get("confidence", 0)),
                    "count": int(r.get("occurrence_count", 1)),
                    "source": r.get("source", "ai"),
                }
        logger.info("Loaded %d item memory entries", len(self.item_memory_cache))

    def get_item_category(self, item_name: str) -> tuple:
        """Check item→category memory. Returns (category_key, confidence) or (None, 0)."""
        normalized = normalize_name(item_name)
        mem = self.item_memory_cache.get(normalized)
        if mem and mem["confidence"] >= 0.6:
            return mem["category"], mem["confidence"]
        return None, 0

    async def record_item_category(
        self, item_name: str, category_key: str, source: str = "ai",
        confidence_boost: float = 0.1, merchant: str = "",
    ):
        """Upsert item→category mapping. Boosts confidence on repeated classification."""
        normalized = normalize_name(item_name)
        if not normalized or not category_key:
            return
        existing = self.item_memory_cache.get(normalized)

        if existing and existing["category"] == category_key:
            new_conf = min(1.0, existing["confidence"] + confidence_boost)
            new_count = existing["count"] + 1
            self.item_memory_cache[normalized] = {
                "category": category_key, "confidence": new_conf,
                "count": new_count, "source": source,
            }
            await self._patch(
                "item_category_memory",
                f"item_name_normalized=eq.{normalized}&category_key=eq.{category_key}",
                {
                    "confidence": new_conf,
                    "occurrence_count": new_count,
                    "last_seen_at": datetime.now(WIB).isoformat(),
                    "source": source,
                },
            )
        else:
            new_conf = 0.5 if source == "ai" else 0.8
            self.item_memory_cache[normalized] = {
                "category": category_key, "confidence": new_conf,
                "count": 1, "source": source,
            }
            await self._post("item_category_memory", {
                "item_name": item_name[:200],
                "item_name_normalized": normalized,
                "category_key": category_key,
                "confidence": new_conf,
                "source": source,
                "occurrence_count": 1,
                "last_seen_at": datetime.now(WIB).isoformat(),
                "metadata": {"merchant": merchant} if merchant else {},
            })

    # ── Feedback Log ─────────────────────────────────────────────

    async def log_feedback(
        self, item_name: str, original_category: str | None,
        corrected_category: str, merchant: str = "", receipt_date: str = "",
    ):
        """Log user category correction. Also updates item memory with high confidence."""
        if not item_name or not corrected_category:
            return
        normalized = normalize_name(item_name)
        await self._post("category_feedback_log", {
            "item_name": item_name[:200],
            "item_name_normalized": normalized,
            "original_category": original_category,
            "corrected_category": corrected_category,
            "merchant_name": merchant,
            "receipt_date": receipt_date,
            "feedback_type": "correction" if original_category != corrected_category else "confirmation",
            "created_at": datetime.now(WIB).isoformat(),
        })
        await self.record_item_category(
            item_name, corrected_category, source="user_correction", confidence_boost=0.3,
        )

    # ── Merchant Profiles ────────────────────────────────────────

    async def update_merchant_profile(
        self, merchant: str, categories: dict, items: list[str], total: float,
    ):
        """Update merchant profile with new receipt data."""
        if not merchant or merchant == "Tanpa Nama":
            return
        normalized = merchant.lower().strip()
        existing_rows = await self._fetch(
            "merchant_profiles",
            f"select=id,typical_categories,typical_items,total_receipts,avg_receipt_amount&merchant_name_normalized=eq.{normalized}&limit=1",
        )
        now_iso = datetime.now(WIB).isoformat()
        if existing_rows:
            row = existing_rows[0]
            old_cats = row.get("typical_categories", {}) or {}
            old_items = set(row.get("typical_items", []) or [])
            old_count = int(row.get("total_receipts", 0))
            old_avg = float(row.get("avg_receipt_amount", 0))
            for cat, count in (categories or {}).items():
                old_cats[cat] = old_cats.get(cat, 0) + count
            new_items = list(old_items | set(items))[:100]
            new_count = old_count + 1
            new_avg = ((old_avg * old_count) + total) / new_count if new_count > 0 else total
            await self._patch("merchant_profiles", f"id=eq.{row['id']}", {
                "typical_categories": old_cats,
                "typical_items": new_items,
                "total_receipts": new_count,
                "avg_receipt_amount": round(new_avg, 2),
                "last_seen_at": now_iso,
                "updated_at": now_iso,
            })
        else:
            await self._post("merchant_profiles", {
                "merchant_name": merchant[:200],
                "merchant_name_normalized": normalized,
                "typical_categories": categories or {},
                "typical_items": (items or [])[:50],
                "total_receipts": 1,
                "avg_receipt_amount": total,
                "last_seen_at": now_iso,
            })

    async def load_merchant_profiles(self):
        """Load merchant profiles into cache."""
        rows = await self._fetch(
            "merchant_profiles",
            "select=merchant_name_normalized,typical_categories,typical_items&limit=200",
        )
        self.merchant_cache.clear()
        for m in rows:
            self.merchant_cache[m["merchant_name_normalized"]] = m
        logger.info("Loaded %d merchant profiles", len(self.merchant_cache))

    def get_merchant_hint(self, merchant: str) -> dict | None:
        """Get merchant profile as categorization hint."""
        if not merchant:
            return None
        return self.merchant_cache.get(merchant.lower().strip())

    # ── Price History ────────────────────────────────────────────

    async def record_prices(
        self, items: list[dict], merchant: str, receipt_date: str, receipt_id: str = "",
    ):
        """Record all item prices from a receipt."""
        for item in (items or []):
            name = (item.get("name") or "").strip()
            price = float(item.get("price") or 0)
            if not name or price <= 0:
                continue
            await self._post("price_history", {
                "item_name": name[:200],
                "item_name_normalized": normalize_name(name),
                "merchant_name": merchant,
                "price": price,
                "quantity": float(item.get("qty") or 1),
                "unit": item.get("unit", ""),
                "receipt_date": receipt_date,
                "receipt_id": receipt_id,
                "category_key": item.get("_category", "lainnya"),
            })

    async def get_price_range(self, item_name: str, days: int = 90) -> dict:
        """Get min/avg/max price for an item over last N days."""
        normalized = normalize_name(item_name)
        cutoff = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
        rows = await self._fetch(
            "price_history",
            f"select=price&item_name_normalized=eq.{normalized}&receipt_date=gte.{cutoff}&limit=200",
        )
        if not rows:
            return {"min": 0, "max": 0, "avg": 0, "count": 0}
        prices = [r["price"] for r in rows if r.get("price", 0) > 0]
        if not prices:
            return {"min": 0, "max": 0, "avg": 0, "count": 0}
        return {
            "min": min(prices),
            "max": max(prices),
            "avg": sum(prices) / len(prices),
            "count": len(prices),
        }

    async def detect_price_anomaly(self, item_name: str, current_price: float) -> str | None:
        """Check if current price is anomalous (>50% above average)."""
        pr = await self.get_price_range(item_name)
        if pr["count"] < 3:
            return None
        avg = pr["avg"]
        if avg > 0 and current_price > avg * 1.5:
            return (
                f"⚠️ {item_name[:30]}: Rp{current_price:,.0f} "
                f"(rata-rata Rp{avg:,.0f} dari {pr['count']} data)"
            )
        return None

    # ── Startup ──────────────────────────────────────────────────

    async def load_all(self):
        """Load all memory caches on startup."""
        await self.load_item_memory()
        await self.load_merchant_profiles()
        logger.info(
            "Memory ready: %d items, %d merchants",
            len(self.item_memory_cache), len(self.merchant_cache),
        )
