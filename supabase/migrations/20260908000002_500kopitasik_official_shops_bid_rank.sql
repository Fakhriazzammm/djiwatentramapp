-- 500 Kopi Tasik: official shop onboarding + perpetual paid leaderboard.
-- Additive only. No campaign period and no deletion of historical passport data.

ALTER TABLE pos.coffee_passport_shops
  ADD COLUMN IF NOT EXISTS owner_customer_id text REFERENCES pos.customers(source_id),
  ADD COLUMN IF NOT EXISTS google_maps_url text,
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_bid_amount bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE pos.coffee_passport_shops
    ADD CONSTRAINT coffee_passport_shops_verification_status_check
    CHECK (verification_status IN ('pending_review', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_coffee_passport_shops_official
  ON pos.coffee_passport_shops (verification_status, is_active, current_bid_amount DESC, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_shop_google_place
  ON pos.coffee_passport_shops (google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pos.coffee_passport_bid_config (
  config_id text PRIMARY KEY DEFAULT 'default',
  minimum_bid_amount bigint NOT NULL DEFAULT 5000 CHECK (minimum_bid_amount > 0),
  minimum_increment bigint NOT NULL DEFAULT 500 CHECK (minimum_increment > 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pos.coffee_passport_bid_config (config_id)
VALUES ('default') ON CONFLICT (config_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pos.coffee_passport_bid_entries (
  entry_id text PRIMARY KEY,
  shop_id text NOT NULL REFERENCES pos.coffee_passport_shops(shop_id),
  bidder_customer_id text NOT NULL REFERENCES pos.customers(source_id),
  bid_amount bigint NOT NULL CHECK (bid_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  mayar_invoice_id text,
  mayar_transaction_id text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_coffee_passport_bid_rank
  ON pos.coffee_passport_bid_entries (shop_id, status, bid_amount DESC, paid_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_bid_invoice
  ON pos.coffee_passport_bid_entries (mayar_invoice_id)
  WHERE mayar_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_bid_transaction
  ON pos.coffee_passport_bid_entries (mayar_transaction_id)
  WHERE mayar_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pos.coffee_passport_bid_activity (
  activity_id text PRIMARY KEY,
  entry_id text NOT NULL UNIQUE REFERENCES pos.coffee_passport_bid_entries(entry_id),
  shop_id text NOT NULL REFERENCES pos.coffee_passport_shops(shop_id),
  from_rank integer,
  to_rank integer NOT NULL CHECK (to_rank > 0),
  bid_amount bigint NOT NULL CHECK (bid_amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coffee_passport_bid_activity_recent
  ON pos.coffee_passport_bid_activity (created_at DESC);

CREATE TABLE IF NOT EXISTS pos.coffee_passport_bid_clicks (
  click_id text PRIMARY KEY,
  shop_id text NOT NULL REFERENCES pos.coffee_passport_shops(shop_id),
  visitor_key text NOT NULL,
  click_day date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coffee_passport_bid_click_dedupe
  ON pos.coffee_passport_bid_clicks (shop_id, visitor_key, click_day);

CREATE OR REPLACE FUNCTION pos.coffee_passport_settle_bid(
  p_entry_id text,
  p_invoice_id text,
  p_transaction_id text,
  p_paid_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_entry pos.coffee_passport_bid_entries;
  v_shop pos.coffee_passport_shops;
  v_minimum bigint;
  v_old_rank integer;
  v_new_rank integer;
BEGIN
  SELECT * INTO v_entry FROM pos.coffee_passport_bid_entries
    WHERE entry_id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bid tidak ditemukan'; END IF;
  IF v_entry.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'entry_id', v_entry.entry_id);
  END IF;
  SELECT * INTO v_shop FROM pos.coffee_passport_shops
    WHERE shop_id = v_entry.shop_id AND is_active = true AND verification_status = 'approved'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kedai belum menjadi official'; END IF;
  SELECT GREATEST(c.minimum_bid_amount, v_shop.current_bid_amount + c.minimum_increment)
    INTO v_minimum FROM pos.coffee_passport_bid_config c WHERE config_id = 'default';
  IF v_entry.bid_amount < v_minimum THEN RAISE EXCEPTION 'Bid sudah tersalip'; END IF;
  SELECT count(*)::integer + 1 INTO v_old_rank
    FROM pos.coffee_passport_shops s
   WHERE s.is_active = true AND s.verification_status = 'approved'
     AND s.current_bid_amount > v_shop.current_bid_amount;
  UPDATE pos.coffee_passport_bid_entries
     SET status = 'paid', mayar_invoice_id = NULLIF(trim(p_invoice_id), ''),
         mayar_transaction_id = NULLIF(trim(p_transaction_id), ''), paid_at = p_paid_at
   WHERE entry_id = v_entry.entry_id;
  UPDATE pos.coffee_passport_shops SET current_bid_amount = v_entry.bid_amount, updated_at = now()
   WHERE shop_id = v_shop.shop_id;
  SELECT count(*)::integer + 1 INTO v_new_rank
    FROM pos.coffee_passport_shops s
   WHERE s.is_active = true AND s.verification_status = 'approved'
     AND s.current_bid_amount > v_entry.bid_amount;
  INSERT INTO pos.coffee_passport_bid_activity(activity_id, entry_id, shop_id, from_rank, to_rank, bid_amount)
  VALUES ('act_' || replace(gen_random_uuid()::text, '-', ''), v_entry.entry_id, v_entry.shop_id,
          v_old_rank, v_new_rank, v_entry.bid_amount)
  ON CONFLICT (entry_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'entry_id', v_entry.entry_id,
    'shop_id', v_entry.shop_id, 'rank', v_new_rank, 'minimum_bid', v_minimum);
END;
$$;

CREATE OR REPLACE VIEW public.pos_coffee_passport_official_shops_view AS
SELECT shop_id, name, slug, area, description, cover_url, google_maps_url,
       current_bid_amount, verification_status
FROM pos.coffee_passport_shops
WHERE is_active = true AND verification_status = 'approved';

REVOKE ALL ON TABLE pos.coffee_passport_bid_config, pos.coffee_passport_bid_entries,
  pos.coffee_passport_bid_activity, pos.coffee_passport_bid_clicks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_coffee_passport_official_shops_view TO service_role;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, timestamptz) TO service_role;
