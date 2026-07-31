-- === Best Sellers: exclude Air Mineral + Jam Operasional 08:00-21:00 ===
-- 1. View best seller tidak lagi menyertakan Air Mineral.
--    Eksklusi by nama (ILIKE 'air mineral%') agar mencakup semua varian
--    penulisan dan semua product id (termasuk produk lama yang sudah dihapus).
-- 2. Jam operasional dikoreksi: buka 08:00, tutup 21:00 (8 pagi - 9 malam).

-- 1. View best sellers (tanpa Air Mineral)
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
  AND lower(oi.product_name) NOT LIKE 'air mineral%'
GROUP BY oi.product_source_id, oi.product_name
ORDER BY total_sold DESC;

GRANT SELECT ON public.pos_best_sellers TO anon, authenticated;

-- 2. Jam operasional: 08:00 - 21:00
UPDATE pos.site_settings
SET raw = jsonb_set(
  jsonb_set(raw, '{openingTime}', to_jsonb('08:00'::text), true),
  '{closingTime}', to_jsonb('21:00'::text), true
);
