import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from item_normalization import expand_item_alias, load_aliases_from_db
from item_identity import variant_signature

class InventoryIdentityTests(unittest.TestCase):
    def test_quantity_and_unit_are_part_of_identity(self):
        self.assertNotEqual(variant_signature('Sapi cincang 200 gram'), variant_signature('Sapi cincang 500 gram'))
        self.assertNotEqual(variant_signature('Susu 1 liter'), variant_signature('Susu 1 botol'))
        self.assertNotEqual(variant_signature('Sosis 10 pcs'), variant_signature('Sosis'))
        self.assertEqual(variant_signature('Sapi 200 gr'), variant_signature('Sapi 200 gram'))

    def test_duplicate_alias_is_not_resolved_to_last_row(self):
        load_aliases_from_db([
            {'ingredient_name': 'Beans Robusta', 'aliases': ['Robusta']},
            {'ingredient_name': 'Robusta Beans', 'aliases': ['Robusta']},
        ])
        self.assertEqual(expand_item_alias('Robusta'), ('Robusta', ''))

    def test_alias_cannot_strip_size(self):
        load_aliases_from_db([{'ingredient_name': 'Susu Segar', 'aliases': ['FM GF']}])
        self.assertEqual(expand_item_alias('FM GF 1L'), ('FM GF 1L', ''))
        self.assertEqual(expand_item_alias('FM GF'), ('Susu Segar', 'FM GF'))

    def test_same_name_in_two_inventory_rows_is_ambiguous(self):
        from item_normalization import ambiguous_inventory_alias
        load_aliases_from_db([
            {'ingredient_name': 'Gula', 'aliases': []},
            {'ingredient_name': 'Gula', 'aliases': []},
        ])
        self.assertTrue(ambiguous_inventory_alias('Gula'))

if __name__ == '__main__':
    unittest.main()

class InventoryMatchingTests(unittest.IsolatedAsyncioTestCase):
    async def test_receipt_candidates_preserve_raw_name_and_need_review(self):
        from inventory import InventoryManager
        from receipt_inventory_adapter import classify_receipt_items, build_item_payloads, ReceiptPersistenceInput
        load_aliases_from_db([])
        manager = InventoryManager('', '', '')
        items = [{'name': 'Sapi Cincang', 'raw_name': 'Sapi Cincang 200 gram', 'qty': 2, 'price': 10}]
        candidates = await classify_receipt_items(items, manager, [{'_id': '1', 'ingredientName': 'Sapi Cincang 200 gram'}])
        payload = build_item_payloads(ReceiptPersistenceInput(financial_transaction_source_id='tx1', items=candidates))[0]
        self.assertEqual(payload['receipt']['raw_name'], 'Sapi Cincang 200 gram')
        self.assertEqual(payload['link']['inventory_source_id'], '1')
        self.assertEqual(payload['link']['status'], 'pending')

    async def test_retry_does_not_overwrite_reviewed_receipt_items(self):
        from receipt_inventory_adapter import ReceiptInventoryAdapter, ReceiptPersistenceInput, ReceiptItemCandidate
        calls = []
        async def post(table, payload, headers):
            calls.append((table, headers['Prefer']))
            return []
        adapter = ReceiptInventoryAdapter('', '', post=post)
        await adapter.persist(ReceiptPersistenceInput(financial_transaction_source_id='tx1', items=(ReceiptItemCandidate(item_key='0', raw_name='Gold Label'),)))
        self.assertEqual(calls[1][1], 'resolution=ignore-duplicates,return=representation')
        self.assertEqual(calls[2][1], 'resolution=ignore-duplicates,return=representation')

    async def test_stock_mode_failure_and_manual_fail_closed(self):
        from unittest.mock import patch
        import httpx
        from inventory import InventoryManager
        manager = InventoryManager('https://example.test', 'test', 'test')
        client_type = httpx.AsyncClient
        for payload, expected in [({'mode': 'manual'}, False), ({'mode': 'integrated'}, True), ({}, False)]:
            transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
            with patch('inventory.httpx.AsyncClient', lambda **kwargs: client_type(transport=transport)):
                self.assertEqual(await manager.integrated_stock_enabled(), expected)
    async def test_exact_name_and_unique_alias_can_match(self):
        from inventory import InventoryManager, MIN_SCORE_AUTO, _find_inventory_match
        manager = InventoryManager('', '', '')
        load_aliases_from_db([{'ingredient_name': 'Susu Segar', 'aliases': ['FM GF']}])
        rows = [{'_id': '1', 'ingredientName': 'Susu Segar'}]
        for name in ('Susu Segar', 'FM GF'):
            _, score = await manager.fuzzy_match_item(name, rows)
            self.assertGreaterEqual(score, MIN_SCORE_AUTO)
            self.assertGreaterEqual(_find_inventory_match(name, rows)['score'], MIN_SCORE_AUTO)

    async def test_bulk_match_does_not_auto_match_a_different_variant(self):
        from inventory import _find_inventory_match, MIN_SCORE_AUTO
        load_aliases_from_db([])
        rows = [{'_id': '1', 'ingredientName': 'Sapi Cincang 500 gram'}]
        result = _find_inventory_match('Sapi Cincang 200 gram', rows)
        self.assertTrue(result is None or result['score'] < MIN_SCORE_AUTO)
    async def test_size_mismatch_and_unspecified_size_do_not_auto_match(self):
        from inventory import InventoryManager, MIN_SCORE_AUTO
        manager = InventoryManager('', '', '')
        load_aliases_from_db([])
        rows = [{'_id': '1', 'ingredientName': 'Sapi Cincang 500 gram'}]
        _, different = await manager.fuzzy_match_item('Sapi Cincang 200 gram', rows)
        _, unspecified = await manager.fuzzy_match_item('Sapi Cincang', rows)
        self.assertLess(different, MIN_SCORE_AUTO)
        self.assertLess(unspecified, MIN_SCORE_AUTO)

    async def test_fuzzy_or_ambiguous_name_requires_review(self):
        from inventory import InventoryManager, MIN_SCORE_AUTO
        manager = InventoryManager('', '', '')
        load_aliases_from_db([{'ingredient_name': 'Beans Robusta', 'aliases': ['Robusta']}, {'ingredient_name': 'Robusta Beans', 'aliases': ['Robusta']}])
        rows = [{'_id': '1', 'ingredientName': 'Beans Robusta'}, {'_id': '2', 'ingredientName': 'Robusta Beans'}]
        _, score = await manager.fuzzy_match_item('Robusta', rows)
        self.assertLess(score, MIN_SCORE_AUTO)
