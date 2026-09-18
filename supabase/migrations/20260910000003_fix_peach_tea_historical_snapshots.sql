-- Correct historical product-name snapshots after the catalog typo fix.
-- Only the literal display name changes; amounts, IDs, and order history remain untouched.
UPDATE pos.order_items
SET product_name = 'Peach Tea'
WHERE product_name = 'Pecah Tea';

UPDATE pos.order_status
SET items = replace(items::text, 'Pecah Tea', 'Peach Tea')::jsonb,
    completed_items = replace(completed_items::text, 'Pecah Tea', 'Peach Tea')::jsonb
WHERE items::text LIKE '%Pecah Tea%'
   OR completed_items::text LIKE '%Pecah Tea%';

UPDATE pos.orders
SET raw = CASE WHEN raw::text LIKE '%Pecah Tea%' THEN replace(raw::text, 'Pecah Tea', 'Peach Tea')::jsonb ELSE raw END,
    receipt_meta = CASE WHEN receipt_meta::text LIKE '%Pecah Tea%' THEN replace(receipt_meta::text, 'Pecah Tea', 'Peach Tea')::jsonb ELSE receipt_meta END,
    payment_gateway = CASE WHEN payment_gateway::text LIKE '%Pecah Tea%' THEN replace(payment_gateway::text, 'Pecah Tea', 'Peach Tea')::jsonb ELSE payment_gateway END
WHERE raw::text LIKE '%Pecah Tea%'
   OR receipt_meta::text LIKE '%Pecah Tea%'
   OR payment_gateway::text LIKE '%Pecah Tea%';
