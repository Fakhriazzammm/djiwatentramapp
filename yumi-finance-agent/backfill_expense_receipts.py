#!/usr/bin/env python3
"""Backfill legacy Finance receipt metadata into receipt projection tables.

Dry-run by default. Use --apply explicitly after reviewing the candidate count.
The operation is idempotent because receipt/item/link ids are deterministic.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any

import httpx

from receipt_inventory_adapter import (
    ReceiptInventoryAdapter,
    ReceiptItemCandidate,
    ReceiptPersistenceInput,
)


def parse_items(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    items = metadata.get("scanItems") or []
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except json.JSONDecodeError:
            return []
    return items if isinstance(items, list) else []


def build_input(row: dict[str, Any]) -> ReceiptPersistenceInput | None:
    metadata = row.get("metadata") or {}
    if not isinstance(metadata, dict):
        return None
    items = parse_items(metadata)
    details = metadata.get("receiptDetails") or {}
    has_receipt_evidence = bool(
        items or details or metadata.get("receipt_image_url") or metadata.get("receipt_number")
    )
    if not has_receipt_evidence:
        return None

    candidates = []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        quantity = item.get("quantity", item.get("qty"))
        price = item.get("price", item.get("unitPrice", 0))
        subtotal = item.get("total", item.get("subtotal"))
        candidates.append(ReceiptItemCandidate(
            item_key=str(item.get("ocrItemId") or item.get("ocr_item_id") or index),
            raw_name=str(item.get("rawName") or item.get("name") or ""),
            normalized_name=item.get("name") or None,
            quantity=float(quantity) if quantity not in (None, "") else None,
            unit=item.get("unit") or None,
            unit_price=float(price or 0),
            line_total=float(subtotal) if subtotal not in (None, "") else None,
            raw=item,
        ))

    return ReceiptPersistenceInput(
        financial_transaction_source_id=str(row["source_id"]),
        merchant_name=details.get("merchantName") or row.get("merchant") or None,
        receipt_date=row.get("tx_date"),
        receipt_total=float(row.get("amount") or 0),
        currency="IDR",
        ocr_status="parsed" if metadata.get("ocr") else "manual",
        ocr_provider="legacy",
        ocr_raw={"legacyMetadata": metadata},
        receipt_image_url=metadata.get("receipt_image_url") or None,
        items=tuple(candidates),
    )


async def fetch_expenses(url: str, key: str, limit: int) -> list[dict[str, Any]]:
    base_headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "pos"}
    params = {
        "select": "source_id,amount,merchant,tx_date,metadata",
        "tx_type": "eq.expense",
        "order": "creation_time.asc",
    }
    rows: list[dict[str, Any]] = []
    page_size = min(1000, max(1, limit))
    async with httpx.AsyncClient(timeout=30) as client:
        for offset in range(0, limit, page_size):
            end = min(offset + page_size, limit) - 1
            headers = {**base_headers, "Range": f"{offset}-{end}"}
            response = await client.get(
                f"{url.rstrip('/')}/rest/v1/financial_transactions",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            page = response.json()
            if not page:
                break
            rows.extend(page)
            if len(page) < page_size:
                break
    return rows


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write projection rows")
    parser.add_argument("--limit", type=int, default=2000)
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    rows = await fetch_expenses(url, key, args.limit)
    candidates = [item for row in rows if (item := build_input(row)) is not None]
    item_count = sum(len(item.items) for item in candidates)
    print(json.dumps({"scanned": len(rows), "receipts": len(candidates), "items": item_count, "apply": args.apply}))

    if not args.apply:
        return 0

    adapter = ReceiptInventoryAdapter(url, key)
    for index, item in enumerate(candidates, 1):
        await adapter.persist(item)
        if index % 50 == 0:
            print(json.dumps({"applied": index, "total": len(candidates)}))
    print(json.dumps({"applied": len(candidates), "items": item_count}))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
