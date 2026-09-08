-- 500 Kopi Tasik: additive bid integrity hardening.
-- Keeps perpetual ranking while making limits and payment ordering explicit.

ALTER TABLE pos.coffee_passport_bid_config
  ADD COLUMN IF NOT EXISTS maximum_bid_amount bigint NOT NULL DEFAULT 999999999
    CHECK (maximum_bid_amount > 0);

ALTER TABLE pos.coffee_passport_shops
  ADD COLUMN IF NOT EXISTS current_bid_paid_sequence bigint;

ALTER TABLE pos.coffee_passport_bid_entries
  ADD COLUMN IF NOT EXISTS paid_sequence bigint GENERATED ALWAYS AS IDENTITY;

CREATE INDEX IF NOT EXISTS idx_coffee_passport_bid_paid_sequence
  ON pos.coffee_passport_bid_entries (shop_id, status, bid_amount DESC, paid_sequence ASC);

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
  v_maximum bigint;
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
  SELECT c.minimum_bid_amount, c.maximum_bid_amount
    INTO v_minimum, v_maximum
    FROM pos.coffee_passport_bid_config c WHERE config_id = 'default';
  v_minimum := GREATEST(COALESCE(v_minimum, 5000), v_shop.current_bid_amount + 500);
  v_maximum := COALESCE(v_maximum, 999999999);
  IF v_entry.bid_amount < v_minimum THEN RAISE EXCEPTION 'Bid sudah tersalip'; END IF;
  IF v_entry.bid_amount > v_maximum THEN RAISE EXCEPTION 'Bid melebihi batas maksimum'; END IF;

  SELECT count(*)::integer + 1 INTO v_old_rank
    FROM pos.coffee_passport_shops s
   WHERE s.is_active = true AND s.verification_status = 'approved'
     AND (s.current_bid_amount > v_shop.current_bid_amount
       OR (s.current_bid_amount = v_shop.current_bid_amount
           AND COALESCE(s.current_bid_paid_sequence, 9223372036854775807)
             < COALESCE(v_shop.current_bid_paid_sequence, 9223372036854775807)));

  UPDATE pos.coffee_passport_bid_entries
     SET status = 'paid', mayar_invoice_id = NULLIF(trim(p_invoice_id), ''),
         mayar_transaction_id = NULLIF(trim(p_transaction_id), ''), paid_at = p_paid_at
   WHERE entry_id = v_entry.entry_id;
  UPDATE pos.coffee_passport_shops
     SET current_bid_amount = v_entry.bid_amount,
         current_bid_paid_sequence = v_entry.paid_sequence,
         updated_at = now()
   WHERE shop_id = v_shop.shop_id;

  SELECT count(*)::integer + 1 INTO v_new_rank
    FROM pos.coffee_passport_shops s
   WHERE s.is_active = true AND s.verification_status = 'approved'
     AND (s.current_bid_amount > v_entry.bid_amount
       OR (s.current_bid_amount = v_entry.bid_amount
           AND COALESCE(s.current_bid_paid_sequence, 9223372036854775807)
             < COALESCE(v_entry.paid_sequence, 9223372036854775807)));

  INSERT INTO pos.coffee_passport_bid_activity(activity_id, entry_id, shop_id, from_rank, to_rank, bid_amount)
  VALUES ('act_' || replace(gen_random_uuid()::text, '-', ''), v_entry.entry_id, v_entry.shop_id,
          v_old_rank, v_new_rank, v_entry.bid_amount)
  ON CONFLICT (entry_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'entry_id', v_entry.entry_id,
    'shop_id', v_entry.shop_id, 'rank', v_new_rank, 'minimum_bid', v_minimum,
    'maximum_bid', v_maximum, 'paid_sequence', v_entry.paid_sequence);
END;
$$;

REVOKE ALL ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, timestamptz) TO service_role;
