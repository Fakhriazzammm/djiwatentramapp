import asyncio
import unittest

from receipt_inventory_adapter import (
    ReceiptInventoryAdapter,
    ReceiptItemCandidate,
    ReceiptPersistenceInput,
    build_item_payloads,
    stable_id,
)


class ReceiptInventoryAdapterTests(unittest.TestCase):
    def setUp(self):
        self.data = ReceiptPersistenceInput(
            financial_transaction_source_id="fin_123",
            merchant_name="Toko Test",
            items=(ReceiptItemCandidate(
                item_key="line-1",
                raw_name="Susu 1L",
                normalized_name="susu",
                quantity=1,
                unit="liter",
                unit_price=18000,
                line_total=18000,
                inventory_source_id="inv_susu",
                confidence=95,
            ),),
        )

    def test_ids_are_stable_and_payload_is_idempotent(self):
        first = build_item_payloads(self.data)
        second = build_item_payloads(self.data)
        self.assertEqual(first, second)
        self.assertEqual(first[0]["link"]["source_id"], first[0]["link"]["idempotency_key"])
        self.assertEqual(first[0]["link"]["status"], "approved")

    def test_persist_uses_pos_profile_and_three_upserts(self):
        calls = []

        async def fake_post(table, payload, headers):
            calls.append((table, payload, headers))
            return [{"source_id": payload["source_id"]}]

        adapter = ReceiptInventoryAdapter("https://example.test", "service-key", fake_post)
        result = asyncio.run(adapter.persist(self.data))

        self.assertEqual(result["receipt_id"], stable_id("receipt", "fin_123"))
        self.assertEqual([call[0] for call in calls], [
            "expense_receipt_documents",
            "expense_receipt_items",
            "expense_inventory_links",
        ])
        self.assertEqual(calls[0][2]["Accept-Profile"], "pos")
        self.assertEqual(calls[0][2]["Content-Profile"], "pos")
        self.assertIn("resolution=merge-duplicates", calls[0][2]["Prefer"])


if __name__ == "__main__":
    unittest.main()
