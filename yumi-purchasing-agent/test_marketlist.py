#!/usr/bin/env python
"""test_marketlist.py — Test suite for Yumi Purchasing Agent marketlist pipeline.

Usage:
    cd /opt/djiwatentramapp/yumi-purchasing-agent
    source .venv/bin/activate
    python test_marketlist.py
"""

import asyncio
import json
import os
import sys
import tempfile
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.dirname(__file__))


# ── Mock Classes ────────────────────────────────────────────────

class MockSumoPodClient:
    """Mock client that triggers regex/rule fallbacks (no AI calls)."""
    def __init__(self):
        self.api_key = "test_key"
        self.base_url = "http://test:8080/v1"


class MockInventoryManager:
    def __init__(self):
        self._items = [
            {"_id": "inv_001", "ingredientName": "Kentang", "quantity": 2, "lowStockThreshold": 5, "unit": "kg", "lastPurchasePrice": 15000, "preferredStoreId": "store_001"},
            {"_id": "inv_002", "ingredientName": "Paha Fillet", "quantity": 3, "lowStockThreshold": 10, "unit": "kg", "lastPurchasePrice": 45000, "preferredStoreId": "store_002"},
            {"_id": "inv_003", "ingredientName": "Timun", "quantity": 0, "lowStockThreshold": 3, "unit": "kg", "lastPurchasePrice": 8000, "preferredStoreId": "store_001"},
            {"_id": "inv_004", "ingredientName": "Sosis", "quantity": 8, "lowStockThreshold": 5, "unit": "pcs", "lastPurchasePrice": 35000, "preferredStoreId": "store_002"},
            {"_id": "inv_005", "ingredientName": "Bawang Merah", "quantity": 0.5, "lowStockThreshold": 2, "unit": "kg", "lastPurchasePrice": 25000, "preferredStoreId": None},
        ]

    async def get_all_inventory(self):
        return self._items

    async def fuzzy_match_item(self, name, inventory_list=None):
        if inventory_list is None:
            inventory_list = self._items
        name_lower = name.lower().strip()
        from rapidfuzz import fuzz
        best = None
        best_score = 0
        for item in inventory_list:
            inv_name = item.get("ingredientName", "").lower().strip()
            score = fuzz.token_sort_ratio(name_lower, inv_name)
            if score > best_score:
                best_score = score
                best = item
        return best, best_score

    async def check_stock(self, name):
        return "mock stock result"


class MockSupplierManager:
    def __init__(self):
        self._suppliers = {
            "store_001": {"_id": "store_001", "name": "Toko Segar Jaya", "type": "Sayur", "phone": "08123456789"},
            "store_002": {"_id": "store_002", "name": "Cold Storage", "type": "Daging", "phone": "08123456780"},
        }

    async def get_all_suppliers(self):
        return list(self._suppliers.values())

    async def get_supplier_by_id(self, store_id):
        return self._suppliers.get(store_id)

    async def search(self, query):
        results = []
        for s in self._suppliers.values():
            if query.lower() in s["name"].lower() or query.lower() in s.get("type", "").lower():
                results.append(s)
        return results


# ── Tests ───────────────────────────────────────────────────────

passed = 0
failed = 0


def assert_eq(got, expected, label):
    global passed, failed
    if got == expected:
        passed += 1
        print(f"  ✅ {label}")
    else:
        failed += 1
        print(f"  ❌ {label}: expected {expected!r}, got {got!r}")


async def test_parse_marketlist_text():
    """Test AI parse fallback (regex)."""
    from marketlist import parse_marketlist_text
    client = MockSumoPodClient()

    # Basic marketlist
    items = await parse_marketlist_text("""market list kitchen
-kentang (abis bgt)
-paha fillet
-timun (abis bgt)""", client)
    assert_eq(len(items), 3, "parse: basic — 3 items")
    assert_eq(items[0]["name"], "kentang", "parse: item 1 = kentang")
    assert_eq(items[0]["note"], "abis bgt", "parse: item 1 note = abis bgt")
    assert_eq(items[1]["name"], "paha fillet", "parse: item 2 = paha fillet")
    assert_eq(items[2]["name"], "timun", "parse: item 3 = timun")

    # Header variations
    items2 = await parse_marketlist_text("""belanja list bar
• susu
• kopi""", client)
    assert_eq(len(items2), 2, "parse: belanja list bar → 2 items")
    assert_eq(items2[0]["name"], "susu", "parse: 'belanja list bar' header filtered")

    # Empty
    items3 = await parse_marketlist_text("", client)
    assert_eq(len(items3), 0, "parse: empty text → 0 items")

    print()


async def test_match_marketlist():
    """Test batch fuzzy match."""
    from marketlist import match_marketlist_to_inventory
    inv = MockInventoryManager()

    parsed = [{"name": "kentang", "note": "abis"}, {"name": "barang_aneh_xyz", "note": None}]
    enriched = await match_marketlist_to_inventory(parsed, inv)

    assert_eq(len(enriched), 2, "match: returns all items")
    assert_eq(enriched[0]["matched"], True, "match: kentang matched")
    assert_eq(enriched[0]["inv_id"], "inv_001", "match: kentang → inv_001")
    assert_eq(enriched[0]["score"], 100, "match: kentang score=100")
    # Unknown with completely different characters to avoid any fuzzy match
    enriched2 = await match_marketlist_to_inventory(
        [{"name": "zzzzzxxxxx", "note": None}], inv
    )
    assert_eq(enriched2[0]["matched"], False, "match: unknown item not matched")
    assert_eq(enriched2[0]["score"] < 60, True, "match: unknown score low")

    print()


async def test_group_by_merchant():
    """Test merchant grouping."""
    from marketlist import group_by_merchant
    supplier_mgr = MockSupplierManager()
    client = MockSumoPodClient()

    enriched = [
        {"input_name": "kentang", "name": "Kentang", "matched": True, "inv_id": "inv_001",
         "quantity": 2, "lowStockThreshold": 5, "unit": "kg", "lastPurchasePrice": 15000,
         "preferredStoreId": "store_001"},
        {"input_name": "paha fillet", "name": "Paha Fillet", "matched": True, "inv_id": "inv_002",
         "quantity": 3, "lowStockThreshold": 10, "unit": "kg", "lastPurchasePrice": 45000,
         "preferredStoreId": "store_002"},
    ]

    result = await group_by_merchant(enriched, supplier_mgr, client)
    assert_eq(len(result["groups"]), 2, "group: 2 merchants")
    assert_eq(result["groups"][0]["supplier_name"], "Toko Segar Jaya", "group: supplier 1 name")
    assert_eq(result["groups"][1]["supplier_name"], "Cold Storage", "group: supplier 2 name")

    # Check items in groups
    assert_eq(len(result["groups"][0]["items"]), 1, "group: supplier 1 has 1 item")
    assert_eq(result["groups"][0]["items"][0]["name"], "Kentang", "group: item name correct")

    # Grand total = (5-2)*15000 + (10-3)*45000 = 3*15000 + 7*45000 = 45000 + 315000 = 360000
    expected_total = 45000 + 315000
    assert_eq(int(result["grand_total"]), expected_total, "group: grand total correct")

    print()


async def test_format_merchant_marketlist():
    """Test format output."""
    from marketlist import format_merchant_marketlist

    groups = [
        {"supplier_name": "Toko Segar Jaya", "supplier_phone": "08123456789",
         "items": [{"name": "Kentang", "qty": 3, "unit": "kg", "price": 15000, "subtotal": 45000}],
         "subtotal": 45000},
    ]
    result = format_merchant_marketlist(groups, 45000, timestamp="13/05 10:00", items_count=1)
    assert_eq("🏪" in result, True, "format: contains merchant emoji")
    assert_eq("Toko Segar Jaya" in result, True, "format: contains merchant name")
    assert_eq("08123456789" in result, True, "format: contains phone")
    assert_eq("Rp45.000" in result, True, "format: contains formatted price")
    assert_eq("Total: 1 item" in result, True, "format: contains item count")

    # With unmatched items
    result2 = format_merchant_marketlist(groups, 45000, timestamp="13/05 10:00", items_count=1,
                                         unmatched_items=["barang_aneh"])
    assert_eq("⚠️" in result2, True, "format: unmatched indicator shown")
    assert_eq("barang_aneh" in result2, True, "format: unmatched item name shown")

    print()


async def test_calc_buy_qty():
    """Test buy quantity calculation."""
    from marketlist import _calc_buy_qty

    # qty=2, thresh=5 → need = max(5-2, 0) = 3
    assert_eq(_calc_buy_qty({"quantity": 2, "lowStockThreshold": 5}), 3, "buy_qty: need 3")

    # qty=10, thresh=5 → need = max(5-10, 0) = 0 → max(thresh=5, 1) = 5
    assert_eq(_calc_buy_qty({"quantity": 10, "lowStockThreshold": 5}), 5, "buy_qty: restock to threshold")

    # qty=0, thresh=0 → need = 0 → max(0, 1) = 1
    assert_eq(_calc_buy_qty({"quantity": 0, "lowStockThreshold": 0}), 1, "buy_qty: default 1 when no threshold")

    print()


async def test_recalculate_and_remove():
    """Test recalculate_with_qty and remove_item_and_reformat."""
    from marketlist import recalculate_with_qty, remove_item_and_reformat

    groups = [{"supplier_name": "Toko", "supplier_phone": "123", "items": [
        {"name": "A", "qty": 1, "unit": "kg", "price": 10, "subtotal": 10},
        {"name": "B", "qty": 2, "unit": "kg", "price": 20, "subtotal": 40},
    ], "subtotal": 50}]

    # Recalculate: change item 0 (A) qty to 5 → subtotal = 5*10 = 50, group subtotal = 50+40 = 90
    g2 = recalculate_with_qty(groups, 0, 5)
    assert_eq(g2[0]["items"][0]["qty"], 5, "recalc: qty changed")
    assert_eq(g2[0]["items"][0]["subtotal"], 50, "recalc: subtotal recalculated")
    assert_eq(g2[0]["subtotal"], 90, "recalc: group subtotal recalculated")

    # Remove: remove item 1 (B) → only A left
    g3, cnt = remove_item_and_reformat(groups, 1)
    assert_eq(cnt, 1, "remove: 1 item left")
    assert_eq(len(g3[0]["items"]), 1, "remove: 1 item in group")
    assert_eq(g3[0]["items"][0]["name"], "A", "remove: remaining item = A")

    print()


async def test_process_input_marketlist():
    """Test full pipeline (with mock data, AI parse falls back to regex)."""
    from marketlist import process_input_marketlist
    client = MockSumoPodClient()
    inv = MockInventoryManager()
    supplier_mgr = MockSupplierManager()

    # Clean any existing test memory
    test_memory_file = os.path.join(os.path.dirname(__file__), "learning_memory.json")
    if os.path.exists(test_memory_file):
        os.remove(test_memory_file)

    result = await process_input_marketlist(
        """market list kitchen
-kentang (abis)
-paha fillet
-timun""",
        client, inv, supplier_mgr,
    )

    assert_eq(result["success"], True, "pipeline: success")
    assert_eq(result["items_count"], 3, "pipeline: 3 items")
    assert_eq(len(result["groups"]) >= 1, True, "pipeline: at least 1 merchant group")
    assert_eq(result["grand_total"] > 0, True, "pipeline: grand_total > 0")
    assert_eq("🛒 Marketlist Detail" in result["formatted_text"], True, "pipeline: has header")
    assert_eq("🏪" in result["formatted_text"], True, "pipeline: has merchant emoji")
    assert_eq("Total:" in result["formatted_text"], True, "pipeline: has total")

    # Result should contain entry_id
    assert_eq(result["entry_id"] is not None, True, "pipeline: entry_id saved to memory")

    # Cleanup test file
    if os.path.exists(test_memory_file):
        os.remove(test_memory_file)

    print()


async def test_learning_memory_crud():
    """Test learning memory CRUD operations."""
    from learning_memory import (save_learning_entry, load_learning_memory,
                                  search_learning_memory, update_learning_entry,
                                  delete_learning_entry, get_learning_entry,
                                  increment_usage)

    test_file = os.path.join(os.path.dirname(__file__), "learning_memory.json")
    if os.path.exists(test_file):
        os.remove(test_file)

    # Create
    eid = save_learning_entry("kentang (abis)", "kentang", "inv_001", "Kentang",
                               "Toko Segar Jaya", "08123456789", 5.0, "kg", 15000, 0.85)
    assert_eq(len(eid) > 0, True, "crud: create returns ID")

    # Read
    entries = load_learning_memory()
    assert_eq(len(entries), 1, "crud: 1 entry after create")

    # Search
    found = search_learning_memory("kentang")
    assert_eq(len(found), 1, "crud: search finds entry")
    assert_eq(found[0]["matchedInventoryId"], "inv_001", "crud: search returns correct data")

    # Update (confirm)
    updated = update_learning_entry(eid, {"confirmedByUser": True})
    assert_eq(updated, True, "crud: update succeeds")
    entry = get_learning_entry(eid)
    assert_eq(entry["confirmedByUser"], True, "crud: confirmedByUser=True")

    # Increment usage
    inc = increment_usage(eid)
    assert_eq(inc, True, "crud: increment usage succeeds")
    entry2 = get_learning_entry(eid)
    assert_eq(entry2["usageCount"], 2, "crud: usageCount incremented to 2")

    # Delete
    deleted = delete_learning_entry(eid)
    assert_eq(deleted, True, "crud: delete succeeds")
    assert_eq(len(load_learning_memory()), 0, "crud: empty after delete")

    # Cleanup
    if os.path.exists(test_file):
        os.remove(test_file)

    print()


async def test_callback_keyboard():
    """Test keyboard builders return valid InlineKeyboardMarkup."""
    from callback_manager import build_marketlist_keyboard, build_item_edit_keyboard, build_supplier_picker
    from telegram import InlineKeyboardMarkup

    kb = build_marketlist_keyboard("test_entry", 3)
    assert_eq(isinstance(kb, InlineKeyboardMarkup), True, "keyboard: main keyboard is valid")
    # Rows: confirm row + 3 item rows (each: edit + delete) + bottom row (add + regen) = 5 rows
    assert_eq(len(kb.inline_keyboard), 5, "keyboard: 5 rows (confirm + 3 items + bottom)")

    kb2 = build_item_edit_keyboard("test_entry", 0, "kentang")
    assert_eq(isinstance(kb2, InlineKeyboardMarkup), True, "keyboard: item edit keyboard valid")

    suppliers = [{"_id": "s1", "name": "Toko A", "phone": "123"},
                 {"_id": "s2", "name": "Toko B", "phone": "456"}]
    kb3 = build_supplier_picker("test_entry", 0, suppliers)
    assert_eq(isinstance(kb3, InlineKeyboardMarkup), True, "keyboard: supplier picker valid")

    print()


async def test_partial_match():
    """Test partial match in output — unmatched items get ⚠️ indicator."""
    from marketlist import format_merchant_marketlist

    groups = [{"supplier_name": "Toko", "supplier_phone": "", "items": [
        {"name": "Kentang", "qty": 3, "unit": "kg", "price": 15000, "subtotal": 45000},
    ], "subtotal": 45000}]

    # With unmatched items
    text = format_merchant_marketlist(groups, 45000, timestamp="test", items_count=2,
                                      unmatched_items=["barang_aneh", "bahan_xyz"])
    assert_eq("⚠️" in text, True, "partial: shows warning emoji")
    assert_eq("barang_aneh" in text, True, "partial: shows unmatched name")
    assert_eq("bahan_xyz" in text, True, "partial: shows second unmatched name")

    # Without unmatched items — no ⚠️
    text2 = format_merchant_marketlist(groups, 45000, timestamp="test", items_count=1)
    assert_eq("⚠️" in text2, False, "partial: no warning when all matched")

    print()


# ── Main ────────────────────────────────────────────────────────

async def main():
    global passed, failed
    print("=" * 50)
    print("🧪 Yumi Purchasing — Marketlist Test Suite")
    print("=" * 50)
    print()

    tests = [
        ("Parse marketlist text", test_parse_marketlist_text),
        ("Batch fuzzy match", test_match_marketlist),
        ("Merchant grouping", test_group_by_merchant),
        ("Format merchant output", test_format_merchant_marketlist),
        ("Buy quantity calculation", test_calc_buy_qty),
        ("Recalculate & remove", test_recalculate_and_remove),
        ("Full pipeline", test_process_input_marketlist),
        ("Learning memory CRUD", test_learning_memory_crud),
        ("Callback keyboard", test_callback_keyboard),
        ("Partial match indicator", test_partial_match),
    ]

    for name, fn in tests:
        print(f"📋 {name}")
        try:
            await fn()
        except Exception as e:
            global failed
            failed += 1
            print(f"  ❌ UNEXPECTED ERROR: {e}")
            import traceback
            traceback.print_exc()
        print()

    print("=" * 50)
    total = passed + failed
    print(f"📊 Results: {passed}/{total} passed, {failed} failed")
    print("=" * 50)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
