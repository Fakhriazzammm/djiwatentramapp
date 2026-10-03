CREATE OR REPLACE VIEW public.pos_best_sellers_period AS
WITH periods AS (
  SELECT 'today'::text AS period_key, extract(epoch FROM (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')) * 1000 AS start_ms, extract(epoch FROM now()) * 1000 AS end_ms
  UNION ALL SELECT 'week', extract(epoch FROM (now() AT TIME ZONE 'Asia/Jakarta' - interval '7 days') AT TIME ZONE 'Asia/Jakarta') * 1000, extract(epoch FROM now()) * 1000
  UNION ALL SELECT 'previous_week', extract(epoch FROM (now() AT TIME ZONE 'Asia/Jakarta' - interval '14 days') AT TIME ZONE 'Asia/Jakarta') * 1000, extract(epoch FROM (now() AT TIME ZONE 'Asia/Jakarta' - interval '7 days') AT TIME ZONE 'Asia/Jakarta') * 1000
  UNION ALL SELECT 'month', extract(epoch FROM (date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')) * 1000, extract(epoch FROM now()) * 1000
  UNION ALL SELECT 'all', 0, extract(epoch FROM now()) * 1000
)
SELECT p.period_key, oi.product_source_id AS product_id, oi.product_name, SUM(oi.quantity)::bigint AS total_sold, COUNT(DISTINCT o.source_id)::bigint AS order_count
FROM periods p JOIN pos.order_items oi ON true JOIN pos.orders o ON o.source_id=oi.order_source_id
WHERE o.status IN ('paid','completed') AND oi.status IS DISTINCT FROM 'cancelled' AND o.created_at >= p.start_ms AND o.created_at < p.end_ms
GROUP BY p.period_key, oi.product_source_id, oi.product_name;
GRANT SELECT ON public.pos_best_sellers_period TO anon, authenticated;
