-- === Best Sellers: merge duplikat per produk + exclude Air Mineral ===
-- Masalah: order_items menyimpan nama produk dengan variasi spasi
-- (mis. 'Tentrem Koffie Classic ' vs 'Tentrem Koffie Classic') untuk
-- product_source_id yang SAMA → view lama (group by id + nama) memecah
-- menjadi 2 baris.
--
-- Fix: group by product_source_id SAJA; nama pakai kanonik dari
-- pos.products (fallback trim nama order_items); total_sold dijumlahkan
-- lintas variasi nama. Air Mineral tetap dieksklusi (by nama pattern).

CREATE OR REPLACE VIEW public.pos_best_sellers AS
SELECT
  oi.product_source_id AS product_id,
  COALESCE(NULLIF(p.name, ''), max(trim(oi.product_name))) AS product_name,
  SUM(oi.quantity)::bigint AS total_sold,
  COUNT(DISTINCT o.source_id)::bigint AS order_count
FROM pos.order_items oi
JOIN pos.orders o ON o.source_id = oi.order_source_id
LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
WHERE o.status IN ('paid', 'completed')
  AND oi.status IS DISTINCT FROM 'cancelled'
  AND lower(oi.product_name) NOT LIKE 'air mineral%'
GROUP BY oi.product_source_id, p.name
ORDER BY total_sold DESC;

GRANT SELECT ON public.pos_best_sellers TO anon, authenticated;
