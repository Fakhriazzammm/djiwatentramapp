"""
Yumi Purchasing Agent — AI-Powered Inventory & Marketlist Telegram Bot.

Handle: marketlist, stock check, restock, supplier lookup, AI chat.
Terintegrasi dengan Yumi Finance Agent via shared Supabase DB.
"""
import asyncio
import json
import logging
import os
import sys
import threading
from datetime import datetime, timezone, timedelta
import math
import re

import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, ApplicationBuilder, CommandHandler,
    MessageHandler, CallbackQueryHandler, ContextTypes, filters,
)

from hermes_adapter import (
    TelegramContext,
    audit_event,
    build_request,
    project_scope_summary,
    validate_response,
)

sys.path.insert(0, os.path.dirname(__file__))

from sumopod_client import SumoPodClient
from purchasing_orchestrator import PurchasingOrchestrator, PurchasingResult
from marketlist import (
    generate_marketlist,
    ai_categorize_suppliers,
    process_input_marketlist,
    format_merchant_marketlist,
    recalculate_with_qty,
    remove_item_and_reformat,
)
from inventory import InventoryManager
from callback_manager import (
    build_marketlist_keyboard,
    handle_marketlist_callback,
    handle_marketlist_text_input,
)
from rapidfuzz import fuzz, process as fuzz_process
from learning_memory import update_learning_entry, search_learning_memory, save_learning_entry, increment_usage, load_learning_memory

# ── Shared alias normalization system (symlinked to yumi-finance-agent) ──
from item_normalization import expand_item_alias, normalize_unit, load_aliases_from_db

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STOCK_GROUP_ID = int(os.getenv("STOCK_GROUP_ID", "-5070733215"))
SUMOPOD_API_KEY = os.getenv("SUMOPOD_API_KEY", "")

if not all([TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY]):
    raise ValueError("TELEGRAM_BOT_TOKEN, SUPABASE_URL, dan SUPABASE_KEY wajib diisi di .env")

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("yumi-purchasing")

inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY)
orchestrator = PurchasingOrchestrator(SUMOPOD_API_KEY)

# ── Supplier Manager ────────────────────────────────────────────
class SupplierManager:
    def __init__(self):
        self._cache = None
        self._categories = set()

    async def _load(self):
        if self._cache is not None:
            return
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=*&isActive=eq.true&order=name",
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                )
                resp.raise_for_status()
                data = resp.json()
            self._cache = {}
            for s in data:
                store_id = s.get("_id", "").strip()
                name = s.get("name", "").strip()
                if name:
                    self._cache[name.lower()] = s
                    # Also index by ID for preferredStoreId lookups
                    if store_id:
                        self._cache[store_id] = s
                    cat = (s.get("type") or "").strip()
                    if cat:
                        self._categories.add(cat.lower())
            logger.info("Supplier DB loaded: %d suppliers from pos_inventory_stores, %d categories",
                        len(self._cache), len(self._categories))
        except Exception as e:
            logger.warning("Supplier load from pos_inventory_stores failed: %s", e)
            self._cache = {}

    async def search(self, query: str) -> list[dict]:
        await self._load()
        if not self._cache:
            return []
        q = query.lower().strip()
        results = []
        seen = set()
        for key, s in self._cache.items():
            name = s.get("name", "").lower()
            cat = (s.get("type") or "").lower()
            if q in name or q in cat:
                sid = s.get("_id", "")
                if sid not in seen:
                    seen.add(sid)
                    results.append({
                        "_id": s.get("_id", ""),
                        "name": s.get("name", ""),
                        "category": s.get("type", ""),
                        "grade": s.get("grade", ""),
                        "phone": s.get("phone", ""),
                        "address": s.get("address", ""),
                        "notes": s.get("notes", ""),
                    })
        return results

    async def get_all_suppliers(self) -> list[dict]:
        """Return all suppliers with _id, name, type, phone for merchant grouping."""
        await self._load()
        if not self._cache:
            return []
        seen = set()
        results = []
        for s in self._cache.values():
            sid = s.get("_id", "")
            if sid and sid not in seen:
                seen.add(sid)
                results.append({
                    "_id": sid,
                    "name": s.get("name", ""),
                    "category": s.get("type", ""),
                    "phone": s.get("phone", ""),
                })
        return results

    async def get_categories(self) -> list[str]:
        await self._load()
        return sorted(self._categories)

    async def get_supplier_by_id(self, store_id: str) -> dict | None:
        """Lookup supplier by _id."""
        await self._load()
        if not self._cache:
            return None
        # Direct lookup by ID from cache
        s = self._cache.get(store_id) or self._cache.get(store_id.lower())
        if s:
            return {
                "_id": s.get("_id", ""),
                "name": s.get("name", ""),
                "phone": s.get("phone", ""),
                "category": s.get("type", ""),
            }
        # Fallback: search all
        for key, s in self._cache.items():
            if s.get("_id", "") == store_id:
                return {
                    "_id": s.get("_id", ""),
                    "name": s.get("name", ""),
                    "phone": s.get("phone", ""),
                    "category": s.get("type", ""),
                }
        return None

supplier = SupplierManager()

# ── Session storage for marketlist callbacks ────────────────────
marketlist_sessions: dict[str, dict] = {}

# ── Stock Reaction State ─────────────────────────────────────────
_stock_reaction_history: dict = {}
_stock_reaction_lock = asyncio.Lock()
STOCK_REACTION_EXPIRY = 300  # 5 menit

def _is_kitchen(name: str) -> bool:
    _NON_KITCHEN_KW = ["gas", "baterai", "kresek", "sedotan", "sendok garpu",
                       "botol 1", "ekonomi", "soklin", "lifebuoy", "cling", "bento tupai",
                       "paperbowl", "cup 12", "multi tisu", "tutup cup"]
    return not any(kw in name.lower() for kw in _NON_KITCHEN_KW)

# ── Keyboard ────────────────────────────────────────────────────
def _keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🛒 Marketlist", callback_data="marketlist"),
            InlineKeyboardButton("⚠️ Stok Menipis", callback_data="low_stock"),
        ],
        [
            InlineKeyboardButton("📞 Supplier", callback_data="supplier"),
            InlineKeyboardButton("📦 Semua Stok", callback_data="all_stock"),
        ],
        [
            InlineKeyboardButton("💬 AI Chat", callback_data="ai_chat"),
            InlineKeyboardButton("ℹ️ Bantuan", callback_data="help"),
        ],
    ])

# ── Supabase fetch helper ───────────────────────────────────────
async def _fetch_fn(view: str, query: str = "select=*"):
    url = f"{SUPABASE_URL}/rest/v1/{view}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        resp.raise_for_status()
        return resp.json()



# ── Expense Matching: Konstanta ───────────────────────────────
POLL_INTERVAL = 30  # detik — polling expense baru dari financial_transactions
PROCESSED_CURSOR_FILE = "/tmp/yumi_purchasing_processed.txt"
MATCH_EXPENSE_CATEGORIES = {"belanja_stok", "pembelian_stok", "bahan_baku", "belanja_bahan", "bahan_makanan", "bahan_segar", "bahan_minuman", "packaging"}

def _load_processed_cursor() -> set:
    """Load source_id yang sudah diproses dari file."""
    try:
        with open(PROCESSED_CURSOR_FILE) as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        return set()

def _save_processed_cursor(processed: set):
    """Simpan source_id yang sudah diproses ke file."""
    with open(PROCESSED_CURSOR_FILE, "w") as f:
        for sid in sorted(processed):
            f.write(f"{sid}\n")

# ── Expense Name Normalizer ──────────────────────────────────────
_QTY_SUFFIX_RE_EXPENSE = re.compile(
    r'(\d+(?:\.\d+)?)\s*(ml|liter|lt|l|kg|gram|gr|g|pcs|pack|sachet|renceng|ikat|toros|bungkus|botol|gelas)\b',
    re.IGNORECASE,
)

_ABBR_MAP = {
    r'\bBTG\b': 'Batang', r'\bBBK\b': 'Bubuk',
    r'\bSOWATER\b': 'Soda Water', r'\bRJK\b': 'Rujak',
    r'\bPET\b': 'Pet', r'\bLMNS\b': 'Lemon',
    r'\bO/S\b': '', r'\bPOUCH\b': '', r'\bUHT\b': '',
}


def _normalize_expense_name(name: str) -> str:
    """Normalize expense item name: strip size suffix, decode abbreviations, clean up.
    
    Uses centralized alias system (item_normalization.expand_item_alias) 
    before falling back to local abbreviation map.
    """
    if not name:
        return ""
    
    # 0. Run centralized alias expansion first (DB-backed)
    alias_canon, _ = expand_item_alias(name)
    working_name = alias_canon or name
    
    # 1. Strip size/volume suffix (e.g., "1000ML", "946ML", "250GR")
    cleaned = _QTY_SUFFIX_RE_EXPENSE.sub("", working_name).strip()
    # 2. Decode abbreviations
    for pattern, replacement in _ABBR_MAP.items():
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    # 3. Strip trailing size numbers like "140", "20S", "250" at end
    cleaned = re.sub(r'\s*\d+[A-Z]?\s*$', '', cleaned).strip()
    # 4. Collapse multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


# ── Expense Matching Helper ─────────────────────────────────────
_EXPENSE_MATCH_SYSTEM_PROMPT = """Kamu adalah asisten inventory yang mencocokkan nama bahan dari transaksi expense ke database inventory YumiPOS.

ATURAN:
- Handle: typo, singkatan, nama tidak lengkap (Tepung Terigu Kompas → Tepung Terigu)
- Jika ada MULTIPLE match, pilih yang PALING COCOK berdasarkan:
  1. Nama persis (case-insensitive)
  2. Brand match (jika disebut)
  3. Kategori match
- Jika ragu, pilih yang quantity-nya lebih kecil (lebih urgent)
- JANGAN beri lebih dari 1 jawaban per input
- Jika TIDAK ADA yang cocok, jawab: TIDAK_COCOK
- Jawab persis sesuai format

Format:
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE(0-100)|UNIT

Contoh:
User: minyak goreng
Inventory: Minyak Goreng|id1|10 pcs, Minyak Sunco|id2|5 pcs
Jawab: minyak goreng -> Minyak Goreng|id1|95|pcs"""


async def _ai_match_expense_items(sp_client, items: list[dict], all_inv: list[dict]) -> list[dict]:
    """AI match expense items (from scanItems) ke inventory DB.
    
    Checks alias DB first, then AI for unmatched items.
    """
    # ── Step 1: Check alias DB for each item ──
    matched = []
    ai_items = []
    ai_item_indices = []
    
    for idx, it in enumerate(items):
        raw_name = it.get('name', '')
        
        # ── Step 1a: Check centralized DB alias cache (item_normalization) ──
        alias_canon, alias_raw = expand_item_alias(raw_name)
        if alias_canon and alias_canon != raw_name and all_inv:
            # Find matching inventory by canonical name
            inv_match = next(
                (inv for inv in all_inv
                 if inv.get("ingredientName", "").lower().strip() == alias_canon.lower().strip()),
                None
            )
            if inv_match:
                matched.append({
                    "input": raw_name,
                    "matched": True,
                    "inv_name": inv_match.get("ingredientName", alias_canon),
                    "_id": inv_match.get("_id", ""),
                    "score": 95,
                    "unit": inv_match.get("unit", ""),
                    "_alias": True,
                    "_alias_source": "db_cache",
                })
                continue  # Skip to next item
        
        # ── Step 1b: Check learning memory aliases ──
        normed = _normalize_expense_name(raw_name)
        
        # Search alias DB (fuzzy match on normalized name)
        alias_hits = search_learning_memory(normed, min_score=0.7)
        # Filter only expense_match type
        expense_aliases = [e for e in alias_hits if e.get("type") == "expense_match"]
        
        if expense_aliases:
            best = expense_aliases[0]
            matched.append({
                "input": raw_name,
                "matched": True,
                "inv_name": best.get("matchedIngredientName", ""),
                "_id": best.get("matchedInventoryId", ""),
                "score": int(best.get("confidence", 85)),
                "unit": None,
                "_alias": True,
            })
            # Increment usage count
            try:
                increment_usage(best["id"])
            except Exception:
                pass
        else:
            ai_items.append(it)
            ai_item_indices.append(idx)
            matched.append(None)
    
    # If all items matched via alias, return immediately
    if not ai_items:
        return [m for m in matched if m is not None]
    
    # ── Step 2: Build inventory list for AI prompt ──
    inv_lines = []
    for i in all_inv:
        name = i.get('ingredientName', '?')
        sid = i.get('_id', '?')
        qty = float(i.get('quantity') or 0)
        unit = i.get('unit', '')
        brand = i.get('defaultBrandName', '') or ''
        cat = i.get('category', '') or ''
        brand_s = f" [{brand}]" if brand else ""
        cat_s = f" ({cat})" if cat else ""
        inv_lines.append(f"{name}{brand_s}{cat_s}|{sid}|{qty:g}|{unit}")
    
    inv_text = "\n".join(inv_lines)
    if len(inv_text) > 8000:
        inv_text = "\n".join(inv_lines[:150])
    
    # Build user items text (only AI items)
    user_lines = []
    for it in ai_items:
        name = it.get('name', '')
        qty = it.get('quantity', 1)
        price = it.get('price', 0)
        user_lines.append(f"{name} (qty:{qty}, price:{price})")
    user_text = "\n".join(user_lines)
    
    prompt = f"""Cocokkan SETIAP item expense berikut ke database inventory.

Item expense (satu baris per item):
{user_text}

Daftar inventory (nama|id|qty|unit):
{inv_text}

Format jawaban (1 baris per item, urutan sesuai input):
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE|UNIT
Atau: TULISAN_USER -> TIDAK_COCOK"""
    
    # ── Step 3: Call AI ──
    try:
        result = await sp_client.chat(prompt, system_prompt=_EXPENSE_MATCH_SYSTEM_PROMPT, timeout=30)
        reply = result.get("reply", "") or result.get("text", "") or result.get("raw", "") or ""
        
        ai_results = []
        for line in reply.strip().split("\n"):
            line = line.strip()
            if not line or "->" not in line:
                continue
            parts = line.split("->", 1)
            input_name = parts[0].strip()
            response_part = parts[1].strip()
            
            if "TIDAK_COCOK" in response_part.upper():
                ai_results.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0, "unit": None, "_alias": False})
                continue
            
            resp_parts = response_part.split("|")
            if len(resp_parts) >= 2:
                inv_name = resp_parts[0].strip()
                inv_id = resp_parts[1].strip()
                score = int(resp_parts[2].strip()) if len(resp_parts) >= 3 and resp_parts[2].strip().isdigit() else 0
                unit = resp_parts[3].strip() if len(resp_parts) >= 4 else None
                ai_results.append({"input": input_name, "matched": True, "inv_name": inv_name, "_id": inv_id, "score": score, "unit": unit, "_alias": False})
            else:
                ai_results.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0, "unit": None, "_alias": False})
        
        # Merge AI results back into matched list at correct positions
        ai_idx = 0
        for i in range(len(matched)):
            if matched[i] is None:
                if ai_idx < len(ai_results):
                    matched[i] = ai_results[ai_idx]
                else:
                    matched[i] = {"input": items[i].get('name', ''), "matched": False, "inv_name": None, "_id": None, "score": 0, "unit": None, "_alias": False}
                ai_idx += 1
        
        return matched
    except Exception as e:
        logger.warning("[EXPENSE-MATCH] AI match failed: %s, falling back to rapidfuzz", e)
        return _fuzzy_match_expense_fallback(items, all_inv)


def _fuzzy_match_expense_fallback(items: list[dict], all_inv: list[dict]) -> list[dict]:
    """Multi-strategy fuzzy matching untuk expense items fallback."""
    inv_names = {i.get("ingredientName", ""): i for i in all_inv if i.get("ingredientName")}

    strategies = [
        ("partial", fuzz.partial_ratio),
        ("token_sort", fuzz.token_sort_ratio),
        ("token_set", fuzz.token_set_ratio),
        ("WRatio", fuzz.WRatio),
    ]

    results = []
    for item in items:
        name = _normalize_expense_name(item.get('name', ''))

        best_score = 0
        best_match = None
        for strategy_name, scorer in strategies:
            match = fuzz_process.extractOne(name, list(inv_names.keys()), scorer=scorer, score_cutoff=55)
            if match and match[1] > best_score:
                best_score = match[1]
                best_match = match

        if best_match and best_score >= 60:
            match_name = best_match[0]
            inv_item = inv_names[match_name]
            results.append({"input": item.get('name', ''), "matched": True, "inv_name": match_name,
                           "_id": inv_item.get("_id", ""), "score": best_score,
                           "unit": inv_item.get("unit", None)})
        else:
            results.append({"input": item.get('name', ''), "matched": False, "inv_name": None, "_id": None, "score": 0, "unit": None})
    return results


async def _get_supplier_price_history(inventory_id: str) -> list[dict]:
    """Fetch price history per supplier untuk item tertentu."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/pos_inventory_transactions"
                f"?select=costPerUnit,storeId,purchaseUnit,"
                f"purchaseQuantity,timestamp,brandName"
                f"&inventoryId=eq.{inventory_id}"
                f"&type=eq.restock"
                f"&order=timestamp.desc"
                f"&limit=30",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code < 400:
                return resp.json()
    except Exception as e:
        logger.warning("[PRICE-HISTORY] Failed: %s", e)
    return []


async def _get_supplier_recommendation(inventory_id: str, item_name: str) -> dict:
    """Recommend cheapest supplier based on price history."""
    txns = await _get_supplier_price_history(inventory_id)
    
    # Group by store
    store_prices = {}
    for tx in txns:
        store_id = tx.get("storeId") or ""
        cost = float(tx.get("costPerUnit") or 0)
        ts = float(tx.get("timestamp") or 0)
        brand = tx.get("brandName") or ""
        
        if store_id and cost > 0:
            if store_id not in store_prices:
                store_prices[store_id] = {"prices": [], "count": 0, "last_purchase": 0, "brands": set()}
            store_prices[store_id]["prices"].append(cost)
            store_prices[store_id]["count"] += 1
            store_prices[store_id]["last_purchase"] = max(store_prices[store_id]["last_purchase"], ts)
            if brand:
                store_prices[store_id]["brands"].add(brand)
    
    if not store_prices:
        # Try inventory table's preferred_store_source_id
        return {"item_name": item_name, "recommendations": [], "total_purchases": 0}
    
    recommendations = []
    for store_id, data in store_prices.items():
        avg_price = sum(data["prices"]) / len(data["prices"])
        recommendations.append({
            "store_id": store_id,
            "avg_price": round(avg_price),
            "purchase_count": data["count"],
            "last_purchase_ts": data["last_purchase"],
            "brands": list(data["brands"]),
        })
    
    recommendations.sort(key=lambda r: (r["avg_price"], -r["purchase_count"]))
    
    # Get store names
    store_ids = [r["store_id"] for r in recommendations]
    store_names = {}
    try:
        ids_filter = ",".join([f'"{s}"' for s in store_ids[:20]])
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/pos_inventory_stores"
                f"?select=_id,name,phone"
                f"&_id=in.({ids_filter})",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code < 400:
                for s in resp.json():
                    store_names[s["_id"]] = s
    except Exception:
        pass
    
    for rec in recommendations:
        store = store_names.get(rec["store_id"], {})
        rec["store_name"] = store.get("name", "Unknown")
        rec["phone"] = store.get("phone", "")
    
    return {
        "item_name": item_name,
        "recommendations": recommendations,
        "total_purchases": len(txns),
    }


async def _match_expense_items(source_id: str, items: list[dict]) -> dict:
    """Match expense items ke inventory + supplier recommendation.
    
    Saves successful AI matches to learning_memory for future use.
    """
    all_inv = await inventory.get_all_inventory()
    
    sp_client = SumoPodClient(SUMOPOD_API_KEY)
    matches = await _ai_match_expense_items(sp_client, items, all_inv)
    
    matched_items = []
    unmatched_items = []
    for m in matches:
        if m["matched"] and m["_id"]:
            # Save to learning_memory if this was an AI match (not alias)
            if not m.get("_alias") and m["score"] >= 70:
                try:
                    normed = _normalize_expense_name(m["input"])
                    save_learning_entry(
                        user_input=normed,
                        parsed_name=m["input"],
                        matched_inventory_id=m["_id"],
                        matched_ingredient_name=m["inv_name"],
                        confidence=float(m["score"]),
                        entry_type="expense_match",
                    )
                except Exception as e:
                    logger.warning("[EXPENSE-MATCH] Failed to save learning entry: %s", e)
            
            # Get supplier recommendation
            rec = await _get_supplier_recommendation(m["_id"], m["inv_name"])
            matched_items.append({
                "input": m["input"],
                "inv_name": m["inv_name"],
                "inv_id": m["_id"],
                "score": m["score"],
                "supplier": rec,
            })
        else:
            unmatched_items.append({"input": m["input"]})
    
    return {
        "source_id": source_id,
        "has_match": len(matched_items) > 0,
        "matched": matched_items,
        "unmatched": unmatched_items,
        "total_items": len(items),
        "matched_count": len(matched_items),
    }

async def _send_purchasing_recommendation(source_id: str, result: dict, transaction: dict, chat_id: int = None):
    """Send formatted purchasing recommendation to stock group."""
    import uuid
    from datetime import datetime, timezone, timedelta
    
    _WIB = timezone(timedelta(hours=7))
    now = datetime.now(_WIB)
    
    lines = [f"\U0001f4e6 Expense Match — {now:%d/%m %H:%M}"]
    lines.append("\u2500" * 28)
    
    # Transaction info
    merchant = transaction.get("merchant", "") or ""
    amount = float(transaction.get("amount") or 0)
    category = transaction.get("category", "") or ""
    tx_date = float(transaction.get("date") or 0)
    dt = datetime.fromtimestamp(tx_date / 1000, tz=_WIB) if tx_date > 0 else now
    lines.append(f"\U0001f9fe {source_id[-8:]}")
    if merchant:
        lines.append(f"\U0001f3ea {merchant}")
    lines.append(f"\U0001f4b0 Rp{amount:,.0f} — {category}")
    lines.append(f"\U0001f4c5 {dt:%d/%m %H:%M}")
    lines.append("")
    
    # Matched items
    if result["matched"]:
        lines.append(f"\u2705 Cocok: {result['matched_count']}/{result['total_items']} item")
        lines.append("")
        for m in result["matched"]:
            score = m["score"]
            score_icon = "\U0001f7e2" if score >= 85 else "\U0001f7e1" if score >= 70 else "\U0001f534"
            lines.append(f"  {score_icon} {m['input']} \u2192 {m['inv_name']} ({score}%)")
            # Supplier recommendation
            rec = m.get("supplier", {})
            recoms = rec.get("recommendations", [])
            if recoms:
                cheapest = recoms[0]
                cheapest_name = cheapest.get("store_name", "Unknown")
                cheapest_price = cheapest.get("avg_price", 0)
                lines.append(f"    \U0001f3ea Termurah: {cheapest_name} @ Rp{cheapest_price:,}")
                if cheapest.get("phone"):
                    lines.append(f"    \U0001f4de {cheapest['phone']}")
                if len(recoms) > 1:
                    others = recoms[1:4]
                    for o in others:
                        diff = cheapest_price - o["avg_price"]
                        diff_str = f" (Rp{abs(diff):,} lebih murah)" if diff > 0 else ""
                        lines.append(f"    \U0001f447 Alternatif: {o['store_name']} @ Rp{o['avg_price']:,}{diff_str}")
        lines.append("")
    
    if result["unmatched"]:
        lines.append(f"\u2753 Tidak cocok: {len(result['unmatched'])} item")
        for u in result["unmatched"]:
            lines.append(f"  \u2753 {u['input']}")
        lines.append("")
    
    lines.append("\U0001f516 /match-expense " + source_id)
    
    target = chat_id or STOCK_GROUP_ID
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": target, "text": "\n".join(lines)},
            )
            logger.info("[EXPENSE-MATCH] Sent recommendation for %s to %s", source_id, target)
    except Exception as e:
        logger.warning("[EXPENSE-MATCH] Failed to send: %s", e)


async def _poll_new_expenses(app):
    """Background task: poll financial_transactions untuk expense baru."""
    processed = _load_processed_cursor()
    logger.info("[POLL] Expense polling started with %d processed IDs", len(processed))
    
    while True:
        try:
            seven_days_ago = int((datetime.now() - timedelta(days=7)).timestamp() * 1000)
            url = (
                f"{SUPABASE_URL}/rest/v1/pos_financial_transactions"
                f"?select=_id,amount,category,merchant,metadata,date"
                f"&type=eq.expense"
                f"&date=gte.{seven_days_ago}"
                f"&order=date.desc"
                f"&limit=50"
            )
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(
                    url,
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                )
                if resp.status_code >= 400:
                    logger.warning("[POLL] HTTP %d: %s", resp.status_code, resp.text[:200])
                    await asyncio.sleep(POLL_INTERVAL)
                    continue
                rows = resp.json()
            
            new_count = 0
            for tx in rows:
                sid = tx.get("_id", "")
                if sid in processed:
                    continue
                
                metadata = tx.get("metadata") or {}
                items = metadata.get("scanItems") or []
                if not items:
                    processed.add(sid)
                    continue
                
                # Filter category
                category = (tx.get("category") or "").strip().lower().replace(" ", "_")
                if category and category not in MATCH_EXPENSE_CATEGORIES:
                    processed.add(sid)
                    continue
                
                logger.info("[POLL] New expense detected: %s (category: %s, items: %d)",
                           sid, category, len(items))
                
                match_result = await _match_expense_items(sid, items)
                if match_result.get("has_match"):
                    await _send_purchasing_recommendation(sid, match_result, tx)
                
                processed.add(sid)
                new_count += 1
            
            if new_count > 0:
                _save_processed_cursor(processed)
                logger.info("[POLL] Processed %d new expenses", new_count)
        
        except Exception as e:
            logger.error("[POLL] Error: %s", e, exc_info=True)
        
        await asyncio.sleep(POLL_INTERVAL)

# ── Finance Integration ─────────────────────────────────────────
async def _get_finance_summary() -> dict | None:
    """Get finance summary for cross-referencing with inventory suggestions."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/financial_transactions?select=amount,tx_type&order=date.desc&limit=200",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            resp.raise_for_status()
            rows = resp.json()
        income = sum(float(r["amount"]) for r in rows if r.get("type") == "income")
        expense = sum(float(r["amount"]) for r in rows if r.get("type") == "expense")
        return {"income": income, "expense": expense, "balance": income - expense}
    except Exception:
        return None

# ── Commands ────────────────────────────────────────────────────

async def cmd_start(update: Update, _context):
    await update.message.reply_text(
        "🛒 *Yumi Purchasing* — AI Inventory Assistant\n\n"
        "Aku bantu urusan inventory & belanja:\n"
        "• 🛒 Marketlist otomatis + AI tag supplier\n"
        "• 📦 Cek stok & restok\n"
        "• 📞 Cari supplier\n"
        "• 💬 Tanya bebas (aku bisa reasoning!)\n\n"
        "Coba ketik bebas atau klik tombol 👇",
        reply_markup=_keyboard(),
        parse_mode="Markdown",
    )



async def cmd_match_expense(update: Update, context):
    """Handle /match-expense command — manual match expense ke inventory."""
    args = context.args
    source_id = args[0] if args else ""
    
    if not source_id:
        await update.message.reply_text(
            "Format: /match-expense <source_id>\n\n"
            "Contoh: /match-expense fin_abc123\n"
            "Cari source_id dari expense yang sudah masuk.",
        )
        return
    
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/pos_financial_transactions"
                f"?select=*"
                f"&_id=eq.{source_id}",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code >= 400:
                await update.message.reply_text(f"\u274c Gagal query: HTTP {resp.status_code}")
                return
            rows = resp.json()
        
        if not rows:
            await update.message.reply_text(f"\u274c Transaksi {source_id} tidak ditemukan.")
            return
        
        tx = rows[0]
        if tx.get("type") != "expense":
            await update.message.reply_text(f"\u2139\ufe0f {source_id} bukan transaksi expense (type: {tx.get('type')}).")
            return
        
        metadata = tx.get("metadata") or {}
        items = metadata.get("scanItems") or []
        if not items:
            await update.message.reply_text(f"\u2139\ufe0f Transaksi tidak memiliki scanItems.")
            return
        
        match_result = await _match_expense_items(source_id, items)
        await _send_purchasing_recommendation(source_id, match_result, tx)
        
        # Save to processed
        processed = _load_processed_cursor()
        processed.add(source_id)
        _save_processed_cursor(processed)
        
    except Exception as e:
        logger.error("[MATCH-EXPENSE] Error: %s", e)
        await update.message.reply_text(f"\u274c Error: {e}")


async def cmd_supplier(update: Update, context):
    """Handle /supplier command."""
    args = context.args
    query = " ".join(args) if args else ""

    if not query:
        cats = await supplier.get_categories()
        cats_text = ", ".join(cats) if cats else "(belum ada)"
        await update.message.reply_text(
            f"📞 *Supplier Directory*\n\n"
            f"Kategori: {cats_text}\n\n"
            f"Pakai: `/supplier <nama/kategori>`\n"
            f"Contoh: `/supplier kopi`",
            parse_mode="Markdown",
        )
        return

    results = await supplier.search(query)
    if not results:
        await update.message.reply_text(
            f"🔍 Ga ada supplier \"{query}\".", reply_markup=_keyboard())
        return

    lines = [f"📋 *Supplier: {query}* ({len(results)}):\n"]
    for s in results[:10]:
        grade = s.get("grade", "")
        grade_str = f" ⭐{grade}" if grade else ""
        lines.append(f"*{s['name']}*{grade_str}")
        if s.get("category"):
            lines.append(f"  🏷️ {s['category']}")
        if s.get("phone"):
            lines.append(f"  📞 {s['phone']}")
        if s.get("address"):
            lines.append(f"  📍 {s['address']}")
        if s.get("notes"):
            lines.append(f"  📦 {s['notes']}")
        lines.append("")

    await update.message.reply_text(
        "\n".join(lines), parse_mode="Markdown", reply_markup=_keyboard())


# ── Hermes diagnostic commands ──────────────────────────────────


def _telegram_context_from_update(update: Update) -> TelegramContext:
    user = update.effective_user
    chat = update.effective_chat
    msg = update.effective_message
    return TelegramContext(
        chat_id=str(chat.id) if chat else "unknown",
        user_id=str(user.id) if user else "unknown",
        username=user.username if user else None,
        message_id=msg.message_id if msg else None,
    )


async def cmd_hermes_scope(update: Update, context: ContextTypes.DEFAULT_TYPE):
    scope = project_scope_summary()
    await update.message.reply_text(
        "Hermes Purchasing scope\n"
        f"Profile: purchasing\n"
        f"Project: {scope['project_root']}\n"
        f"Mode: {scope['mode']}\n"
        "Batas: read-only diagnostic; tidak execute purchase/order/write action.",
        reply_markup=_keyboard(),
    )


async def cmd_hermes_test(update: Update, context: ContextTypes.DEFAULT_TYPE):
    request = build_request(
        profile_id="purchasing",
        message="purchasing adapter diagnostic",
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {"reply_text": "Hermes purchasing adapter OK", "actions": [], "metadata": {"profile_id": "purchasing"}}
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "purchasing",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /hermes_test",
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_keyboard())


async def cmd_koreksi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /koreksi command — correct a previous expense match.

    Format: /koreksi NAMA_STRUK -> NAMA_INVENTORY
    Contoh: /koreksi ROSE BRAND POUCH 2L -> Kresek Piala Uk 28 Putih
    """
    args = context.args
    text = " ".join(args).strip()

    if not text or "->" not in text:
        await update.message.reply_text(
            "Format: /koreksi <nama_dari_struk> -> <nama_inventory>\n\n"
            "Contoh: /koreksi ROSE BRAND POUCH 2L -> Kresek Piala Uk 28 Putih\n\n"
            "Ini akan menyimpan koreksi ke learning memory biar match otomatis next time."
        )
        return

    parts = text.split("->", 1)
    scan_name = parts[0].strip()
    corrected_name = parts[1].strip()

    if not scan_name or not corrected_name:
        await update.message.reply_text("Nama struk dan nama inventory harus diisi!")
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")

    try:
        # Search inventory by the corrected name
        all_inv = await inventory.get_all_inventory()
        inv_names = {i.get("ingredientName", ""): i for i in all_inv if i.get("ingredientName")}

        # Find best match for the corrected name
        from rapidfuzz import process as fp, fuzz as fz
        best = fp.extractOne(corrected_name, list(inv_names.keys()), scorer=fz.WRatio, score_cutoff=60)

        if not best:
            await update.message.reply_text(
                f"\u274c Inventory '{corrected_name}' tidak ditemukan.\n"
                f"Coba cek nama inventory yang tersedia dengan /supplier atau cek langsung di database."
            )
            return

        match_name, score = best[0], best[1]
        inv_item = inv_names[match_name]
        inv_id = inv_item.get("_id", "")

        # Normalize the scan name for alias lookup
        normed = _normalize_expense_name(scan_name)

        # Check if alias already exists
        existing = search_learning_memory(normed, min_score=0.85)
        expense_existing = [e for e in existing if e.get("type") == "expense_match"]

        if expense_existing:
            # Update existing entry
            entry = expense_existing[0]
            update_learning_entry(entry["id"], {
                "matchedInventoryId": inv_id,
                "matchedIngredientName": match_name,
                "isCorrected": True,
                "correctionType": "user",
            })
            msg = f"\u2705 Koreksi tersimpan! Alias diperbarui:\n"
        else:
            # Save new alias
            save_learning_entry(
                user_input=normed,
                parsed_name=scan_name,
                matched_inventory_id=inv_id,
                matched_ingredient_name=match_name,
                confidence=float(score),
                entry_type="expense_match",
            )
            msg = f"\u2705 Koreksi tersimpan! Alias baru:\n"

        msg += (
            f"  \uD83D\uDCCB \"{scan_name}\" \u2192 \"{match_name}\" ({score}%)\n"
            f"  \uD83D\uDCBE ID: {inv_id}\n\n"
            f"Next time item yang sama akan langsung match tanpa AI."
        )
        await update.message.reply_text(msg)

    except Exception as e:
        logger.error("[KOREKSI] Error: %s", e, exc_info=True)
        await update.message.reply_text(f"\u274c Gagal menyimpan koreksi: {e}")


async def cmd_yumi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = " ".join(context.args).strip()
    if not text:
        await update.message.reply_text("Pakai format: /yumi pertanyaan purchasing kamu", reply_markup=_keyboard())
        return
    request = build_request(
        profile_id="purchasing",
        message=text,
        telegram=_telegram_context_from_update(update),
        can_write=False,
    )
    response = {
        "reply_text": "Hermes purchasing read-only menerima request. Draft/action belanja belum dieksekusi; gunakan flow purchasing existing untuk action.",
        "actions": [],
        "metadata": {"profile_id": "purchasing"},
    }
    validate_response(response)
    audit_event({
        "event": "telegram_command",
        "profile_id": "purchasing",
        "mode": "read_only",
        "telegram": request["telegram"],
        "message": "telegram command /yumi",
        "input_preview": text[:160],
        "actions": [],
    })
    await update.message.reply_text(response["reply_text"], reply_markup=_keyboard())


# ── Message Handler ─────────────────────────────────────────────

def _can_respond(update: Update) -> bool:
    """Cek apakah bot boleh merespon — DM owner, grup marketlist, atau grup dengan @mention."""
    user = update.effective_user
    chat = update.effective_chat
    if not user or not chat:
        return False
    # DM owner
    if chat.type == "private":
        return user.id == 323151437
    # Marketlist group — auto-respond to all messages
    MARKETLIST_GROUP_ID = int(os.getenv("MARKETLIST_GROUP_ID", "0"))
    if MARKETLIST_GROUP_ID and chat.id == MARKETLIST_GROUP_ID:
        return True
    # Reply to bot or @mention
    msg = update.effective_message
    if not msg:
        return False
    if msg.reply_to_message and msg.reply_to_message.from_user and msg.reply_to_message.from_user.is_bot:
        return True
    message_text = msg.text or msg.caption or ""
    if "@YumiPurchasingBot".lower() in message_text.lower():
        return True
    return False


async def _parse_stock_reaction(text: str) -> dict | None:
    """Parse 🔴 or 🟡 reaction from user message.
    Returns {"items": [{"name": str, "type": "🔴"|"🟡"}, ...]} or None."""
    text = text.strip()
    if "🔴" not in text and "🟡" not in text:
        return None
    
    # Split by newline or comma first
    lines = re.split(r'[,\n\r]+', text)
    
    items = []
    _HEADER_KW = ["market list", "belanja list", "marketlist"]
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Remove bullet markers
        line = re.sub(r'^[•\-\*]+\s*', '', line).strip()
        
        # Determine type from symbol
        if "🔴" in line:
            item_type = "🔴"
        elif "🟡" in line:
            item_type = "🟡"
        else:
            continue  # line without symbol is skipped (header etc)
        
        name = line.replace("🔴", "").replace("🟡", "").strip()
        if not name:
            continue
        
        # Filter header lines
        if any(kw in name.lower() for kw in _HEADER_KW):
            continue
        
        items.append({"name": name, "type": item_type})
    
    if not items:
        return None
    
    return {"items": items}

async def handle_message(update: Update, context):
    if not _can_respond(update):
        return
    msg = update.effective_message
    if not msg or not msg.text:
        return
    text = msg.text.strip()
    if not text:
        await msg.reply_text("Ketik perintah atau tanya bebas.", reply_markup=_keyboard())
        return

    # ── Check for 🔴/🟡 stock reaction ──
    reaction = await _parse_stock_reaction(text)
    if reaction:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        await _handle_stock_reaction(update, context, reaction)
        return

    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    result = await orchestrator.orchestrate(text)

    await _execute_action(msg, result, is_callback=False)

async def _handle_marketlist_input(update: Update, context, text: str):
    """Handle user posting a marketlist text — parse, match, group, format, send with keyboard."""
    import uuid
    from datetime import datetime, timezone, timedelta

    try:
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        result = await process_input_marketlist(text, sp_client, inventory, supplier)

        if not result.get("success"):
            await update.message.reply_text(result.get("formatted_text", "❌ Gagal memproses marketlist."))
            return

        # Generate a unique entry_id for this session
        entry_id = result.get("entry_id") or str(uuid.uuid4())
        session_key = f"marketlist_{entry_id}"

        # Store session data
        unmatched_names = [
            e.get("input_name", e.get("name", "?"))
            for e in result.get("enriched", []) if not e.get("matched")
        ]
        user_id = str(update.effective_user.id) if update.effective_user else ""
        marketlist_sessions[session_key] = {
            "groups": result.get("groups", []),
            "grand_total": result.get("grand_total", 0),
            "items_count": result.get("items_count", 0),
            "entry_id": entry_id,
            "original_text": text,
            "unmatched_names": unmatched_names,
            "user_id": user_id,
            "timestamp": datetime.now(timezone(timedelta(hours=7))).isoformat(),
        }

        formatted = result.get("formatted_text", "")
        items_count = result.get("items_count", 0)
        keyboard = build_marketlist_keyboard(entry_id, items_count)

        await update.message.reply_text(
            formatted,
            reply_markup=keyboard,
            parse_mode="Markdown",
        )

        logger.info(
            "Marketlist processed: %d items, entry=%s",
            items_count, entry_id,
        )
    except Exception as e:
        logger.exception("Marketlist input processing failed")
        await update.message.reply_text(f"❌ Gagal memproses marketlist: {e}")

# ── Callback Handler ────────────────────────────────────────────

async def handle_callback(update: Update, context):
    query = update.callback_query
    await query.answer()
    data = query.data

    # Route marketlist callbacks (ml_ prefix) to callback_manager
    if data.startswith("ml_"):
        sp_client = SumoPodClient(SUMOPOD_API_KEY)
        await handle_marketlist_callback(
            update, context, marketlist_sessions,
            format_merchant_marketlist,
            recalculate_with_qty,
            remove_item_and_reformat,
            process_input_marketlist,
            sp_client, inventory, supplier,
        )
        return

    # Route undo callbacks
    if data.startswith("undo_"):
        ts_str = data.replace("undo_", "")
        await _handle_undo_callback(update, context, ts_str)
        return

    if data == "ai_chat":
        await query.edit_message_text(
            "💬 *AI Chat Mode*\n\n"
            "Tanya apa aja soal inventory! Contoh:\n"
            "• \"Supplier daging paling murah?\"\n"
            "• \"Apa yang harus direstok?\"\n"
            "• \"Kenapa kopi belanja terus?\"\n"
            "• \"Analisis marketlist minggu ini\"\n\n"
            "Ketik bebas aja, aku ngerti kok 😊",
            parse_mode="Markdown",
            reply_markup=_keyboard(),
        )
        return

    if data == "help":
        await query.edit_message_text(
            orchestrator._help_text(),
            parse_mode="Markdown",
            reply_markup=_keyboard(),
        )
        return

    # Map callback to text
    action_map = {
        "marketlist": "marketlist",
        "low_stock": "stok menipis",
        "supplier": "supplier",
        "all_stock": "semua stok",
    }
    text = action_map.get(data)
    if text:
        result = await orchestrator.orchestrate(text)
        await _execute_action(query, result, is_callback=True)
    else:
        await query.edit_message_text("❌ Aksi tidak dikenal.", reply_markup=_keyboard())

# ── Action Executor ─────────────────────────────────────────────

async def _execute_action(target, result: PurchasingResult, is_callback: bool = False):
    """Execute action dari orchestrator result."""
    send = target.edit_message_text if is_callback else target.reply_text
    reply = lambda msg, **kw: send(msg, reply_markup=_keyboard(), **kw)

    try:
        if result.action == "marketlist":
            sp_client = SumoPodClient(SUMOPOD_API_KEY)
            ml_text = await generate_marketlist(_fetch_fn, supplier, sp_client)
            await reply(ml_text)

        elif result.action == "low_stock":
            all_items = await inventory.get_all_inventory()
            low_items = []
            for r in all_items:
                qty = float(r.get("quantity") or 0)
                thresh = float(r.get("lowStockThreshold") or 0)
                name = r.get("ingredientName", "?")
                unit = (r.get("unit") or "").strip()
                if qty <= thresh and thresh > 0:
                    unit_s = f" {unit}" if unit else ""
                    low_items.append(f"• {name}: {qty:g}{unit_s} (min: {thresh:g}{unit_s})")

            if low_items:
                msg = "⚠️ *Stok Menipis:*\n\n" + "\n".join(low_items[:20])
            else:
                msg = "✅ Semua stok aman!"
            await reply(msg)

        elif result.action == "check_stock":
            if result.item:
                stock_text = await inventory.check_stock(result.item)
            else:
                all_items = await inventory.get_all_inventory()
                if not all_items:
                    stock_text = "📦 Inventory kosong."
                else:
                    lines = ["📦 *Semua Stok:*\n"]
                    for r in all_items[:30]:
                        name = r.get("ingredientName", "?")
                        qty = float(r.get("quantity") or 0)
                        thresh = float(r.get("lowStockThreshold") or 0)
                        unit = (r.get("unit") or "").strip()
                        unit_s = f" {unit}" if unit else ""
                        thresh_s = f" (min: {thresh:g}{unit_s})" if thresh > 0 else ""
                        lines.append(f"• {name}: {qty:g}{unit_s}{thresh_s}")
                    stock_text = "\n".join(lines)
            await reply(stock_text)

        elif result.action == "restock":
            await _handle_restock(target, result, is_callback)

        elif result.action == "supplier_search":
            if result.supplier_query:
                results = await supplier.search(result.supplier_query)
            elif result.item:
                results = await supplier.search(result.item)
            else:
                cats = await supplier.get_categories()
                cats_text = ", ".join(cats) if cats else "(belum ada)"
                await reply(f"📞 Kategori: {cats_text}\n\nPakai `/supplier <nama>`.")
                return

            if not results:
                await reply(f"🔍 Ga ada supplier \"{result.supplier_query or result.item}\".")
            else:
                lines = [f"📋 *Supplier* ({len(results)}):\n"]
                for s in results[:8]:
                    grade_str = f" ⭐{s['grade']}" if s.get("grade") else ""
                    phone_str = f" 📞{s['phone']}" if s.get("phone") else ""
                    lines.append(f"*{s['name']}*{grade_str} | {s['category']}{phone_str}")
                await reply("\n".join(lines))

        elif result.action == "chat" or result.action == "analyze":
            # AI response — enrich with finance context if relevant
            reply_text = result.text or "Maaf, aku lagi mikir nih 😅 Coba lagi ya."
            # Add budget context for analyze
            if result.action == "analyze":
                fin = await _get_finance_summary()
                if fin:
                    ctx = (f"\n\n💡 *Info Keuangan:*\n"
                           f"💰 Pemasukan: Rp{fin['income']:,.0f}\n"
                           f"💸 Pengeluaran: Rp{fin['expense']:,.0f}\n"
                           f"📊 Saldo: Rp{fin['balance']:,.0f}")
                    reply_text += ctx
            await reply(reply_text)

        elif result.action == "unknown":
            await reply(
                "🤔 Aku belum yakin maksudnya. Coba:\n"
                "• `marketlist` — daftar belanja\n"
                "• `stok menipis` — cek stok\n"
                "• `restok <nama> <qty> <unit> <harga>`\n"
                "• `/supplier <kategori>`\n"
                "• Atau tanya bebas!"
            )
        else:
            await reply(result.text or "✅ Siap!")

    except Exception as e:
        logger.exception("Action execution failed")
        err_msg = f"❌ Error: {e}"
        try:
            await reply(err_msg)
        except Exception:
            pass

async def _handle_restock(target, result: PurchasingResult, is_callback: bool):
    """Handle restock action."""
    send = target.edit_message_text if is_callback else target.reply_text
    reply = lambda msg, **kw: send(msg, reply_markup=_keyboard(), **kw)

    if not result.item or result.qty <= 0:
        await reply("Format: `restok <nama> <qty> <unit> <harga>`\nContoh: `restok gula 2 kg 25000`")
        return

    # Cari item di inventory
    matched, score = await inventory.fuzzy_match_item(result.item)
    if matched and score >= 60:
        inv_id = matched["_id"]
        inv_qty = float(matched.get("quantity", 0))
        inv_name = matched["ingredientName"]
        await inventory.restock_item(inv_id, inv_qty, result.qty, result.unit, price=result.price)
        total_cost = result.price * result.qty
        if total_cost > 0:
            await inventory.log_purchase(inv_name, result.qty, result.unit, total_cost)
        await reply(
            f"✅ *Restok Berhasil*\n"
            f"   {inv_name} +{result.qty:.0f} {result.unit}\n"
            + (f"   Biaya: Rp{int(total_cost):,}" if total_cost > 0 else ""))

        # ── Auto-notify stock group ─────────────────────
        asyncio.ensure_future(_notify_stock_update())
    elif matched and score >= 45:
        await reply(f"🤔 Maksudnya *{matched['ingredientName']}*? ({score}% match)\n"
                    f"Kalau iya, ketik: `restok {matched['ingredientName']} {result.qty} {result.unit} {result.price}`")
    else:
        await reply(f"🆕 *{result.item}* belum ada di database. Tambah dulu via POS atau ketik lebih spesifik.")


# ── Auto-notify stock group ──────────────────────────────────────

STOCK_NOTIFY_LOCK = asyncio.Lock()

async def _notify_stock_update():
    """Kirim Stock Opname bahan baku per merchant ke grup stock."""
    async with STOCK_NOTIFY_LOCK:
        try:
            all_inv = await inventory.get_all_inventory()

            # Ambil data merchant
            store_url = f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=_id,name,phone&isActive=eq.true"
            async with httpx.AsyncClient(timeout=20) as client:
                store_resp = await client.get(store_url, headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                })
                stores_raw = store_resp.json() if store_resp.status_code < 400 else []
            store_map = {s["_id"]: s for s in stores_raw}
            UNKNOWN = {"name": "Lainnya", "phone": ""}

            def fmt_sisa(qty, unit):
                u = unit.lower().strip()
                if qty <= 0:
                    return "HABIS"
                if u in ("gram", "g"):
                    return f"sisa {qty:.0f} gram" if qty < 1000 else f"sisa {qty/1000:.1f} kg"
                elif u in ("ml", "milliliter"):
                    return f"sisa {qty:.0f} ml" if qty < 1000 else f"sisa {qty/1000:.1f} L"
                elif u in ("liter", "l"):
                    return f"sisa {qty:.1f} L"
                elif u in ("kg",):
                    return f"sisa {qty:.1f} kg"
                else:
                    return f"sisa {qty:.0f} {unit}"

            urgent_by_store = {}
            menipis_by_store = {}

            for item in all_inv:
                name = item.get("ingredientName", "")
                
                # Skip non-kitchen items
                name_lower = name.lower()
                skip_kw = ["gas", "baterai", "kresek", "sedotan", "sendok garpu",
                           "botol 1", "ekonomi", "soklin", "lifebuoy", "cling", "bento tupai",
                           "paperbowl", "cup 12", "multi tisu", "tutup cup"]
                if any(kw in name_lower for kw in skip_kw):
                    continue
                
                qty = float(item.get("quantity") or 0)
                th = float(item.get("lowStockThreshold") or 0)
                unit = (item.get("unit") or "").strip()
                store_id = (item.get("preferredStoreId") or "") or ""

                if th <= 0 or qty > th:
                    continue

                sisa = fmt_sisa(qty, unit)
                st = store_map.get(store_id, UNKNOWN)
                sname = st["name"]
                phone = st.get("phone", "") or ""
                entry = {"name": name, "sisa": sisa}

                if qty <= 0 or qty <= th * 0.3:
                    if sname not in urgent_by_store:
                        urgent_by_store[sname] = {"phone": phone, "items": []}
                    urgent_by_store[sname]["items"].append(entry)
                    if phone:
                        urgent_by_store[sname]["phone"] = phone
                else:
                    if sname not in menipis_by_store:
                        menipis_by_store[sname] = {"phone": phone, "items": []}
                    menipis_by_store[sname]["items"].append(entry)
                    if phone:
                        menipis_by_store[sname]["phone"] = phone

            for grp in (urgent_by_store, menipis_by_store):
                for sn in grp:
                    grp[sn]["items"].sort(key=lambda x: x["name"].lower())

            urgent_order = sorted(urgent_by_store, key=lambda sn: (-len(urgent_by_store[sn]["items"]), sn))
            menipis_order = sorted(menipis_by_store, key=lambda sn: (-len(menipis_by_store[sn]["items"]), sn))

            total_urgent = sum(len(urgent_by_store[s]["items"]) for s in urgent_by_store)
            total_menipis = sum(len(menipis_by_store[s]["items"]) for s in menipis_by_store)

            lines = ["📋 STOCK OPNAME"]
            lines.append(f"🔴 Urgent: {total_urgent} item  |  🟡 Menipis: {total_menipis} item")
            lines.append("")

            if urgent_by_store:
                lines.append("━━━ 🔴 URGENT ━━━")
                lines.append("")
                for idx, sname in enumerate(urgent_order, 1):
                    grp = urgent_by_store[sname]
                    phone = grp["phone"]
                    h = f"{idx}. {sname}"
                    if phone:
                        h += f"  ☎️ {phone}"
                    lines.append(h)
                    for item in grp["items"]:
                        lines.append(f"🔴 {item['name']} — {item['sisa']}")
                    lines.append("")
                lines.append("")

            if menipis_by_store:
                lines.append("━━━ 🟡 MENIPIS ━━━")
                lines.append("")
                for idx, sname in enumerate(menipis_order, 1):
                    grp = menipis_by_store[sname]
                    phone = grp["phone"]
                    h = f"{idx}. {sname}"
                    if phone:
                        h += f"  ☎️ {phone}"
                    lines.append(h)
                    for item in grp["items"]:
                        lines.append(f"🟡 {item['name']} — {item['sisa']}")
                    lines.append("")

            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={"chat_id": STOCK_GROUP_ID, "text": "\n".join(lines)},
                )
        except Exception as e:
            logger.warning("Stock auto-notify failed: %s", e)






# ── Stock Reaction: AI Match ─────────────────────────────────────

_MATCH_SYSTEM_PROMPT = """Kamu adalah asisten inventory yang mencocokkan nama bahan dari user ke database inventory.

ATURAN:
- Handle typo, singkatan, nama tidak lengkap, case, spasi berlebih
- "minyak" bisa berarti Minyak Goreng, Minyak Sunco, Minyak Rizki, dll
- Jika ada MULTIPLE match, pilih yang PALING UMUM
- Jika ragu, pilih yang quantity-nya lebih kecil (lebih urgent)
- JANGAN beri lebih dari 1 jawaban per input
- Jika TIDAK ADA yang cocok, jawab: TIDAK_COCOK
- Jawab persis sesuai format, 1 baris per item user

Format jawaban untuk SETIAP item user (1 baris):
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE(0-100)

Contoh:
User: minyak goreng
Inventory: Minyak Goreng|id1|600ml, Minyak Sunco|id2|600ml
Jawab: minyak goreng -> Minyak Goreng|id1|95"""

async def _ai_match_inventory(sp_client: SumoPodClient, items: list[str], all_inv: list[dict]) -> list[dict]:
    """AI-match setiap item user ke inventory. Returns [{input, matched: bool, inv_name, _id, score}]."""
    # Build inventory list for prompt (limit to prevent token overflow)
    inv_lines = [f"{i.get('ingredientName','?')}|{i.get('_id','?')}|{i.get('quantity',0):g} {i.get('unit','')}"
                 for i in all_inv if _is_kitchen(i.get('ingredientName', ''))]
    inv_text = "\n".join(inv_lines)
    
    if len(inv_text) > 8000:
        inv_text = "\n".join(inv_lines[:200])
    
    user_items = "\n".join(items)
    prompt = f"""Cocokkan SETIAP nama bahan berikut ke database inventory.

Item dari user (satu baris per item):
{user_items}

Daftar inventory (nama|id|qty):
{inv_text}

Format jawaban (1 baris per item, urutan sesuai input):
TULISAN_USER -> NAMA_INVENTORY|_ID|CONFIDENCE
Atau: TULISAN_USER -> TIDAK_COCOK"""

    try:
        result = await sp_client.chat(prompt, system_prompt=_MATCH_SYSTEM_PROMPT, timeout=30)
        reply = result.get("reply", "") or result.get("text", "") or result.get("raw", "") or ""
        
        matched = []
        for line in reply.strip().split("\n"):
            line = line.strip()
            if not line or "->" not in line:
                continue
            parts = line.split("->", 1)
            input_name = parts[0].strip()
            response_part = parts[1].strip()
            
            if response_part == "TIDAK_COCOK" or "TIDAK_COCOK" in response_part:
                matched.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0})
                continue
            
            resp_parts = response_part.split("|")
            if len(resp_parts) >= 2:
                inv_name = resp_parts[0].strip()
                inv_id = resp_parts[1].strip()
                score = int(resp_parts[2].strip()) if len(resp_parts) >= 3 and resp_parts[2].strip().isdigit() else 0
                matched.append({"input": input_name, "matched": True, "inv_name": inv_name, "_id": inv_id, "score": score})
            else:
                matched.append({"input": input_name, "matched": False, "inv_name": None, "_id": None, "score": 0})
        
        return matched
    except Exception as e:
        logger.warning("AI match failed: %s, falling back to rapidfuzz", e)
        return _fuzzy_match_fallback(items, all_inv)


def _fuzzy_match_fallback(items: list[str], all_inv: list[dict]) -> list[dict]:
    """Fallback fuzzy matching using rapidfuzz."""
    inv_names = {i.get("ingredientName", ""): i for i in all_inv if i.get("ingredientName")}
    results = []
    for item in items:
        best = fuzz_process.extractOne(item, list(inv_names.keys()), scorer=fuzz.WRatio, score_cutoff=70)
        if best:
            match_name, score = best[0], best[1]
            inv_item = inv_names[match_name]
            results.append({"input": item, "matched": True, "inv_name": match_name,
                           "_id": inv_item.get("_id", ""), "score": score})
        else:
            results.append({"input": item, "matched": False, "inv_name": None, "_id": None, "score": 0})
    return results


# ── Stock Reaction: Apply Deductions ──────────────────────────────

async def _apply_stock_deductions(matches: list[dict], all_inv: list[dict]) -> dict:
    """Apply 🔴 (set to 0) or 🟡 (half) to matched inventory items.
    Each match dict must have 'type' field for per-item action type.
    Returns {success: [{name, old_qty, new_qty, unit, action_type}], failed: [{input, reason}], history_entry}."""
    success = []
    failed = []
    history_items = []
    
    inv_map = {i.get("_id", ""): i for i in all_inv}
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        for match in matches:
            action_type = match.get("type", "🟡")
            
            if not match["matched"] or not match["_id"]:
                failed.append({"input": match["input"], "reason": "Tidak ditemukan di database"})
                continue
            
            inv_item = inv_map.get(match["_id"])
            if not inv_item:
                failed.append({"input": match["input"], "reason": "Item tidak ditemukan di lookup"})
                continue
            
            name = inv_item.get("ingredientName", match["input"])
            old_qty = float(inv_item.get("quantity") or 0)
            unit = inv_item.get("unit", "") or ""
            
            if action_type == "\U0001f534":
                if old_qty <= 0:
                    # Already 0 — still show purchase info, skip DB update
                    success.append({"name": name, "old_qty": old_qty, "new_qty": old_qty, "unit": unit, "action_type": action_type,
                                    "threshold": float(inv_item.get("lowStockThreshold") or 0),
                                    "price": float(inv_item.get("lastPurchasePrice") or 0),
                                    "purchase_unit": (inv_item.get("preferredPurchaseUnit") or unit or "").strip(),
                                    "purchase_qty": float(inv_item.get("preferredPurchaseQuantity") or 1),
                                    "conversion_factor": inv_item.get("conversionFactor")})
                    continue
                new_qty = 0.0
            elif action_type == "\U0001f7e1":
                if old_qty <= 0:
                    # Already 0 — still show purchase info, skip DB update
                    success.append({"name": name, "old_qty": old_qty, "new_qty": old_qty, "unit": unit, "action_type": action_type,
                                    "threshold": float(inv_item.get("lowStockThreshold") or 0),
                                    "price": float(inv_item.get("lastPurchasePrice") or 0),
                                    "purchase_unit": (inv_item.get("preferredPurchaseUnit") or unit or "").strip(),
                                    "purchase_qty": float(inv_item.get("preferredPurchaseQuantity") or 1),
                                    "conversion_factor": inv_item.get("conversionFactor")})
                    continue
                if unit.lower() in ("pcs", "pack", "botol", "pouch", "toros"):
                    new_qty = math.floor(old_qty / 2)
                else:
                    new_qty = old_qty / 2
            else:
                continue
            
            try:
                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{match['_id']}",
                    json={"quantity": new_qty},
                    headers=headers,
                )
                if resp.status_code == 204:
                    success.append({"name": name, "old_qty": old_qty, "new_qty": new_qty, "unit": unit, "action_type": action_type,
                                    "threshold": float(inv_item.get("lowStockThreshold") or 0),
                                    "price": float(inv_item.get("lastPurchasePrice") or 0),
                                    "purchase_unit": (inv_item.get("preferredPurchaseUnit") or unit or "").strip(),
                                    "purchase_qty": float(inv_item.get("preferredPurchaseQuantity") or 1),
                                    "conversion_factor": inv_item.get("conversionFactor")})
                    history_items.append({
                        "_id": match["_id"], "name": name,
                        "old_qty": old_qty, "new_qty": new_qty, "unit": unit
                    })
                else:
                    failed.append({"input": match["input"], "reason": f"DB error: {resp.status_code}"})
            except Exception as e:
                failed.append({"input": match["input"], "reason": f"Network error: {e}"})
    
    history_entry = None
    if history_items:
        ts = datetime.now().timestamp()
        history_entry = {
            "ts": ts,
            "items": history_items,
            "timestamp": datetime.now(timezone(timedelta(hours=7))).strftime("%H:%M"),
        }
        _stock_reaction_history[ts] = history_entry
    
    return {"success": success, "failed": failed, "history_entry": history_entry}


async def _get_stores() -> dict:
    """Fetch all active stores. Returns {store_id: {name, phone, type}}."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/pos_inventory_stores?select=_id,name,phone,type,notes&isActive=eq.true",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            if resp.status_code < 400:
                stores = resp.json()
                return {s["_id"]: s for s in stores}
    except Exception as e:
        logger.warning("Failed to fetch stores: %s", e)
    return {}


# ── Generate Marketlist Detail ────────────────────────────────────

async def _generate_marketlist_detail() -> str:
    """Generate marketlist detail (what to buy) based on current inventory."""
    try:
        all_inv = await inventory.get_all_inventory()
        stores = await _get_stores()
    except Exception as e:
        logger.warning("Marketlist detail generation failed: %s", e)
        return "❌ Gagal generate marketlist."
    
    items_to_buy = []
    for item in all_inv:
        name = item.get("ingredientName", "")
        if not _is_kitchen(name):
            continue
        
        qty = float(item.get("quantity") or 0)
        th = float(item.get("lowStockThreshold") or 0)
        price = float(item.get("lastPurchasePrice") or 0)
        unit = (item.get("unit") or "").strip()
        store_id = (item.get("preferredStoreId") or "") or ""
        
        # Harus beli dari kolom Beli (preferredPurchaseQuantity)
        beli_qty = float(item.get("preferredPurchaseQuantity") or 0)
        beli_unit = (item.get("preferredPurchaseUnit") or "").strip()
        
        if th <= 0 or qty > th:
            continue
        
        if beli_qty > 0 and beli_unit:
            buy_qty = beli_qty
            buy_unit = beli_unit
        else:
            buy_qty = max(0.01, th - qty)  # minimum 0.01 to avoid zero
            buy_unit = unit
        total_cost = buy_qty * price
        
        items_to_buy.append({
            "name": name, "buy_qty": buy_qty, "unit": buy_unit,
            "price": price, "total": total_cost, "store_id": store_id
        })
    
    if not items_to_buy:
        return "✅ Semua stok aman. Tidak ada yang perlu dibeli."
    
    # Group per merchant
    groups = {}
    for item in items_to_buy:
        sid = item["store_id"]
        store = stores.get(sid, {"name": "Lainnya", "phone": "", "type": "", "notes": ""})
        if sid not in groups:
            groups[sid] = {"store": store, "items": [], "subtotal": 0}
        groups[sid]["items"].append(item)
        groups[sid]["subtotal"] += item["total"]
    
    _WIB = timezone(timedelta(hours=7))
    now = datetime.now(_WIB)
    
    lines = [f"\U0001f6d2 Marketlist Detail \u2014 {now:%d/%m %H:%M}", ""]
    total_items = 0
    grand_total = 0
    
    for sid, grp in sorted(groups.items(), key=lambda x: -x[1]["subtotal"]):
        store = grp["store"]
        sname = store.get("name", "Lainnya")
        phone = store.get("phone", "") or ""
        notes = store.get("notes", "") or ""
        stype = store.get("type", "") or ""
        
        # Category emoji based on notes/type
        cat_emoji = "\U0001f3ea"  # default: store
        notes_lower = notes.lower()
        if any(kw in notes_lower for kw in ["sayur", "bumbu"]):
            cat_emoji = "\U0001f96c"  # leafy green
        elif any(kw in notes_lower for kw in ["daging", "ayam"]):
            cat_emoji = "\U0001f969"  # meat
        elif any(kw in notes_lower for kw in ["kopi", "beans"]):
            cat_emoji = "\u2615"  # coffee
        elif any(kw in notes_lower for kw in ["plastik", "cup", "botol"]):
            cat_emoji = "\U0001f9f0"  # packaging
        elif any(kw in notes_lower for kw in ["susu", "pastry"]):
            cat_emoji = "\U0001f95e"  # pastry
        
        cat_tag = f" {cat_emoji} {stype}" if stype else f" {cat_emoji}"
        
        lines.append(f"\U0001f3ea {sname}{cat_tag}")
        if phone:
            lines.append(f"\U0001f4ce {phone}")
        for item in grp["items"]:
            bq = item["buy_qty"]
            # Format buy_qty nicely
            un = item["unit"]
            if un.lower() in ("gram", "g") and bq >= 1000:
                bq_str = f"{bq/1000:.2f}".rstrip("0").rstrip(".")
                un = "kg"
            elif un.lower() in ("ml",) and bq >= 1000:
                bq_str = f"{bq/1000:.2f}".rstrip("0").rstrip(".")
                un = "L"
            else:
                bq_str = f"{bq:.2f}".rstrip("0").rstrip(".")
            
            price_fmt = f"Rp{item['price']:,.0f}"
            total_fmt = f"Rp{item['total']:,.0f}"
            lines.append(f"  \u2022 {item['name']} \u2014 {bq_str} {un} @ {price_fmt} = {total_fmt}")
        
        sub_fmt = f"Rp{grp['subtotal']:,.0f}"
        lines.append(f"  \U0001f4b0 Subtotal: {sub_fmt}")
        lines.append("")
        total_items += len(grp["items"])
        grand_total += grp["subtotal"]
    
    # Footer
    lines.append("\u2500" * 28)
    gt_fmt = f"Rp{grand_total:,.0f}"
    lines.append(f"\U0001f6cd Total: {total_items} item \u2022 {gt_fmt}")
    
    return "\n".join(lines)


# ── Handle Stock Reaction (main entry point) ──────────────────────

async def _handle_stock_reaction(update: Update, context, reaction: dict):
    """Handle 🔴/🟡 reaction from user (per-item types supported)."""
    msg = update.effective_message
    if not msg:
        return
    
    items = reaction["items"]  # list of {name, type}
    
    # Fetch current inventory
    try:
        all_inv = await inventory.get_all_inventory()
    except Exception as e:
        await msg.reply_text(f"\u274c Gagal ambil data inventory: {e}")
        return
    
    # AI match items to inventory (pass just names)
    names = [i["name"] for i in items]
    sp_client = SumoPodClient(SUMOPOD_API_KEY)
    matches = await _ai_match_inventory(sp_client, names, all_inv)
    
    # Merge match results with per-item types
    for i, item in enumerate(items):
        if i < len(matches):
            matches[i]["type"] = item["type"]
    
    # Apply deductions (per-item types)
    result = await _apply_stock_deductions(matches, all_inv)
    
    if not result["success"] and not result["failed"]:
        # Nothing to process - silent fail
        return
    
    # Build marketlist reply with purchase info (nama, sisa, beli, total)
    _WIB = timezone(timedelta(hours=7))
    now = datetime.now(_WIB)
    reply_lines = [f"\U0001f4cb MARKETLIST — {now:%d/%m/%Y}", ""]
    reply_lines.append("Nama Bahan | Sisa | Harus Beli | Total")
    reply_lines.append("\u2500" * 40)

    grand_total = 0.0
    for s in result["success"]:
        name = s["name"]
        sisa = s["new_qty"]
        unit = s["unit"]

        # Harus beli dari kolom Beli (preferredPurchaseQuantity + preferredPurchaseUnit)
        beli_qty = float(s.get("purchase_qty", 0) or 0)
        beli_unit = (s.get("purchase_unit") or "").strip()
        price = float(s.get("price", 0) or 0)

        # Format sisa
        sisa_str = f"{sisa:g}" if sisa == int(sisa) else f"{sisa:.1f}"
        if unit:
            sisa_str += f" {unit}"

        # Harus Beli — pakai kolom Beli (preferredPurchaseQuantity)
        if beli_qty > 0 and beli_unit:
            beli_str = f"{beli_qty:g} {beli_unit}"
            total = beli_qty * price
            total_fmt = f"Rp{int(total):,}".replace(",", ".")
            grand_total += total
        else:
            beli_str = "\u2014"
            total_fmt = "\u2014"

        reply_lines.append(f"{name} | {sisa_str} | {beli_str} | {total_fmt}")

    if result["success"]:
        reply_lines.append("")
        gt_fmt = f"Rp{int(grand_total):,}".replace(",", ".")
        reply_lines.append(f"\U0001f4b0 Estimasi Total: {gt_fmt}")

    for f in result["failed"]:
        reply_lines.append(f"\u274c {f['input']}: {f['reason']}")
    
    reply_text = "\n".join(reply_lines)
    
    reply_markup = None
    if result["history_entry"]:
        ts = result["history_entry"]["ts"]
        keyboard = [[InlineKeyboardButton("\u21a9\ufe0f Undo", callback_data=f"undo_{ts}")]]
        reply_markup = InlineKeyboardMarkup(keyboard)
    
    await msg.reply_text(reply_text, reply_markup=reply_markup)


# ── Undo Callback Handler ─────────────────────────────────────────

async def _handle_undo_callback(update: Update, context, ts_str: str):
    """Handle undo button click - restore previous quantities."""
    query = update.callback_query
    try:
        ts = float(ts_str)
    except ValueError:
        await query.answer("\u274c Invalid undo data", show_alert=True)
        return
    
    history = _stock_reaction_history.get(ts)
    if not history:
        await query.answer("\u274c Undo tidak tersedia atau sudah expired (max 5 menit)", show_alert=True)
        return
    
    # Check expiry
    now = datetime.now().timestamp()
    if now - ts > STOCK_REACTION_EXPIRY:
        del _stock_reaction_history[ts]
        await query.answer("\u23f0 Undo expired (maks 5 menit)", show_alert=True)
        # Edit message to remove keyboard
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except Exception:
            pass
        return
    
    # Restore quantities
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    restored = []
    failed = []
    async with httpx.AsyncClient(timeout=30) as client:
        for item in history["items"]:
            try:
                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{item['_id']}",
                    json={"quantity": item["old_qty"]},
                    headers=headers,
                )
                if resp.status_code == 204:
                    restored.append(item["name"])
                else:
                    failed.append(item["name"])
            except Exception as e:
                failed.append(item["name"])
    
    # Clean up history
    del _stock_reaction_history[ts]
    
    # Reply
    lines = ["\u21a9\ufe0f **Undone!** Qty dikembalikan ke sebelum:", ""]
    for name in restored:
        lines.append(f"  \u2705 {name}")
    for name in failed:
        lines.append(f"  \u274c {name} (gagal restore)")
    
    await query.answer()
    try:
        await query.edit_message_text("\n".join(lines))
    except Exception:
        await query.message.reply_text("\n".join(lines))
    
    # Also send updated marketlist after undo
    try:
        marketlist_text = await _generate_marketlist_detail()
        await query.message.reply_text(marketlist_text)
    except Exception as e:
        logger.warning("Marketlist after undo failed: %s", e)


# ── Stock Reaction History Cleanup ─────────────────────────────

_ALIAS_LOCK = threading.Lock()


async def _save_alias_to_db(inventory_name: str, inventory_id: str, alias_to_save: str) -> bool:
    """Save newly discovered alias into pos.inventory.aliases column.
    
    Called when user confirms a match (new expense→inventory mapping).
    Thread-safe; updates the DB aliases array + refreshes item_normalization cache.
    """
    if not alias_to_save or not inventory_id:
        return False
    try:
        # Fetch current aliases
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/inventory?source_id=eq.{inventory_id}&select=ingredient_name,aliases",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Accept-Profile": "pos",
                },
            )
            if resp.status_code != 200:
                return False
            rows = resp.json()
            if not rows:
                return False
            row = rows[0]
            current_aliases = row.get("aliases") or []
        
        alias_normalized = alias_to_save.strip()
        if not alias_normalized:
            return False
        
        # Skip if already exists
        alias_lower = alias_normalized.lower()
        if any(a.lower() == alias_lower for a in current_aliases):
            return True  # Already known
        
        # Append and save
        new_aliases = current_aliases + [alias_normalized]
        patch_resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/inventory?source_id=eq.{inventory_id}",
            json={"aliases": new_aliases},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Profile": "pos",
                "Accept-Profile": "pos",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        if patch_resp.status_code < 300:
            # Refresh the alias cache so both agents immediately benefit
            asyncio.ensure_future(_load_and_sync_aliases())
            logger.info("Saved new alias to DB: '%s' → '%s' (id=%s)",
                        alias_normalized, row.get("ingredient_name", ""), inventory_id)
            return True
        return False
    except Exception as e:
        logger.warning("Failed to save alias to DB: %s", e)
        return False


async def _load_and_sync_aliases():
    """Load DB aliases into item_normalization cache + sync to learning_memory.
    
    Called on startup and whenever a new alias is discovered.
    """
    try:
        # 1. Load DB aliases into item_normalization cache
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/inventory?select=ingredient_name,aliases",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Accept-Profile": "pos",
                },
            )
            if resp.status_code != 200:
                return
            db_items = resp.json()
        
        load_aliases_from_db(db_items)
        
        # 2. Sync DB aliases into learning_memory.json (for fuzzy search)
        entries = load_learning_memory()
        existing_by_input = {e.get("userInput", "").lower() for e in entries if e.get("type") == "expense_match"}
        
        synced = 0
        for item in db_items:
            name = item.get("ingredient_name", "")
            if not name:
                continue
            aliases = item.get("aliases") or []
            for alias in aliases:
                if not alias.strip():
                    continue
                alias_key = alias.strip().lower()
                if alias_key not in existing_by_input:
                    save_learning_entry(
                        user_input=alias.strip(),
                        parsed_name=name,
                        matched_inventory_id=name,  # We need source_id, use name as identifier
                        matched_ingredient_name=name,
                        confidence=0.95,
                        entry_type="expense_match",
                    )
                    existing_by_input.add(alias_key)
                    synced += 1
        
        if synced:
            logger.info("Synced %d DB aliases into learning memory", synced)
    except Exception as e:
        logger.warning("Alias load/sync failed (non-fatal): %s", e)

async def _cleanup_stock_reaction_history():
    """Periodic cleanup of expired undo entries (runs every 5 minutes)."""
    while True:
        await asyncio.sleep(300)  # 5 minutes
        now = datetime.now().timestamp()
        expired = [ts for ts, entry in list(_stock_reaction_history.items())
                   if now - float(ts) > STOCK_REACTION_EXPIRY]
        for ts in expired:
            del _stock_reaction_history[ts]
        if expired:
            logger.info("Cleaned %d expired stock reaction history entries", len(expired))


# ── Main ────────────────────────────────────────────────────────

async def main():
    app = (
        ApplicationBuilder()
        .token(TELEGRAM_BOT_TOKEN)
        .build()
    )

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("supplier", cmd_supplier))
    app.add_handler(CommandHandler("match_expense", cmd_match_expense))
    app.add_handler(CommandHandler("yumi", cmd_yumi))
    app.add_handler(CommandHandler("hermes_scope", cmd_hermes_scope))
    app.add_handler(CommandHandler("hermes_test", cmd_hermes_test))
    app.add_handler(CommandHandler("koreksi", cmd_koreksi))
    # Message handlers — ordered by priority
    # Marketlist text input (after callback prompt) goes before general text
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND,
        lambda u, c: handle_marketlist_text_input(
            u, c, marketlist_sessions,
            format_merchant_marketlist,
            recalculate_with_qty,
            SumoPodClient(SUMOPOD_API_KEY), inventory,
        ),
    ), group=1)  # Higher priority group
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(CallbackQueryHandler(handle_callback))

    logger.info("Starting Yumi Purchasing Agent (AI-powered)...")
    
    # ── Load aliases from DB into shared cache + sync to learning memory ──
    try:
        await _load_and_sync_aliases()
        logger.info("Inventory aliases loaded and synced to learning memory")
    except Exception as e:
        logger.warning("Alias load failed (non-fatal): %s", e)
    
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    logger.info("Yumi Purchasing Agent siap — Inventory, Marketlist, AI Chat")

    # ── Background: stock update monitor ───────────────────
    last_purchase_id = 0
    last_completed_order_id = ""

    async def _monitor_stock_changes():
        nonlocal last_purchase_id
        await asyncio.sleep(5)
        while True:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/pos_purchase_logs?select=id&order=id.desc&limit=1",
                        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
                    )
                    if resp.status_code < 400:
                        rows = resp.json()
                        if rows:
                            latest_id = rows[0]["id"]
                            if last_purchase_id > 0 and latest_id > last_purchase_id:
                                logger.info("New purchase detected (id:%d→%d), sending stock update", last_purchase_id, latest_id)
                                await _notify_stock_update()
                            last_purchase_id = latest_id
                        elif last_purchase_id == 0:
                            last_purchase_id = 0
            except Exception as e:
                logger.debug("Stock monitor check: %s", e)
            await asyncio.sleep(60)

    async def _monitor_completed_orders():
        nonlocal last_completed_order_id
        await asyncio.sleep(10)
        while True:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    # Cek order terbaru dengan status "completed" via public view
                    resp = await client.get(
                        f"{SUPABASE_URL}/rest/v1/pos_orders?select=_id,orderNumber,status&status=eq.completed&order=_creationTime.desc&limit=1",
                        headers={
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                        },
                    )
                    if resp.status_code < 400:
                        rows = resp.json()
                        if rows:
                            latest_id = rows[0].get("_id", "")
                            if latest_id and latest_id != last_completed_order_id:
                                if last_completed_order_id:
                                    order_num = rows[0].get("orderNumber", latest_id[-6:])
                                    logger.info("New completed order #%s (skip notification)", order_num)
                                last_completed_order_id = latest_id
            except Exception as e:
                logger.debug("Completed order monitor check: %s", e)
            await asyncio.sleep(120)  # Cek tiap 2 menit

    async def _scheduled_stock_report():
        """Kirim laporan stok terjadwal tiap pagi 08:00 & sore 17:00 WIB."""
        _WIB = timezone(timedelta(hours=7))
        while True:
            now = datetime.now(_WIB)
            today = now.date()
            pagi = datetime(today.year, today.month, today.day, 8, 0, tzinfo=_WIB)
            sore = datetime(today.year, today.month, today.day, 17, 0, tzinfo=_WIB)
            jadwal = [pagi, sore]
            # Skip jadwal yang sudah lewat hari ini
            next_run = min((s for s in jadwal if s > now), default=pagi + timedelta(days=1))
            delay = (next_run - now).total_seconds()
            logger.info("Stock report scheduler: next run at %s WIB (%d detik)", next_run.strftime("%H:%M"), delay)
            await asyncio.sleep(delay)
            await _notify_stock_update()

    asyncio.ensure_future(_scheduled_stock_report())
    asyncio.ensure_future(_monitor_stock_changes())
    asyncio.ensure_future(_monitor_completed_orders())
    asyncio.ensure_future(_cleanup_stock_reaction_history())
    asyncio.ensure_future(_poll_new_expenses(app))

    stop = asyncio.get_event_loop().create_future()
    try:
        await stop
    except asyncio.CancelledError:
        pass
    finally:
        await app.stop()
        await app.shutdown()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
