-- 500 Kopi Tasik: public board read models, click dedupe, and configurable IDR rules.
-- Additive only. Today = rolling 24 hours; Daily = UTC calendar day.

ALTER TABLE pos.coffee_passport_bid_config
  ADD COLUMN IF NOT EXISTS minimum_new_bid_amount bigint NOT NULL DEFAULT 100000 CHECK (minimum_new_bid_amount > 0),
  ADD COLUMN IF NOT EXISTS minimum_top_increment bigint NOT NULL DEFAULT 50000 CHECK (minimum_top_increment > 0),
  ADD COLUMN IF NOT EXISTS minimum_existing_increment bigint NOT NULL DEFAULT 10000 CHECK (minimum_existing_increment > 0),
  ADD COLUMN IF NOT EXISTS refund_policy text NOT NULL DEFAULT 'final_non_refundable' CHECK (refund_policy IN ('final_non_refundable', 'manual_review'));

UPDATE pos.coffee_passport_bid_config
SET minimum_new_bid_amount = GREATEST(minimum_new_bid_amount, 100000),
    minimum_top_increment = GREATEST(minimum_top_increment, 50000),
    minimum_existing_increment = GREATEST(minimum_existing_increment, 10000),
    maximum_bid_amount = LEAST(maximum_bid_amount, 999999999)
WHERE config_id = 'default';

CREATE OR REPLACE FUNCTION pos.coffee_passport_record_click(p_shop_id text, p_visitor_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE inserted_count integer;
BEGIN
  IF p_shop_id IS NULL OR p_visitor_key IS NULL OR length(trim(p_visitor_key)) < 16 THEN
    RAISE EXCEPTION 'Visitor key tidak valid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pos.coffee_passport_shops
    WHERE shop_id = p_shop_id AND is_active = true AND verification_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Kedai tidak ditemukan';
  END IF;
  INSERT INTO pos.coffee_passport_bid_clicks(click_id, shop_id, visitor_key, click_day)
  VALUES ('clk_' || replace(gen_random_uuid()::text, '-', ''), p_shop_id, left(trim(p_visitor_key), 160), (now() AT TIME ZONE 'UTC')::date)
  ON CONFLICT (shop_id, visitor_key, click_day) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN jsonb_build_object('recorded', inserted_count = 1);
END;
$$;

CREATE OR REPLACE VIEW public.pos_coffee_passport_board_view AS
WITH ranked AS (
  SELECT s.shop_id, s.name, s.slug, s.area, s.description, s.cover_url, s.google_maps_url,
         s.current_bid_amount, s.current_bid_paid_sequence, s.created_at, s.updated_at,
         row_number() OVER (ORDER BY s.current_bid_amount DESC, s.current_bid_paid_sequence ASC NULLS LAST, s.created_at ASC, s.shop_id ASC)::integer AS overall_rank,
         row_number() OVER (PARTITION BY COALESCE(NULLIF(trim(s.area), ''), 'Lainnya') ORDER BY s.current_bid_amount DESC, s.current_bid_paid_sequence ASC NULLS LAST, s.created_at ASC, s.shop_id ASC)::integer AS category_rank
  FROM pos.coffee_passport_shops s
  WHERE s.is_active = true AND s.verification_status = 'approved'
), metrics AS (
  SELECT r.*, count(DISTINCT c.click_id)::integer AS clicks,
         count(DISTINCT c.click_id) FILTER (WHERE c.created_at >= now() - interval '24 hours')::integer AS today_clicks
  FROM ranked r LEFT JOIN pos.coffee_passport_bid_clicks c ON c.shop_id = r.shop_id
  GROUP BY r.shop_id, r.name, r.slug, r.area, r.description, r.cover_url, r.google_maps_url,
           r.current_bid_amount, r.current_bid_paid_sequence, r.created_at, r.updated_at, r.overall_rank, r.category_rank
)
SELECT * FROM metrics;

CREATE OR REPLACE VIEW public.pos_coffee_passport_daily_view AS
SELECT (a.created_at AT TIME ZONE 'UTC')::date AS day_utc,
       count(*)::integer AS bid_count,
       count(DISTINCT a.shop_id)::integer AS active_shops,
       max(a.bid_amount)::bigint AS top_bid_amount
FROM pos.coffee_passport_bid_activity a
GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.pos_coffee_passport_activity_view AS
SELECT a.activity_id, a.shop_id, s.name AS shop_name, s.slug, a.from_rank, a.to_rank,
       a.bid_amount, a.created_at
FROM pos.coffee_passport_bid_activity a
JOIN pos.coffee_passport_shops s ON s.shop_id = a.shop_id
WHERE s.is_active = true AND s.verification_status = 'approved';

REVOKE ALL ON FUNCTION pos.coffee_passport_record_click(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_record_click(text, text) TO service_role;
GRANT SELECT ON public.pos_coffee_passport_board_view, public.pos_coffee_passport_daily_view, public.pos_coffee_passport_activity_view TO service_role;
