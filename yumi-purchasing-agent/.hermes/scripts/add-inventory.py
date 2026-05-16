#!/usr/bin/env python3
"""Add missing inventory items and update their category/brand."""
import sys
import os
import json
import asyncio
import uuid

# Add the project to path
sys.path.insert(0, "/opt/djiwatentramapp/yumi-purchasing-agent")
os.chdir("/opt/djiwatentramapp/yumi-purchasing-agent")

from dotenv import load_dotenv
load_dotenv()

from inventory import InventoryManager
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

async def main():
    inventory = InventoryManager(SUPABASE_URL, SUPABASE_KEY, SERVICE_ROLE_KEY)
    
    items_to_add = [
        {"name": "Oyster Sauce (Lee Kum Kee)", "qty": 0, "unit": "ml", "price": 0},
        {"name": "Vanili Bubuk (Koepoe)", "qty": 0, "unit": "pcs", "price": 0},
        {"name": "Bawang Putih Bubuk (YOA)", "qty": 0, "unit": "gram", "price": 0},
        {"name": "Bumbu Kunci Mas", "qty": 0, "unit": "pcs", "price": 0},
        {"name": "Kamper Pedas (YOA)", "qty": 0, "unit": "pcs", "price": 0},
        {"name": "Daun Surawung", "qty": 0, "unit": "ikat", "price": 0},
    ]
    
    added_ids = {}
    print("=== Adding items to inventory ===")
    for item in items_to_add:
        try:
            result = await inventory.add_new_item(item["name"], item["qty"], item["unit"], item["price"])
            if result and result.get("_id"):
                added_ids[item["name"]] = result["_id"]
                print(f"  ✓ {item['name']} → ID: {result['_id'][:12]}...")
            else:
                print(f"  ✗ {item['name']}: no _id returned — {result}")
        except Exception as e:
            print(f"  ✗ {item['name']}: {e}")
    
    # Now PATCH to add category, brand, threshold
    print("\n=== Updating category, brand, & threshold ===")
    updates = {
        "Oyster Sauce (Lee Kum Kee)": {"category": "kitchen", "defaultBrandName": "Lee Kum Kee", "lowStockThreshold": 500, "displayUnit": "ml"},
        "Vanili Bubuk (Koepoe)": {"category": "kitchen", "defaultBrandName": "Koepoe", "lowStockThreshold": 2},
        "Bawang Putih Bubuk (YOA)": {"category": "kitchen", "defaultBrandName": "YOA", "lowStockThreshold": 100},
        "Bumbu Kunci Mas": {"category": "kitchen", "defaultBrandName": "Kunci Mas", "lowStockThreshold": 2},
        "Kamper Pedas (YOA)": {"category": "kitchen", "defaultBrandName": "YOA", "lowStockThreshold": 2},
        "Daun Surawung": {"category": "kitchen", "defaultBrandName": "", "lowStockThreshold": 3},
    }
    
    async with httpx.AsyncClient(timeout=10) as client:
        for name, inv_id in added_ids.items():
            if name in updates:
                resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{inv_id}",
                    json=updates[name],
                    headers=HEADERS,
                )
                if resp.status_code < 300:
                    print(f"  ✓ {name}: updated")
                else:
                    print(f"  ✗ {name}: PATCH failed HTTP {resp.status_code} — {resp.text[:150]}")
    
    # Also need to update the raw JSON field
    print("\n=== Updating raw JSON field ===")
    for name, inv_id in added_ids.items():
        raw = {
            "_id": inv_id,
            "ingredientName": name,
            "quantity": 0,
            "unit": next(i["unit"] for i in items_to_add if i["name"] == name),
            "displayUnit": next((i.get("displayUnit", "") for i in [updates.get(name, {})]), ""),
        }
        if name in updates:
            raw["category"] = updates[name].get("category", "kitchen")
        else:
            raw["category"] = "kitchen"
        
        # Try updating raw field
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                f"{SUPABASE_URL}/rest/v1/pos_inventory?_id=eq.{inv_id}",
                json={"raw": raw},
                headers=HEADERS,
            )
            if resp.status_code < 300:
                print(f"  ✓ {name}: raw updated")
            else:
                # Skip raw update if it fails - it's not critical
                pass
    
    # Save alias entries to learning_memory
    print("\n=== Adding alias entries ===")
    LM_FILE = "/opt/djiwatentramapp/yumi-purchasing-agent/learning_memory.json"
    with open(LM_FILE) as f:
        lm_data = json.load(f)
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    entries = lm_data.get("entries", [])
    
    alias_map = [
        ("lkk panda oystr", "LKK Panda Oyster", "Oyster Sauce (Lee Kum Kee)"),
        ("koepoe2 p vanili", "KOEPOE2 P VANILI", "Vanili Bubuk (Koepoe)"),
        ("yoa bwg pth bbk", "YOA BWG PTH BBK", "Bawang Putih Bubuk (YOA)"),
        ("kunci mas pouch", "Kunci Mas Pouch", "Bumbu Kunci Mas"),
        ("yoa kamper pdcb 5s", "YOA KAMPER PDCB 5S", "Kamper Pedas (YOA)"),
        ("surawung", "SURAWUNG", "Daun Surawung"),
    ]
    
    added = 0
    for norm_name, raw_name, inv_name in alias_map:
        inv_id = added_ids.get(inv_name)
        if not inv_id:
            print(f"  ✗ No ID for {inv_name}, skipping alias")
            continue
        
        existing = [e for e in entries if e.get("userInput") == norm_name and e.get("type") == "expense_match"]
        if existing:
            print(f"  ⏭️  Alias exists: {norm_name}")
            continue
        
        entry = {
            "id": f"auto_{norm_name[:20]}",
            "type": "expense_match",
            "userInput": norm_name,
            "parsedName": raw_name,
            "matchedInventoryId": inv_id,
            "matchedIngredientName": inv_name,
            "suggestedSupplier": "",
            "suggestedSupplierPhone": "",
            "suggestedQty": 0,
            "suggestedUnit": "",
            "suggestedPrice": 0,
            "isCorrected": False,
            "correctionType": None,
            "correctionPayload": None,
            "confirmedByUser": False,
            "confidence": 80.0,
            "usageCount": 1,
            "createdAt": now,
            "updatedAt": now,
        }
        entries.append(entry)
        added += 1
        print(f"  ✓ {norm_name} → {inv_name}")
    
    if added > 0:
        lm_data["entries"] = entries
        lm_data["version"] = lm_data.get("version", 1) + 1
        with open(LM_FILE, "w") as f:
            json.dump(lm_data, f, indent=2, ensure_ascii=False)
        print(f"\n✅ {added} alias entries saved")
    else:
        print("✅ No new aliases needed")

asyncio.run(main())
