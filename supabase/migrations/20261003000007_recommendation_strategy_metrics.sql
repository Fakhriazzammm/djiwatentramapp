CREATE OR REPLACE VIEW pos.product_recommendation_strategy_metrics AS
SELECT
  e.strategy,
  e.placement,
  min(e.occurred_at) AS first_event_at,
  max(e.occurred_at) AS last_event_at,
  count(*) FILTER (WHERE e.event_type = 'impression')::bigint AS impression_count,
  count(*) FILTER (WHERE e.event_type = 'click')::bigint AS click_count,
  count(*) FILTER (WHERE e.event_type = 'add_to_cart')::bigint AS add_to_cart_count,
  count(*) FILTER (WHERE e.event_type = 'purchase')::bigint AS purchase_count,
  count(*) FILTER (WHERE e.event_type = 'dismiss')::bigint AS dismiss_count,
  count(*) FILTER (WHERE e.event_type = 'not_interested')::bigint AS not_interested_count,
  round(100.0 * count(*) FILTER (WHERE e.event_type = 'click') / NULLIF(count(*) FILTER (WHERE e.event_type = 'impression'), 0), 2) AS click_through_rate_pct,
  round(100.0 * count(*) FILTER (WHERE e.event_type = 'add_to_cart') / NULLIF(count(*) FILTER (WHERE e.event_type = 'click'), 0), 2) AS click_to_cart_rate_pct,
  round(100.0 * count(*) FILTER (WHERE e.event_type = 'purchase') / NULLIF(count(*) FILTER (WHERE e.event_type = 'add_to_cart'), 0), 2) AS cart_to_purchase_rate_pct,
  round(100.0 * count(*) FILTER (WHERE e.event_type = 'not_interested') / NULLIF(count(*) FILTER (WHERE e.event_type = 'impression'), 0), 2) AS not_interested_rate_pct,
  count(DISTINCT e.session_id)::bigint AS unique_sessions,
  count(DISTINCT e.customer_source_id)::bigint AS unique_customers
FROM pos.product_recommendation_events AS e
GROUP BY e.strategy, e.placement;

REVOKE ALL ON pos.product_recommendation_strategy_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON pos.product_recommendation_strategy_metrics TO service_role;
