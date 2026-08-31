-- Safe staging-only mapping for exact inventory names.
-- Does not modify pos.inventory or historical transactions.
-- Fuzzy/alias mapping remains REVIEW until separately approved.

UPDATE pos.inventory_item_candidates c
SET proposed_canonical_name = i.ingredient_name,
    proposed_inventory_source_id = i.source_id,
    match_status = 'EXACT_MATCH',
    confidence = 'HIGH',
    review_reason = 'Nama normalized sama persis dengan ingredient_name inventory.',
    updated_at = now()
FROM pos.inventory i
WHERE lower(btrim(i.ingredient_name)) = c.normalized_name_key
  AND c.match_status = 'REVIEW';
