#!/usr/bin/env python3
"""sync-inventory-prices-from-expenses.py — v2

Sync inventory lastPurchasePrice from expense transactions (bulan ini & bulan lalu).
Hanya memproses transaksi CLEAN — single-item dengan qty jelas atau scanItems dengan harga per item.

Usage:
  python sync-inventory-prices-from-expenses.py [--dry-run]
"""

import httpx
import json
import re
import sys
import os
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

WIB = timezone(timedelta(hours=7))
DRY_RUN = "--dry-run" in sys.argv

# ── Load env ──
ENV_FILE = os.path.join(os.path.dirname(__file__), "..", "yumi-finance-agent", ".env")
env = {}
with open(ENV_FILE) as f:
    for line in f:
        line = line.strip()
        if line and "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

SUPABASE_URL = env.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = env.get("SUPABASE_KEY", "")
ACCESS_TOKEN = env.get("SUPABASE_ACCESS_TOKEN", "")
project_ref = SUPABASE_URL.split("//")[-1].split(".")[0]

MGMT_URL = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
}

# ── Known inventory item names for smart matching ──
KNOWN_INVENTORY = {}  # filled later

def clean_name(name: str) -> str:
    """Normalize item name for fuzzy matching."""
    name = name.lower().strip()
    name = re.sub(r'^\d+(?:/\d+)?\s+', '', name)
    name = re.sub(r'\d+(?:[,.]\d+)?\s*(?:kg|gram|gr|g|ml|liter|lt|l|pcs|pack|sachet|ikat|bungkus|botol|gelas|bal|dus|karton|renceng|toros|butir|biji|buah)\b', '', name)
    name = re.sub(r'[,\\.!?]+$', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def fuzzy_score(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()

# ── Parse descriptions for CLEAN single-item purchases ──

# Items to skip — never update price from these descriptions
SKIP_DESC_KEYWORDS = [
    "parkir", "sampah", "zampah", "bensin", "roko", "rokok", "kresek",
    "by rian", "kitchrn", "minyak", "tisu", "spon cuci",
    "kertas thermal", "mang andri", "bensin rian",
    "bulk belanja", "belanja -",  # multi-item — skip
    "pembelian stok",  # already handled by OCR pipeline
]

def is_skip_description(desc: str) -> bool:
    """Check if description should be skipped entirely."""
    if not desc:
        return True
    desc_lower = desc.lower().strip()
    for kw in SKIP_DESC_KEYWORDS:
        if kw in desc_lower:
            return True
    return False

def extract_items_from_description(desc: str, total_amount: float, inventory_names: list[str]) -> list[dict]:
    """
    Extract CLEAN single-item purchases from description.
    
    Returns list of {"name", "qty", "unit", "price", "total", "source"}
    Only returns items that can be confidently priced.
    """
    if not desc or not desc.strip():
        return []
    
    desc = desc.strip()
    
    # ── Skip non-inventory and multi-item descriptions ──
    if is_skip_description(desc):
        return []
    
    # ── Pattern 1: "item_name qty unit" — e.g., "ubi cilembu 2kg" ──
    m = re.match(r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|ml|l|liter|pcs|pack|ikat|bungkus|botol|gelas|bal|dus|karton)s?\s*$', desc, re.IGNORECASE)
    if m:
        name = m.group(1).strip()
        qty = float(m.group(2).replace(",", "."))
        unit = m.group(3).strip().lower()
        unit_price = total_amount / qty if qty > 0 else total_amount
        return [{"name": name, "qty": qty, "unit": unit, "price": round(unit_price), "total": total_amount, "source": "item_qty_unit"}]
    
    # ── Pattern 2: "qty unit item_name" — e.g., "2kg ubi cilembu" ──
    m = re.match(r'(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|ml|l|liter|pcs|pack|ikat|bungkus|botol|gelas|bal|dus|karton)\s+(.+?)\s*$', desc, re.IGNORECASE)
    if m:
        qty = float(m.group(1).replace(",", "."))
        unit = m.group(2).strip().lower()
        name = m.group(3).strip()
        unit_price = total_amount / qty if qty > 0 else total_amount
        return [{"name": name, "qty": qty, "unit": unit, "price": round(unit_price), "total": total_amount, "source": "qty_unit_item"}]
    
    # ── Pattern 3: "qty item_name" — e.g., "2 cleo", "3 gold label" ──
    # Only if total_amount / qty seems reasonable (item-level price, not bulk)
    m = re.match(r'(\d+(?:[.,]\d+)?)\s+(.+?)\s*$', desc)
    if m:
        qty = float(m.group(1).replace(",", "."))
        name = m.group(2).strip()
        per_unit = total_amount / qty if qty > 0 else 0
        # Sanity: per-unit price between Rp500 and Rp500,000
        if per_unit >= 500 and per_unit <= 500_000 and qty <= 20:
            return [{"name": name, "qty": qty, "price": round(per_unit), "total": total_amount, "source": "qty_item"}]
        # For "2 gold label" — per_unit is ~28,750 which is reasonable
        if qty <= 5 and per_unit <= 200_000:
            return [{"name": name, "qty": qty, "price": round(per_unit), "total": total_amount, "source": "qty_item"}]
    
    # ── Pattern 4: "item_name" alone (single item, no qty) ──
    # Only if description looks like a known inventory item name
    desc_lower = desc.lower().strip()
    if len(desc.split()) <= 3:
        # Check against known inventory names
        for inv_name in inventory_names:
            inv_clean = clean_name(inv_name)
            desc_clean = clean_name(desc_lower)
            if fuzzy_score(desc_clean, inv_clean) >= 0.8:
                return [{"name": desc, "qty": 1, "price": total_amount, "total": total_amount, "source": "item_only"}]
    
    return []

# ── SQL helpers ──

def mgmt_sql(sql: str):
    r = httpx.post(MGMT_URL, headers=MGMT_HEADERS, json={"query": sql}, timeout=30)
    if r.status_code < 300:
        return r.json()
    print(f"  ⚠️ SQL error ({r.status_code}): {r.text[:200]}")
    return []

def mgmt_sql_exec(sql: str):
    r = httpx.post(MGMT_URL, headers=MGMT_HEADERS, json={"query": sql}, timeout=30)
    if r.status_code >= 300:
        print(f"  ⚠️ SQL exec error ({r.status_code}): {r.text[:200]}")
    return r.status_code < 300

# ── Main ──

def main():
    print("=" * 70)
    print(f"SYNC INVENTORY PRICES FROM EXPENSES (v2 - Clean only)")
    print(f"Mode: {'🔍 DRY RUN' if DRY_RUN else '✅ LIVE UPDATE'}")
    print(f"Time: {datetime.now(WIB).strftime('%d/%m/%Y %H:%M')} WIB")
    print("=" * 70)
    
    now = datetime.now(WIB)
    start_this = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
    end_now = int(now.timestamp() * 1000)
    first_of_this = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = first_of_this - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_last = int(last_month_start.timestamp() * 1000)
    end_last = int(last_month_end.replace(hour=23, minute=59, second=59, microsecond=999000).timestamp() * 1000)
    
    # ── 1. Fetch all expenses ──
    sql = f"""
    SELECT source_id, amount::text, description, merchant, category, 
           payment_method, tx_date, raw::text
    FROM pos.financial_transactions
    WHERE tx_type = 'expense'
      AND (category IS NULL OR category != 'HPP')
      AND tx_date >= {start_last}
      AND tx_date <= {end_now}
    ORDER BY tx_date DESC
    """
    
    print(f"\n📥 Fetching expenses {last_month_start.strftime('%d/%m')} → {now.strftime('%d/%m')}...")
    txns = mgmt_sql(sql)
    print(f"   Found {len(txns)} expense transactions")
    
    # ── 2. Fetch inventory ──
    inv_sql = """
    SELECT source_id, ingredient_name, unit, last_purchase_price::text, 
           preferred_store_source_id
    FROM pos.inventory
    WHERE ingredient_name IS NOT NULL
    ORDER BY ingredient_name ASC
    """
    inventory = mgmt_sql(inv_sql)
    print(f"   Inventory: {len(inventory)} items")
    
    # Build inventory name list for matching
    inventory_names = [i["ingredient_name"] for i in inventory]
    
    # ── 3. Process: extract items from EACH transaction ──
    all_items = []  # list of {"item": {...}, "tx": {...}}
    
    for tx in txns:
        tx_id = tx.get("source_id", "")
        amount = float(tx.get("amount", 0) or 0)
        desc = (tx.get("description") or "").strip()
        merchant = tx.get("merchant") or ""
        tx_date = datetime.fromtimestamp(tx.get("tx_date", 0) / 1000, WIB)
        
        if amount <= 0 or not desc:
            continue
        
        # Parse metadata to determine source type
        raw_text = tx.get("raw") or "{}"
        try:
            raw_data = json.loads(raw_text) if isinstance(raw_text, str) else raw_text
        except (json.JSONDecodeError, AttributeError, TypeError):
            raw_data = {}
        
        meta = raw_data.get("metadata", {}) or {}
        source_type = meta.get("source", "") or ""
        input_mode = meta.get("inputMode", "") or ""
        
        # ── SKIP consumption entries from POS menu sidebar ──
        # These have scanItems with current inventory prices, NOT purchase prices
        if source_type == "pos_menu_sidebar" or input_mode == "pos_menu_sidebar_expense":
            continue
        
        # ── SKIP ai_receipt_scan entries (already updated prices when created) ──
        if source_type == "ai_receipt_scan":
            continue
        
        # ── Try scanItems from non-sidebar sources ──
        items_from_raw = []
        try:
            scan_items = meta.get("scanItems", []) or raw_data.get("scanItems", [])
            for si in scan_items:
                name = si.get("name", "").strip()
                if not name:
                    continue
                s_qty = float(si.get("qty", si.get("quantity", 1)) or 1)
                s_price = float(si.get("price", 0) or 0)
                s_unit = si.get("unit", "")
                if s_price >= 100:
                    items_from_raw.append({
                        "name": name, "qty": s_qty, "unit": s_unit,
                        "price": round(s_price),
                        "total": round(s_qty * s_price),
                        "source": "scanItems"
                    })
        except (json.JSONDecodeError, AttributeError, TypeError):
            pass
        
        if items_from_raw:
            for item in items_from_raw:
                all_items.append({"item": item, "tx": {"id": tx_id, "merchant": merchant, "date": tx_date}})
            continue
        
        # No scanItems — try description parsing for clean single-item
        extracted = extract_items_from_description(desc, amount, inventory_names)
        for item in extracted:
            all_items.append({"item": item, "tx": {"id": tx_id, "merchant": merchant, "date": tx_date}})
    
    print(f"\n📊 Description parsing:")
    print(f"   Items extracted: {len(all_items)}")
    
    # ── 4. Fuzzy match each item to inventory ──
    matched = []
    
    for entry in all_items:
        item = entry["item"]
        name = item.get("name", "")
        price = item.get("price", 0)
        qty = item.get("qty", 1)
        
        if not name or price <= 0:
            continue
        
        # Fuzzy match to inventory
        name_clean = clean_name(name)
        best_score = 0.0
        best_inv = None
        for inv in inventory:
            inv_name = inv.get("ingredient_name", "")
            score = fuzzy_score(name_clean, clean_name(inv_name))
            if score > best_score:
                best_score = score
                best_inv = inv
        
        # Strict matching: require score >= 0.7 for single items
        # and score >= 0.8 for scanItems (since names are cleaner)
        threshold = 0.8 if item.get("source") == "scanItems" else 0.7
        if best_score >= threshold and best_inv:
            matched.append({
                "item": item,
                "tx": entry["tx"],
                "inventory": best_inv,
                "score": best_score,
            })
    
    print(f"   Fuzzy matched (score>={threshold}): {len(matched)}")
    
    # ── 5. Aggregate: keep only MOST RECENT price per inventory item ──
    # Group by inventory_id, keep the one with most recent tx_date
    best_per_item = {}
    for m in matched:
        inv_id = m["inventory"]["source_id"]
        tx_date = m["tx"]["date"]
        if inv_id not in best_per_item or tx_date > best_per_item[inv_id]["tx"]["date"]:
            best_per_item[inv_id] = m
    
    final_updates = list(best_per_item.values())
    final_updates.sort(key=lambda x: (x.get("inventory") or {}).get("ingredient_name", ""))
    
    # ── 6. Show updates ──
    print(f"\n{'='*70}")
    print(f"PRICE UPDATES ({len(final_updates)} items — most recent price per item):")
    print(f"{'='*70}")
    
    stats = {"updated": 0, "skipped_same": 0, "errors": 0}
    
    # Sort items by ingredient_name
    for m in sorted(final_updates, key=lambda x: x["inventory"].get("ingredient_name", "")):
        inv = m["inventory"]
        item = m["item"]
        tx = m["tx"]
        
        inv_name = inv.get("ingredient_name", "?")
        old_price = float(inv.get("last_purchase_price") or 0)
        new_price = float(item.get("price", 0))
        qty = item.get("qty", 1)
        source = item.get("source", "?")
        tx_date_str = tx["date"].strftime("%d/%m")
        tx_id = tx["id"]
        merchant_str = tx.get("merchant", "")[:20]
        
        # Skip if no meaningful change
        if old_price > 0 and abs(new_price - old_price) / old_price < 0.05:
            stats["skipped_same"] += 1
            continue
        
        # Sanity: price must be reasonable
        if new_price < 100 or new_price > 10_000_000:
            continue
        
        # Get the unit from inventory for display
        inv_unit = inv.get("unit", "")
        unit_str = f"/{inv_unit}" if inv_unit else ""
        qty_str = f" ({qty:.0f}{inv_unit})" if qty and inv_unit else f" ({qty:.0f} pcs)" if qty else ""
        
        change_pct = ((new_price - old_price) / (old_price or 1)) * 100
        arrow = "🔼" if new_price > old_price else "🔽"
        
        print(f"  {inv_name:<25s} Rp{old_price:>8,.0f} → Rp{new_price:>8,.0f}{unit_str}")
        print(f"  {'':>25s} 📅 {tx_date_str} | {qty_str:<10s} | {merchant_str:<15s} | from: {source}")
        print()
        
        if not DRY_RUN:
            sql_update = f"""
            UPDATE pos.inventory 
            SET last_purchase_price = {new_price},
                last_purchase_at = {int(tx['date'].timestamp() * 1000)}
            WHERE source_id = '{inv['source_id'].replace(chr(39), chr(39)*2)}'
            """
            ok = mgmt_sql_exec(sql_update)
            if ok:
                stats["updated"] += 1
            else:
                stats["errors"] += 1
    
    print(f"\n{'='*70}")
    print(f"SUMMARY:")
    print(f"  Total items matched: {len(matched)}")
    print(f"  Unique items (most recent): {len(final_updates)}")
    print(f"  Prices updated: {stats['updated']}")
    print(f"  Skipped (no change): {stats['skipped_same']}")
    print(f"  Errors: {stats['errors']}")
    print(f"{'='*70}")
    
    # ── 7. Save learning memory for purchasing agent ──
    if not DRY_RUN and final_updates:
        print(f"\n📝 Saving learning memory for Yumi Purchasing Agent...")
        learning_file = os.path.join(
            os.path.dirname(ENV_FILE), "..", "yumi-purchasing-agent", "learning_memory.json"
        )
        try:
            learning_dir = os.path.dirname(learning_file)
            if os.path.exists(learning_file):
                with open(learning_file) as f:
                    learning_data = json.load(f)
            else:
                learning_data = {"version": 1, "entries": []}
            
            before = len(learning_data["entries"])
            added = 0
            
            for m in final_updates:
                inv = m["inventory"]
                item = m["item"]
                inv_id = inv["source_id"]
                inv_name = inv.get("ingredient_name", "")
                entry_id = f"sync_{inv_id[:12]}"
                
                entry = {
                    "id": entry_id,
                    "userInput": item["name"],
                    "parsedName": inv_name,
                    "matchedInventoryId": inv_id,
                    "matchedIngredientName": inv_name,
                    "suggestedSupplier": m["tx"].get("merchant", ""),
                    "suggestedSupplierPhone": "",
                    "suggestedQty": item.get("qty", 1),
                    "suggestedUnit": item.get("unit", ""),
                    "suggestedPrice": item.get("price", 0),
                    "isCorrected": False,
                    "correctionType": None,
                    "correctionPayload": None,
                    "confirmedByUser": False,
                    "confidence": 0.8,
                    "usageCount": 1,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "price_sync_from_expenses",
                }
                
                # Don't add duplicates
                existing_ids = {e.get("id") for e in learning_data["entries"]}
                if entry_id not in existing_ids:
                    learning_data["entries"].append(entry)
                    added += 1
            
            if added > 0:
                learning_data["version"] = learning_data.get("version", 1) + 1
                learning_data["last_updated"] = datetime.now(timezone.utc).isoformat()
                with open(learning_file, "w", encoding="utf-8") as f:
                    json.dump(learning_data, f, indent=2, ensure_ascii=False)
            
            print(f"   Learning memory: {before} → {before+added} entries (+{added})")
        except Exception as e:
            print(f"   ⚠️ Could not save learning memory: {e}")
    
    print(f"\n{'✅ DONE (LIVE)' if not DRY_RUN else '🔍 DRY RUN — no changes made'}")

if __name__ == "__main__":
    main()
