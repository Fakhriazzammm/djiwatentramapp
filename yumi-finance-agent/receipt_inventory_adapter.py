"""Opt-in persistence adapter for expense receipts and inventory links.

This module intentionally does not mutate stock. It stores immutable receipt
metadata, parsed items, and reviewable expense-to-inventory candidates. Stock
posting remains behind the typed database RPC.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable


@dataclass(frozen=True)
class ReceiptItemCandidate:
    item_key: str
    raw_name: str
    normalized_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    unit_price: float | None = None
    line_total: float | None = None
    inventory_source_id: str | None = None
    confidence: float | None = None
    review_status: str = "parsed"
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ReceiptPersistenceInput:
    financial_transaction_source_id: str
    storage_path: str | None = None
    receipt_image_url: str | None = None
    file_hash: str | None = None
    merchant_name: str | None = None
    receipt_date: float | None = None
    receipt_total: float | None = None
    currency: str = "IDR"
    ocr_status: str = "parsed"
    ocr_provider: str | None = None
    ocr_model: str | None = None
    ocr_version: str | None = None
    ocr_raw: dict[str, Any] = field(default_factory=dict)
    redacted_preview_path: str | None = None
    items: tuple[ReceiptItemCandidate, ...] = ()


def stable_id(prefix: str, *parts: str) -> str:
    """Create a deterministic, non-secret source id for safe retries."""
    value = "\x1f".join((part or "").strip() for part in parts)
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:32]}"


def build_receipt_payload(data: ReceiptPersistenceInput) -> dict[str, Any]:
    receipt_id = stable_id("receipt", data.financial_transaction_source_id)
    return {
        "source_id": receipt_id,
        "financial_transaction_source_id": data.financial_transaction_source_id,
        "storage_path": data.storage_path,
        "receipt_image_url": data.receipt_image_url,
        "file_hash": data.file_hash,
        "merchant_name": data.merchant_name,
        "receipt_date": data.receipt_date,
        "receipt_total": data.receipt_total,
        "currency": data.currency,
        "ocr_status": data.ocr_status,
        "ocr_provider": data.ocr_provider,
        "ocr_model": data.ocr_model,
        "ocr_version": data.ocr_version,
        "ocr_raw": data.ocr_raw,
        "redacted_preview_path": data.redacted_preview_path,
    }


def build_item_payloads(data: ReceiptPersistenceInput) -> list[dict[str, Any]]:
    receipt_id = stable_id("receipt", data.financial_transaction_source_id)
    payloads: list[dict[str, Any]] = []
    for index, item in enumerate(data.items):
        item_id = stable_id("receipt_item", data.financial_transaction_source_id, item.item_key)
        link_id = stable_id("expense_link", data.financial_transaction_source_id, item.item_key)
        payloads.append({
            "receipt": {
                "source_id": item_id,
                "receipt_source_id": receipt_id,
                "item_index": index,
                "raw_name": item.raw_name,
                "normalized_name": item.normalized_name,
                "quantity": item.quantity,
                "unit": item.unit,
                "unit_price": item.unit_price,
                "line_total": item.line_total,
                "inventory_link_id": link_id,
                "parse_confidence": item.confidence,
                "review_status": item.review_status,
                "raw": item.raw,
            },
            "link": {
                "source_id": link_id,
                "financial_transaction_source_id": data.financial_transaction_source_id,
                "expense_item_key": item.item_key,
                "inventory_source_id": item.inventory_source_id,
                "raw_name": item.raw_name,
                "quantity": item.quantity,
                "unit": item.unit,
                "price": item.unit_price,
                "line_total": item.line_total,
                "match_method": "candidate" if item.inventory_source_id else "pending",
                "confidence": item.confidence,
                "status": "approved" if item.inventory_source_id and (item.confidence or 0) >= 90 else "pending",
                "idempotency_key": link_id,
                "raw": item.raw,
            },
        })
    return payloads


class ReceiptInventoryAdapter:
    """REST adapter; callers explicitly opt in by invoking ``persist``."""

    def __init__(self, supabase_url: str, service_role_key: str, post: Callable[..., Awaitable[Any]] | None = None):
        self.supabase_url = supabase_url.rstrip("/")
        self.service_role_key = service_role_key
        self._post_override = post

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
            "Accept-Profile": "pos",
            "Content-Profile": "pos",
            "Prefer": "resolution=merge-duplicates,return=representation",
        }

    async def _post(self, table: str, payload: dict[str, Any]) -> Any:
        if self._post_override:
            return await self._post_override(table, payload, self._headers())
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{self.supabase_url}/rest/v1/{table}?on_conflict=source_id",
                headers=self._headers(),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def persist(self, data: ReceiptPersistenceInput) -> dict[str, Any]:
        receipt = await self._post("expense_receipt_documents", build_receipt_payload(data))
        item_results = []
        link_results = []
        for payload in build_item_payloads(data):
            item_results.append(await self._post("expense_receipt_items", payload["receipt"]))
            link_results.append(await self._post("expense_inventory_links", payload["link"]))
        return {
            "receipt_id": stable_id("receipt", data.financial_transaction_source_id),
            "receipt": receipt,
            "items": item_results,
            "links": link_results,
        }
