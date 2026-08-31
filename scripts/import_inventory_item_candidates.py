#!/usr/bin/env python3
"""Import receipt/web research into the additive inventory candidate staging table.

Default mode is dry-run. Use --apply only after the migration exists on the
intended Supabase runtime. This script never updates pos.inventory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_INPUT = Path(
    "/opt/djiwatentramapp/.hermes/plans/"
    "2026-08-26_receipt-item-web-research-small-batches.json"
)


def candidate_id(name: str) -> str:
    digest = hashlib.sha256(name.strip().casefold().encode("utf-8")).hexdigest()[:32]
    return f"receipt_candidate_{digest}"


def load_candidates(path: Path) -> list[dict]:
    records = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("Input harus berupa JSON array")

    result: list[dict] = []
    seen: set[str] = set()
    for row in records:
        name = str(row.get("normalized_name") or "").strip()
        key = name.casefold()
        if not name:
            raise ValueError("Ditemukan normalized_name kosong")
        if key in seen:
            raise ValueError(f"Duplikasi normalized_name: {name}")
        seen.add(key)
        sources = row.get("sources") or []
        result.append(
            {
                "source_id": candidate_id(name),
                "normalized_name": name,
                "raw_variants": row.get("variants") or [],
                "mention_count": int(row.get("mentions") or 0),
                "source_urls": sources,
                "match_status": "REVIEW",
                "confidence": "LOW",
                "review_reason": (
                    "Sumber kandidat web; perlu validasi nama, satuan, dan kemasan."
                ),
                "raw": row,
            }
        )
    return result


def post_batches(rows: list[dict], base_url: str, service_key: str) -> None:
    endpoint = base_url.rstrip("/") + "/rest/v1/inventory_item_candidates"
    for start in range(0, len(rows), 100):
        batch = rows[start : start + 100]
        request = urllib.request.Request(
            endpoint + "?on_conflict=normalized_name_key",
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError(f"HTTP {response.status}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")[:500]
            raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
        print(f"uploaded {min(start + 100, len(rows))}/{len(rows)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    rows = load_candidates(args.input)
    print(f"validated_records={len(rows)} unique_names={len({r['normalized_name'].casefold() for r in rows})}")
    print(f"found_sources={sum(bool(r['source_urls']) for r in rows)}")
    print(f"review={sum(not r['source_urls'] for r in rows)}")

    if not args.apply:
        print("DRY_RUN: tidak ada database yang diubah")
        return 0

    base_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        print("ERROR: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di env", file=sys.stderr)
        return 2
    post_batches(rows, base_url, service_key)
    print("APPLIED: hanya pos.inventory_item_candidates yang di-upsert")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
