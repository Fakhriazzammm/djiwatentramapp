-- 500 Kopi Tasik coffee passport foundation.
-- Additive, idempotent, and server-mediated. No direct anon writes.

CREATE TABLE IF NOT EXISTS pos.coffee_passport_shops (
  shop_id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  area text,
  description text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  cover_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.coffee_passport_visits (
  visit_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  shop_id text NOT NULL REFERENCES pos.coffee_passport_shops(shop_id),
  photo_path text NOT NULL,
  photo_category text NOT NULL CHECK (photo_category IN ('facade', 'interior', 'coffee', 'food', 'barista', 'portrait', 'other')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  latitude numeric(9,6),
  longitude numeric(9,6),
  captured_at timestamptz,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'sticker_pending', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, visit_id)
);

CREATE TABLE IF NOT EXISTS pos.coffee_passport_stickers (
  sticker_id text PRIMARY KEY,
  visit_id text NOT NULL UNIQUE REFERENCES pos.coffee_passport_visits(visit_id),
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  sticker_path text,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
  provider text,
  provider_request_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS pos.coffee_passport_rewards (
  reward_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  visit_id text NOT NULL UNIQUE REFERENCES pos.coffee_passport_visits(visit_id),
  amount bigint NOT NULL DEFAULT 500 CHECK (amount = 500),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('pending', 'available', 'redeemed', 'reversed')),
  wallet_ledger_id bigint,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_coffee_passport_shops_active
  ON pos.coffee_passport_shops (is_active, name);
CREATE INDEX IF NOT EXISTS idx_coffee_passport_visits_customer_created
  ON pos.coffee_passport_visits (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coffee_passport_stickers_customer_created
  ON pos.coffee_passport_stickers (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coffee_passport_rewards_customer_created
  ON pos.coffee_passport_rewards (customer_id, created_at DESC);

CREATE OR REPLACE VIEW public.pos_coffee_passport_collection_view AS
SELECT
  v.customer_id,
  v.shop_id,
  s.name AS shop_name,
  s.slug AS shop_slug,
  min(v.created_at) AS first_visit_at,
  count(*)::integer AS visit_count,
  bool_or(st.status = 'completed') AS sticker_completed
FROM pos.coffee_passport_visits v
JOIN pos.coffee_passport_shops s ON s.shop_id = v.shop_id
LEFT JOIN pos.coffee_passport_stickers st ON st.visit_id = v.visit_id
WHERE v.status IN ('recorded', 'sticker_pending', 'completed')
GROUP BY v.customer_id, v.shop_id, s.name, s.slug;

CREATE OR REPLACE FUNCTION pos.coffee_passport_reward_credit(
  p_customer_id text,
  p_visit_id text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_reward pos.coffee_passport_rewards;
  v_ledger jsonb;
  v_count integer;
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' OR coalesce(trim(p_visit_id), '') = '' OR coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Parameter reward tidak lengkap';
  END IF;
  SELECT * INTO v_reward FROM pos.coffee_passport_rewards WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'dedup', true, 'reward_id', v_reward.reward_id, 'status', v_reward.status); END IF;
  SELECT count(DISTINCT shop_id)::integer INTO v_count FROM pos.coffee_passport_visits WHERE customer_id = p_customer_id;
  IF v_count > 500 THEN RAISE EXCEPTION 'Batas collection terlampaui'; END IF;
  INSERT INTO pos.coffee_passport_rewards(reward_id, customer_id, visit_id, idempotency_key)
  VALUES ('rwd_' || replace(p_visit_id, '-', ''), p_customer_id, p_visit_id, p_idempotency_key)
  ON CONFLICT (visit_id) DO NOTHING
  RETURNING * INTO v_reward;
  IF v_reward.reward_id IS NULL THEN
    SELECT * INTO v_reward FROM pos.coffee_passport_rewards WHERE visit_id = p_visit_id;
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'reward_id', v_reward.reward_id, 'status', v_reward.status);
  END IF;
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'reward_id', v_reward.reward_id, 'status', v_reward.status, 'amount', 500);
END;
$$;

REVOKE ALL ON TABLE pos.coffee_passport_shops, pos.coffee_passport_visits, pos.coffee_passport_stickers, pos.coffee_passport_rewards FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.coffee_passport_reward_credit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_coffee_passport_collection_view TO service_role;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_reward_credit(text, text, text) TO service_role;
