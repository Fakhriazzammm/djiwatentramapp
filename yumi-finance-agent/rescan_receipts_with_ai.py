#!/usr/bin/env python3
"""Token-bounded 9Router receipt rescan worker.

Default is dry-run. --apply stores AI run/version evidence only; it never posts
inventory. Auto-apply remains a separate deterministic step.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import os
from io import BytesIO
from typing import Any

import httpx
from PIL import Image

from receipt_inventory_adapter import stable_id
from sumopod_client import SumoPodClient

PROMPT_VERSION = "receipt-header-items-v1"
REQUESTED_FIELDS = [
    "merchant", "receipt_number", "receipt_date", "receipt_time", "payment_method",
    "subtotal", "discount", "service_charge", "tax", "total", "items",
]


def missing_fields(metadata: dict[str, Any]) -> list[str]:
    details = metadata.get("receiptDetails") or {}
    fields = []
    for key, value in (
        ("merchant", details.get("merchantName") or metadata.get("merchant")),
        ("receipt_number", details.get("receiptNumber") or metadata.get("receipt_number")),
        ("receipt_date", details.get("date") or metadata.get("receipt_date")),
        ("receipt_time", details.get("time")),
        ("subtotal", details.get("subtotal")),
        ("discount", details.get("discount")),
        ("service_charge", details.get("serviceCharge")),
        ("tax", details.get("tax")),
    ):
        if value in (None, ""):
            fields.append(key)
    if not metadata.get("scanItems"):
        fields.append("items")
    return fields


def compact_prompt(fields: list[str]) -> str:
    return (
        "Scan receipt and return ONLY compact JSON. Extract requested fields: "
        + ",".join(fields)
        + ". Include items with raw_name, normalized_name, quantity, unit, "
        "unit_price, line_total, category. Do not invent values; use null when unreadable."
    )


def image_uri(raw: bytes) -> str:
    image = Image.open(BytesIO(raw)).convert("RGB")
    image.thumbnail((1600, 1600))
    out = BytesIO()
    image.save(out, format="JPEG", quality=82, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


async def get_rows(url: str, key: str, limit: int) -> list[dict[str, Any]]:
    base_headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "pos"}
    params = {"select": "source_id,tx_date,metadata", "tx_type": "eq.expense", "order": "creation_time.asc"}
    rows: list[dict[str, Any]] = []
    page_size = min(1000, max(1, limit))
    async with httpx.AsyncClient(timeout=30) as client:
        for offset in range(0, limit, page_size):
            end = min(offset + page_size, limit) - 1
            response = await client.get(
                f"{url.rstrip('/')}/rest/v1/financial_transactions",
                headers={**base_headers, "Range": f"{offset}-{end}"},
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


async def post_run(url: str, key: str, table: str, payload: dict[str, Any]) -> None:
    headers = {
        "apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "pos",
        "Content-Profile": "pos", "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{url.rstrip('/')}/rest/v1/{table}?on_conflict=source_id", headers=headers, json=payload)
        response.raise_for_status()


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    rows = await get_rows(url, key, args.limit)
    candidates = []
    for row in rows:
        metadata = row.get("metadata") or {}
        if not isinstance(metadata, dict):
            continue
        image_url = metadata.get("receipt_image_url")
        fields = missing_fields(metadata)
        if image_url and fields:
            candidates.append((row, fields, image_url))
    print(json.dumps({"scanned": len(rows), "candidates": len(candidates), "apply": args.apply, "maxCalls": len(candidates)}))
    if not args.apply:
        return 0

    model = os.getenv("NINEROUTER_VISION_MODEL") or os.getenv("NINEROUTER_TEXT_MODEL", "ag/gemini-3-flash")
    client = SumoPodClient(os.getenv("SUMOPOD_API_KEY", ""), base_url=os.getenv("NINEROUTER_BASE_URL", "http://127.0.0.1:20128/v1"))
    async with httpx.AsyncClient(timeout=30) as http:
        for index, (row, fields, image_url) in enumerate(candidates, 1):
            receipt_id = stable_id("receipt", str(row["source_id"]))
            fingerprint = hashlib.sha256((receipt_id + model + PROMPT_VERSION + ",".join(fields) + image_url).encode()).hexdigest()
            run_id = stable_id("ai_run", receipt_id, fingerprint)
            try:
                image_response = await http.get(image_url)
                image_response.raise_for_status()
                result = await client.vision_json(
                    image_base64_uri=image_uri(image_response.content),
                    model=model,
                    prompt_override=compact_prompt(fields),
                    max_tokens=2048,
                    timeout=90,
                )
                payload = {
                    "source_id": run_id, "receipt_source_id": receipt_id, "input_fingerprint": fingerprint,
                    "requested_fields": fields, "provider": "9router", "model": model,
                    "prompt_version": PROMPT_VERSION, "status": "completed" if result.get("success") else "failed",
                    "result": result.get("data", result), "error_message": None if result.get("success") else str(result.get("error", "unknown")),
                }
            except Exception as exc:
                payload = {
                    "source_id": run_id, "receipt_source_id": receipt_id, "input_fingerprint": fingerprint,
                    "requested_fields": fields, "provider": "9router", "model": model,
                    "prompt_version": PROMPT_VERSION, "status": "failed", "result": {}, "error_message": str(exc),
                }
            await post_run(url, key, "expense_receipt_ai_runs", payload)
            if index % 10 == 0:
                print(json.dumps({"processed": index, "total": len(candidates)}))
    print(json.dumps({"processed": len(candidates)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
