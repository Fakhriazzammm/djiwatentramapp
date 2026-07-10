"""save_pending_receipts.py — Simpan semua pending receipt dari .pending_sessions.json ke database.

Jalankan: cd /opt/djiwatentramapp/yumi-finance-agent && .venv/bin/python save_pending_receipts.py
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone, timedelta

# Setup path
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_EDGE_URL = os.getenv("SUPABASE_EDGE_URL", "").rstrip("/") or SUPABASE_URL

from finance import FinanceManager

finance = FinanceManager(
    SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY,
    f"{SUPABASE_EDGE_URL}/functions/v1/yumi-ai"
)

PENDING_FILE = os.path.join(os.path.dirname(__file__), ".pending_sessions.json")


async def main():
    if not os.path.exists(PENDING_FILE):
        print("No pending sessions file found.")
        return

    with open(PENDING_FILE) as f:
        data = json.load(f)

    receipts = data.get("receipts", {})
    if not receipts:
        print("No pending receipts.")
        return

    print(f"Found {len(receipts)} pending receipts\n")

    saved = 0
    skipped = 0
    failed = 0

    for ref_id, receipt in receipts.items():
        items = receipt.get("items", [])
        merchant = receipt.get("merchant", "").strip()
        total = receipt.get("total", 0)

        # Skip empty receipts (failed OCR)
        if not items or total <= 0:
            print(f"  ⏭️  {ref_id}: skip (no items/total=0, likely failed OCR)")
            skipped += 1
            continue

        # Calculate real total from items if receipt total is 0
        if total <= 0:
            total = sum(
                it.get("subtotal", 0) or (it.get("qty", 1) * it.get("price", 0))
                for it in items
            )

        if total <= 0:
            print(f"  ⏭️  {ref_id}: skip (total still 0)")
            skipped += 1
            continue

        desc = f"Belanja - {merchant}" if merchant else "Belanja"
        if receipt.get("receipt_number"):
            desc += f" (No. {receipt['receipt_number']})"
        if receipt.get("date"):
            desc += f" [{receipt['date']}]"

        category = receipt.get("category", "lainnya")
        date_str = receipt.get("date", "")

        item_names = [it.get("name", "?")[:20] for it in items[:5]]
        item_preview = ", ".join(item_names)
        if len(items) > 5:
            item_preview += f" +{len(items)-5} items"

        print(f"  💾 {ref_id}: {merchant or '(no merchant)'} | {len(items)} items | Rp{total:,.0f} | {item_preview}")

        try:
            result = await finance.record_transaction(
                tx_type="expense",
                amount=total,
                description=desc[:500],
                category=category,
                merchant=merchant,
                payment_method=receipt.get("payment_method", "cash"),
                receipt_date_str=date_str,
                metadata={
                    "source": "yumi_finance_agent",
                    "ocr": True,
                    "receipt_number": receipt.get("receipt_number", ""),
                    "receipt_date": date_str,
                    "receipt_image_url": receipt.get("receipt_image_url", ""),
                    "notes": receipt.get("notes", ""),
                    "item_count": len(items),
                    "scanItems": [
                        {
                            "name": it.get("name", ""),
                            "rawName": it.get("raw_name", ""),
                            "quantity": it.get("qty", 1),
                            "unit": it.get("unit", ""),
                            "price": it.get("price", 0),
                            "total": (it.get("subtotal", 0) or ((it.get("qty", 1) or 1) * (it.get("price", 0) or 0))),
                        }
                        for it in items
                    ],
                    "receiptDetails": {
                        "receiptNumber": receipt.get("receipt_number", ""),
                        "merchantName": merchant,
                        "date": date_str,
                        "tax": receipt.get("tax", 0),
                        "discount": receipt.get("discount", 0),
                        "serviceCharge": receipt.get("service_charge", 0),
                    },
                },
            )

            if result.get("success"):
                print(f"    ✅ Saved (sourceId: {result.get('sourceId', '?')[:30]}...)")
                saved += 1
            else:
                print(f"    ⚠️  Failed: {result.get('error', '?')}")
                failed += 1
        except Exception as e:
            print(f"    ❌ Error: {e}")
            failed += 1

    # Clear pending file after saving all
    if saved > 0:
        with open(PENDING_FILE, "w") as f:
            json.dump({"receipts": {}, "actions": {}}, f)
        print(f"\n✅ Saved {saved}, skipped {skipped}, failed {failed}")
        print(f"📁 Pending file cleared.")
    else:
        print(f"\n⚠️  Nothing saved. skipped={skipped}, failed={failed}")
        print(f"📁 Pending file NOT cleared.")


if __name__ == "__main__":
    asyncio.run(main())
