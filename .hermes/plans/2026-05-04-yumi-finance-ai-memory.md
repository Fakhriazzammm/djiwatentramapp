# Yumi Finance Agent — AI Memory & Continuous Learning System

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a persistent AI memory system that learns from every receipt processed — storing item→category mappings, merchant profiles, price history, and user feedback — to continuously improve OCR categorization accuracy without manual intervention.

**Architecture:** Three-tier memory system: (1) **Fast-tier** — in-memory keyword cache with confidence scoring, synced from Supabase on boot. (2) **Learning-tier** — Supabase tables storing historical mappings, user corrections, and merchant profiles. (3) **Insight-tier** — AI-powered pattern detection (price anomalies, merchant-item associations) via SumoPod on cron.

**Tech Stack:** Python (existing bot), Supabase REST API, SumoPod AI, Supabase pgvector (optional for semantic search)

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                   OCR RECEIPT FLOW                       │
│  Foto → SumoPod Vision → Items + Merchant + Price        │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│              CATEGORIZATION ENGINE                       │
│  1. Check keyword cache (categories.py)                  │
│  2. Check item→category memory (Supabase)               │
│  3. Check merchant→category profile                      │
│  4. Fallback: SumoPod AI suggestion                      │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│              FEEDBACK LOOP                               │
│  • User clicks "Edit Kategori" → correction saved        │
│  • User clicks "Simpan" without editing → confirmation   │
│  • Every saved transaction feeds the memory              │
└─────────────────────┬───────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────┐
│                MEMORY TABLES (Supabase)                  │
│  • item_category_memory — item→category with confidence  │
│  • merchant_profiles — merchant→typical items/categories │
│  • price_history — item prices over time                 │
│  • category_feedback — user corrections log              │
└─────────────────────────────────────────────────────────┘
```

## Memory Architecture

### Tier 1: Fast (In-Memory Cache)
- **Location:** `categories.py` module-level dict (already exists as `_db_categories`)
- **Loaded:** On bot startup from Supabase
- **Used for:** Real-time matching during OCR display
- **TTL:** Session lifetime (re-synced on restart)

### Tier 2: Learning (Supabase Tables)
- **Persistence:** Survives restarts, accumulates over time
- **Used for:** Training data, confidence calculation, audit trail
- **Tables:** 4 new tables (see below)

### Tier 3: Insight (AI Analysis)
- **Trigger:** Cron job (daily/weekly) or on-demand
- **Used for:** Price anomaly detection, merchant pattern analysis, category suggestions
- **Output:** Alerts to finance group, new category suggestions

---

## New Supabase Tables

### Table 1: `pos.item_category_memory`
Stores item→category mappings with confidence scores. Every OCR classification feeds this table.

```sql
create table if not exists pos.item_category_memory (
  id bigint primary key generated always as identity,
  item_name text not null,              -- "Kopi Arabica 1kg"
  item_name_normalized text not null,   -- "kopi arabica" (lowercase, no qty)
  category_key text not null,           -- "bahan_minuman"
  confidence float not null default 0,  -- 0.0-1.0 based on history
  source text not null default 'ai',    -- 'ai' | 'user_correction' | 'merchant_inference'
  occurrence_count int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'  -- {merchant, price_range, etc}
);

create unique index if not exists item_category_memory_unique_idx
  on pos.item_category_memory (item_name_normalized, category_key);

create index if not exists item_category_memory_name_idx
  on pos.item_category_memory (item_name_normalized);
```

### Table 2: `pos.merchant_profiles`
Learns what each merchant typically sells and what categories their items fall into.

```sql
create table if not exists pos.merchant_profiles (
  id bigint primary key generated always as identity,
  merchant_name text not null,
  merchant_name_normalized text not null,
  typical_categories jsonb not null default '{}',  -- {"bahan_minuman": 45, "packaging": 12}
  typical_items jsonb not null default '[]',       -- ["Kopi Arabica", "Gula Pasir", ...]
  total_receipts int not null default 0,
  avg_receipt_amount float not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);

create unique index if not exists merchant_profiles_name_idx
  on pos.merchant_profiles (merchant_name_normalized);

create index if not exists merchant_profiles_categories_idx
  on pos.merchant_profiles using gin (typical_categories);
```

### Table 3: `pos.price_history`
Tracks item prices over time for anomaly detection and cost analysis.

```sql
create table if not exists pos.price_history (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  merchant_name text,
  price float not null,
  quantity float not null default 1,
  unit text,
  receipt_date date,
  receipt_id text,
  category_key text,
  created_at timestamptz not null default now()
);

create index if not exists price_history_item_idx
  on pos.price_history (item_name_normalized, receipt_date desc);

create index if not exists price_history_merchant_idx
  on pos.price_history (merchant_name);
```

### Table 4: `pos.category_feedback_log`
Audit trail of all user category corrections — the core of the feedback loop.

```sql
create table if not exists pos.category_feedback_log (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  original_category text,               -- AI prediction
  corrected_category text,              -- user choice
  merchant_name text,
  receipt_date date,
  feedback_type text not null default 'correction',  -- 'correction' | 'confirmation' | 'rejection'
  created_at timestamptz not null default now()
);

create index if not exists feedback_log_item_idx
  on pos.category_feedback_log (item_name_normalized);

create index if not exists feedback_log_date_idx
  on pos.category_feedback_log (created_at desc);
```

---

## Implementation Plan

> **For Hermes:** Execute with `delegate_task` using subagent-driven-development skill. One subagent per major task. Two-stage review (spec compliance → code quality).

---

### Task 1: Create Supabase Migration

**Objective:** Create the 4 new tables in `pos` schema with proper indexes and RLS.

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_ai_memory_schema.sql`

**Migration SQL:**

```sql
-- item_category_memory
create table if not exists pos.item_category_memory (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  category_key text not null,
  confidence float not null default 0,
  source text not null default 'ai',
  occurrence_count int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create unique index if not exists item_category_memory_unique_idx
  on pos.item_category_memory (item_name_normalized, category_key);
create index if not exists item_category_memory_name_idx
  on pos.item_category_memory (item_name_normalized);

-- merchant_profiles
create table if not exists pos.merchant_profiles (
  id bigint primary key generated always as identity,
  merchant_name text not null,
  merchant_name_normalized text not null,
  typical_categories jsonb not null default '{}',
  typical_items jsonb not null default '[]',
  total_receipts int not null default 0,
  avg_receipt_amount float not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create unique index if not exists merchant_profiles_name_idx
  on pos.merchant_profiles (merchant_name_normalized);
create index if not exists merchant_profiles_categories_idx
  on pos.merchant_profiles using gin (typical_categories);

-- price_history
create table if not exists pos.price_history (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  merchant_name text,
  price float not null,
  quantity float not null default 1,
  unit text,
  receipt_date date,
  receipt_id text,
  category_key text,
  created_at timestamptz not null default now()
);
create index if not exists price_history_item_idx
  on pos.price_history (item_name_normalized, receipt_date desc);
create index if not exists price_history_merchant_idx
  on pos.price_history (merchant_name);

-- category_feedback_log
create table if not exists pos.category_feedback_log (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  original_category text,
  corrected_category text,
  merchant_name text,
  receipt_date date,
  feedback_type text not null default 'correction',
  created_at timestamptz not null default now()
);
create index if not exists feedback_log_item_idx
  on pos.category_feedback_log (item_name_normalized);
create index if not exists feedback_log_date_idx
  on pos.category_feedback_log (created_at desc);

-- RLS: allow anon insert, authenticated select
alter table pos.item_category_memory enable row level security;
alter table pos.merchant_profiles enable row level security;
alter table pos.price_history enable row level security;
alter table pos.category_feedback_log enable row level security;

-- Public insert for OCR writes (anon via service role in bot)
create policy "memory_public_insert" on pos.item_category_memory for insert to anon, authenticated with check (true);
create policy "memory_public_select" on pos.item_category_memory for select to anon, authenticated using (true);
create policy "merchant_public_insert" on pos.merchant_profiles for insert to anon, authenticated with check (true);
create policy "merchant_public_select" on pos.merchant_profiles for select to anon, authenticated using (true);
create policy "price_public_insert" on pos.price_history for insert to anon, authenticated with check (true);
create policy "price_public_select" on pos.price_history for select to anon, authenticated using (true);
create policy "feedback_public_insert" on pos.category_feedback_log for insert to anon, authenticated with check (true);
create policy "feedback_public_select" on pos.category_feedback_log for select to anon, authenticated using (true);

grant insert, select on pos.item_category_memory to anon, authenticated;
grant insert, select, update on pos.merchant_profiles to anon, authenticated;
grant insert, select on pos.price_history to anon, authenticated;
grant insert, select on pos.category_feedback_log to anon, authenticated;
```

**Step 1:** Write the migration file.

**Step 2:** Push to Supabase:
```bash
cd /opt/djiwatentramapp && npx supabase db push
```

**Step 3:** Verify tables exist:
```bash
curl -s "https://xaemykhjpkgypqqpfdcb.supabase.co/rest/v1/item_category_memory?limit=1" \
  -H "apikey: sb_publishable_..." -H "Authorization: Bearer sb_publishable_..."
```
Expected: HTTP 200 with `[]`

---

### Task 2: Create `memory.py` Module

**Objective:** New module handling all memory operations — read/write item memory, merchant profiles, price history, feedback.

**Files:**
- Create: `yumi-finance-agent/memory.py`

**Key functions:**

```python
"""memory.py — AI Memory & Learning module untuk Yumi Finance Agent."""

import logging
import re
import httpx
from datetime import datetime, timezone, timedelta
from collections import Counter

logger = logging.getLogger(__name__)
WIB = timezone(timedelta(hours=7))


def normalize_name(name: str) -> str:
    """Normalize item name for consistent matching: lowercase, remove qty, trim."""
    name = name.lower().strip()
    # Remove common quantity patterns: "1kg", "500ml", "2 pcs", "1 liter"
    name = re.sub(r'\d+(?:\.\d+)?\s*(?:kg|gram|gr|g|ml|liter|lt|l|pcs|pack|sachet|ikat|bungkus|botol|gelas|bal|dus|karton)\b', '', name)
    # Remove extra spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name


class MemoryManager:
    """Manager for AI memory operations — learning from receipts."""

    def __init__(self, supabase_url: str, supabase_key: str, service_role_key: str):
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self.service_role_key = service_role_key
        # In-memory cache
        self.item_memory_cache: dict[str, dict] = {}  # normalized_name → {category, confidence}
        self.merchant_cache: dict[str, dict] = {}

    def _service_headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _headers(self):
        return {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
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
            return resp.json()

    # ── Item Memory ──────────────────────────────────────────

    async def load_item_memory(self):
        """Load all item→category mappings into cache on startup."""
        rows = await self._fetch("item_category_memory", "select=item_name_normalized,category_key,confidence,occurrence_count,source&order=confidence.desc&limit=5000")
        self.item_memory_cache.clear()
        for r in rows:
            key = r["item_name_normalized"]
            if key not in self.item_memory_cache or r["confidence"] > self.item_memory_cache[key]["confidence"]:
                self.item_memory_cache[key] = {
                    "category": r["category_key"],
                    "confidence": r["confidence"],
                    "count": r.get("occurrence_count", 1),
                    "source": r.get("source", "ai"),
                }
        logger.info(f"Loaded {len(self.item_memory_cache)} item memory entries")

    def get_item_category(self, item_name: str) -> tuple[str | None, float]:
        """Check item→category memory. Returns (category_key, confidence) or (None, 0)."""
        normalized = normalize_name(item_name)
        mem = self.item_memory_cache.get(normalized)
        if mem and mem["confidence"] >= 0.6:
            return mem["category"], mem["confidence"]
        return None, 0

    async def record_item_category(
        self, item_name: str, category_key: str, source: str = "ai",
        confidence_boost: float = 0.1, merchant: str = ""
    ):
        """Upsert item→category mapping. Boosts confidence on repeated classification."""
        normalized = normalize_name(item_name)
        existing = self.item_memory_cache.get(normalized)

        if existing and existing["category"] == category_key:
            # Same category — boost confidence
            new_conf = min(1.0, existing["confidence"] + confidence_boost)
            new_count = existing["count"] + 1
            # Update cache
            self.item_memory_cache[normalized] = {
                "category": category_key, "confidence": new_conf,
                "count": new_count, "source": source,
            }
            # Update DB
            await self._patch(
                "item_category_memory",
                f"item_name_normalized=eq.{httpx.URL(normalized).raw_path.decode() if False else ''}",
                # Use POST-based approach with unique constraint
                {"confidence": new_conf, "occurrence_count": new_count, "last_seen_at": "now()"},
            )
        else:
            # New or different category
            new_conf = 0.5 if source == "ai" else 0.8
            self.item_memory_cache[normalized] = {
                "category": category_key, "confidence": new_conf,
                "count": 1, "source": source,
            }
            await self._post("item_category_memory", {
                "item_name": item_name,
                "item_name_normalized": normalized,
                "category_key": category_key,
                "confidence": new_conf,
                "source": source,
                "occurrence_count": 1,
                "last_seen_at": datetime.now(WIB).isoformat(),
                "metadata": {"merchant": merchant} if merchant else {},
            })

    # ── Feedback Log ─────────────────────────────────────────

    async def log_feedback(
        self, item_name: str, original_category: str | None,
        corrected_category: str, merchant: str = "", receipt_date: str = ""
    ):
        """Log user category correction. Also updates item memory with high confidence."""
        normalized = normalize_name(item_name)
        await self._post("category_feedback_log", {
            "item_name": item_name,
            "item_name_normalized": normalized,
            "original_category": original_category,
            "corrected_category": corrected_category,
            "merchant_name": merchant,
            "receipt_date": receipt_date,
            "feedback_type": "correction" if original_category != corrected_category else "confirmation",
            "created_at": datetime.now(WIB).isoformat(),
        })
        # Immediately update item memory with high confidence
        await self.record_item_category(item_name, corrected_category, source="user_correction", confidence_boost=0.3)

    # ── Merchant Profiles ────────────────────────────────────

    async def update_merchant_profile(self, merchant: str, categories: dict, items: list[str], total: float):
        """Update merchant profile with new receipt data."""
        normalized = merchant.lower().strip()
        # Simple upsert: read → merge → write
        existing_rows = await self._fetch(
            "merchant_profiles",
            f"select=id,typical_categories,typical_items,total_receipts,avg_receipt_amount&merchant_name_normalized=eq.{normalized}&limit=1"
        )
        if existing_rows:
            row = existing_rows[0]
            old_cats = row.get("typical_categories", {})
            old_items = set(row.get("typical_items", []))
            old_count = row.get("total_receipts", 0)
            old_avg = row.get("avg_receipt_amount", 0)

            # Merge categories
            for cat, count in categories.items():
                old_cats[cat] = old_cats.get(cat, 0) + count
            new_items = list(old_items | set(items))[:100]
            new_count = old_count + 1
            new_avg = ((old_avg * old_count) + total) / new_count

            await self._patch("merchant_profiles", f"id=eq.{row['id']}", {
                "typical_categories": old_cats,
                "typical_items": new_items,
                "total_receipts": new_count,
                "avg_receipt_amount": round(new_avg, 2),
                "last_seen_at": datetime.now(WIB).isoformat(),
                "updated_at": datetime.now(WIB).isoformat(),
            })
        else:
            await self._post("merchant_profiles", {
                "merchant_name": merchant,
                "merchant_name_normalized": normalized,
                "typical_categories": categories,
                "typical_items": items[:50],
                "total_receipts": 1,
                "avg_receipt_amount": total,
                "last_seen_at": datetime.now(WIB).isoformat(),
            })

    def get_merchant_hint(self, merchant: str) -> dict | None:
        """Get merchant profile as categorization hint. Returns None if not in cache."""
        normalized = merchant.lower().strip()
        return self.merchant_cache.get(normalized)

    # ── Price History ────────────────────────────────────────

    async def record_prices(self, items: list[dict], merchant: str, receipt_date: str, receipt_id: str = ""):
        """Record all item prices from a receipt."""
        for item in items:
            name = item.get("name", "").strip()
            if not name:
                continue
            await self._post("price_history", {
                "item_name": name,
                "item_name_normalized": normalize_name(name),
                "merchant_name": merchant,
                "price": float(item.get("price") or 0),
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
            f"select=price&item_name_normalized=eq.{normalized}&receipt_date=gte.{cutoff}&limit=200"
        )
        if not rows:
            return {"min": 0, "max": 0, "avg": 0, "count": 0}
        prices = [r["price"] for r in rows if r["price"] > 0]
        if not prices:
            return {"min": 0, "max": 0, "avg": 0, "count": 0}
        return {
            "min": min(prices),
            "max": max(prices),
            "avg": sum(prices) / len(prices),
            "count": len(prices),
        }

    async def detect_price_anomaly(self, item_name: str, current_price: float) -> str | None:
        """Check if current price is anomalous. Returns warning message or None."""
        price_range = await self.get_price_range(item_name)
        if price_range["count"] < 3:
            return None  # Not enough data
        avg = price_range["avg"]
        # Flag if >50% above average
        if avg > 0 and current_price > avg * 1.5:
            return f"⚠️ Harga {item_name} (Rp{current_price:,.0f}) di atas rata-rata (Rp{avg:,.0f})"
        return None

    # ── Startup Load ─────────────────────────────────────────

    async def load_all(self):
        """Load all memory caches on startup."""
        await self.load_item_memory()
        # Load merchant profiles
        merchants = await self._fetch("merchant_profiles", "select=merchant_name_normalized,typical_categories,typical_items&limit=200")
        self.merchant_cache.clear()
        for m in merchants:
            self.merchant_cache[m["merchant_name_normalized"]] = m
        logger.info(f"Loaded {len(self.merchant_cache)} merchant profiles")
```

**Step 1:** Create `memory.py` with the `MemoryManager` class above.

**Step 2:** Run syntax check:
```bash
cd /opt/djiwatentramapp/yumi-finance-agent && .venv/bin/python -c "import ast; ast.parse(open('memory.py').read()); print('OK')"
```

---

### Task 3: Integrate Memory into App

**Objective:** Wire `MemoryManager` into `app.py` — call memory on startup, check memory during categorization, log feedback on user actions.

**Files:**
- Modify: `yumi-finance-agent/app.py`

**Changes:**

**3a. Import and initialize memory:**
```python
from memory import MemoryManager, normalize_name

# After finance/inventory init (around line 54):
memory = MemoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
```

**3b. Load memory on startup in `main()`:**
```python
async def main():
    # ... existing code ...
    await memory.load_all()
    logger.info("Memory loaded: %d items, %d merchants", 
                len(memory.item_memory_cache), len(memory.merchant_cache))
    app.run_polling(...)
```

**3c. Check memory in `_display_bulk_summary` — enhance `categorize_item` flow:**
Inside the item loop, after `categorize_item()`:
```python
# Check AI memory for better category
mem_cat, mem_conf = memory.get_item_category(name)
if mem_conf > cat_conf_score:  # Use memory if higher confidence
    cat_key = mem_cat
    cat_conf = "high" if mem_conf > 0.8 else "medium"
```

**3d. Record to memory in `_handle_bulk_callback` — after successful save:**
Inside the `if action in ("income", "expense"):` block:
```python
# After saving all receipts
for ri in receipts:
    if tx_result.get("ok"):
        # Record item categories
        for item in ri.get("items", []):
            cat = item.get("_category", "operasional")
            await memory.record_item_category(
                item.get("name", ""), cat, source="ai", confidence_boost=0.1,
                merchant=ri.get("merchant", "")
            )
        # Record prices
        await memory.record_prices(
            ri.get("items", []),
            ri.get("merchant", ""),
            ri.get("date", ""),
            ri.get("receipt_number", "")
        )
        # Update merchant profile
        item_cats = Counter(it.get("_category", "lainnya") for it in ri.get("items", []))
        item_names = [it.get("name", "") for it in ri.get("items", [])]
        await memory.update_merchant_profile(
            ri.get("merchant", "Tanpa Nama"),
            dict(item_cats),
            item_names,
            ri.get("total", 0)
        )
```

**3e. Log feedback when user edits category (`receipt_setcat_` handler):**
Inside `_handle_receipt_callback`, after updating category:
```python
# Log feedback for learning
await memory.log_feedback(
    item_name=item.get("name", ""),  # for each item
    original_category=old_category,
    corrected_category=cat_key,
    merchant=receipt.get("merchant", ""),
    receipt_date=receipt.get("date", "")
)
```

**Step 1:** Apply each sub-change as separate patches.

**Step 2:** Syntax check:
```bash
cd /opt/djiwatentramapp/yumi-finance-agent && .venv/bin/python -c "import ast; ast.parse(open('app.py').read()); print('OK')"
```

**Step 3:** Restart & verify no crashes:
```bash
sudo systemctl restart yumi-finance-agent && sleep 3 && sudo journalctl -u yumi-finance-agent --since "5 sec ago" --no-pager | grep -i "memory\|error" | head -10
```
Expected: `Loaded N item memory entries` with no errors.

---

### Task 4: Confidence Scoring Algorithm

**Objective:** Refine `categorize_item()` in `categories.py` to merge keyword matching + memory lookup + merchant hint into a single confidence score.

**Files:**
- Modify: `yumi-finance-agent/categories.py`

**New function: `categorize_item_with_memory()`**

```python
def categorize_item_with_memory(
    item_name: str,
    item_price: float = 0,
    merchant: str = "",
    memory_manager=None  # MemoryManager instance
) -> tuple[str, str, str, float]:
    """Enhanced categorization using keywords + memory + merchant hints.
    
    Returns:
        (category_key, confidence_label, suggested_label, score_0_to_1)
    """
    # 1. Keyword matching (existing)
    cat_key, cat_conf, suggested = categorize_item(item_name, item_price)
    
    # Convert confidence label to score
    conf_scores = {"high": 0.8, "medium": 0.5, "low": 0.2}
    score = conf_scores.get(cat_conf, 0.2)
    
    # 2. Memory lookup (if memory_manager provided)
    if memory_manager:
        mem_cat, mem_conf = memory_manager.get_item_category(item_name)
        if mem_cat and mem_conf > score:
            cat_key = mem_cat
            score = mem_conf
            cat_conf = "high" if mem_conf > 0.8 else "medium"
    
    # 3. Merchant hint (if memory_manager provided)
    if memory_manager and merchant:
        merchant_hint = memory_manager.get_merchant_hint(merchant)
        if merchant_hint and score < 0.7:
            typical_cats = merchant_hint.get("typical_categories", {})
            if typical_cats:
                # Boost the most common category for this merchant
                top_cat = max(typical_cats, key=typical_cats.get)
                if top_cat != "lainnya" and cat_key == "lainnya":
                    cat_key = top_cat
                    score = 0.6
                    cat_conf = "medium"
    
    return cat_key, cat_conf, suggested, score
```

**Step 1:** Add the new function to `categories.py`.

**Step 2:** Update `app.py` `_display_bulk_summary` to use `categorize_item_with_memory` with the `memory` instance.

**Step 3:** Syntax check & restart.

---

### Task 5: Price Anomaly Alerts

**Objective:** After processing bulk receipts, check for price anomalies and alert in the response.

**Files:**
- Modify: `yumi-finance-agent/app.py` — `_handle_bulk_callback`

**Change:** After the receipt loop, add anomaly check:

```python
# Check price anomalies
anomalies = []
for ri in receipts:
    for item in ri.get("items", []):
        name = item.get("name", "").strip()
        price = float(item.get("price") or 0)
        if name and price > 0:
            warning = await memory.detect_price_anomaly(name, price)
            if warning:
                anomalies.append(warning)

# Add to response
if anomalies:
    lines.append("")
    lines.append("🔍 Peringatan Harga:")
    for a in anomalies[:5]:
        lines.append(f"  {a}")
```

**Step 1:** Add anomaly check code.

**Step 2:** Restart & test by sending a receipt with unusually high price.

---

### Task 6: Cron Job — Daily Learning Sync

**Objective:** Schedule a daily job that analyzes memory data and suggests improvements (new categories, keyword updates, merchant pattern reports).

**Implementation:** Use Hermes cronjob to run daily analysis

**Cron task description:**
```
Load Yumi Finance memory from Supabase. Analyze:
1. Top uncategorized items — suggest categories via AI
2. Merchant spending trends — total per merchant this month
3. Category distribution changes — any shifts in spending patterns
4. Price anomalies in last 7 days
Send summary to finance group (-4995568785).
```

**Step 1:** Create the cron job via Hermes `cronjob` tool (user will configure schedule).

---

## Summary

| Tier | What | Where | When |
|------|------|-------|------|
| **Fast** | Keyword + memory cache | `categories.py` in-memory | Every OCR display |
| **Learning** | item→category, merchant profiles, price history | Supabase `pos.*_memory` tables | After every saved receipt |
| **Feedback** | User corrections | `pos.category_feedback_log` | On "Edit Kategori" action |
| **Insight** | Anomaly detection, trend analysis | Cron job + AI | Daily |

**Expected improvement:** After 50+ receipts, AI should auto-categorize 80%+ of items correctly without user intervention.
