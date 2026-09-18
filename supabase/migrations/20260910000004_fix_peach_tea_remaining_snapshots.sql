-- Correct remaining historical text snapshots found by the global catalog-name audit.
UPDATE pos.order_status
SET base_text = replace(base_text, 'Pecah Tea', 'Peach Tea')
WHERE base_text LIKE '%Pecah Tea%';

UPDATE pos.order_items
SET raw = replace(raw::text, 'Pecah Tea', 'Peach Tea')::jsonb
WHERE raw::text LIKE '%Pecah Tea%';
