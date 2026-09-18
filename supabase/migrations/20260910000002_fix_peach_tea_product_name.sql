-- Correct the catalog typo without changing historical order-item snapshots.
UPDATE pos.products
SET name = 'Peach Tea'
WHERE source_id = 'jh7fghge26tc733qy68r57cwcd821j9y'
  AND name = 'Pecah Tea';
