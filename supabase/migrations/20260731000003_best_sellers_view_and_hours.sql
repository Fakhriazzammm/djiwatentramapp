-- === Best Sellers View + Jam Operasional ===
-- 1. View best seller untuk landing customer: agregat qty order_items
--    dari order paid/completed (tidak termasuk item dibatalkan).
-- 2. Seed jam operasional (openingTime/closingTime) di site_settings
--    — hanya diisi jika belum ada (idempotent), bisa diubah dari admin.

-- 1. View best sellers (pola public.pos_* seperti pos_orders/pos_products)
CREATE OR REPLACE VIEW public.pos_best_sellers AS
SELECT
  oi.product_source_id AS product_id,
  oi.product_name AS product_name,
  SUM(oi.quantity)::bigint AS total_sold,
  COUNT(DISTINCT o.source_id)::bigint AS order_count
FROM pos.order_items oi
JOIN pos.orders o ON o.source_id = oi.order_source_id
WHERE o.status IN ('paid', 'completed')
  AND oi.status IS DISTINCT FROM 'cancelled'
GROUP BY oi.product_source_id, oi.product_name
ORDER BY total_sold DESC;

GRANT SELECT ON public.pos_best_sellers TO anon, authenticated;

-- 2. Seed jam operasional (default Bubur Ayam — sesuaikan dari admin)
UPDATE pos.site_settings
SET raw = jsonb_set(
  jsonb_set(raw, '{openingTime}', to_jsonb('06:00'::text), true),
  '{closingTime}', to_jsonb('14:00'::text), true
)
WHERE NOT (raw ? 'openingTime') AND NOT (raw ? 'closingTime');
