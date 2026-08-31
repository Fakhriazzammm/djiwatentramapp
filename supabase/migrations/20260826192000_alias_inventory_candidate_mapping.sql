-- Safe staging-only alias mapping.
-- Only maps a candidate when exactly one inventory row owns the alias.
-- Ambiguous aliases remain REVIEW; no inventory or transaction data is changed.

WITH eligible AS (
  SELECT c.source_id AS candidate_id,
         min(i.source_id) AS inventory_id,
         min(i.ingredient_name) AS canonical_name
  FROM pos.inventory_item_candidates c
  JOIN pos.inventory i
    ON EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(i.aliases, '[]'::jsonb)) alias_value
      WHERE lower(btrim(alias_value)) = c.normalized_name_key
    )
  WHERE c.match_status = 'REVIEW'
  GROUP BY c.source_id
  HAVING COUNT(DISTINCT i.source_id) = 1
)
UPDATE pos.inventory_item_candidates c
SET proposed_canonical_name = e.canonical_name,
    proposed_inventory_source_id = e.inventory_id,
    match_status = 'ALIAS_MATCH',
    confidence = 'MEDIUM',
    review_reason = 'Nama cocok dengan alias inventory tunggal; perlu validasi bukti produk/unit.',
    updated_at = now()
FROM eligible e
WHERE c.source_id = e.candidate_id;
