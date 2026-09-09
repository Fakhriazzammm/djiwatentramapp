-- 500 Kopi Tasik: completion, reward, generation lease, and bid settlement hardening.
-- Additive and replay-safe. No historical passport records are deleted.

ALTER TABLE pos.coffee_passport_stickers
  ADD COLUMN IF NOT EXISTS generation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_coffee_passport_stickers_generation_lease
  ON pos.coffee_passport_stickers (status, lease_until)
  WHERE status = 'generating';

CREATE OR REPLACE FUNCTION pos.coffee_passport_reward_credit(
  p_customer_id text,
  p_visit_id text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_reward pos.coffee_passport_rewards;
  v_visit record;
  v_wallet pos.customer_wallets;
  v_balance bigint;
  v_ledger_id bigint;
  v_amount bigint := 500;
  v_key text := 'passport_reward:' || trim(p_visit_id);
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' OR coalesce(trim(p_visit_id), '') = '' OR coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Parameter reward tidak lengkap';
  END IF;

  SELECT v.visit_id, v.customer_id, v.status AS visit_status, st.status AS sticker_status
    INTO v_visit
    FROM pos.coffee_passport_visits v
    JOIN pos.coffee_passport_stickers st ON st.visit_id = v.visit_id
   WHERE v.visit_id = p_visit_id AND v.customer_id = p_customer_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit reward tidak ditemukan'; END IF;
  IF v_visit.visit_status <> 'completed' OR v_visit.sticker_status <> 'completed' THEN
    RAISE EXCEPTION 'Reward hanya tersedia setelah sticker selesai';
  END IF;

  SELECT * INTO v_reward
    FROM pos.coffee_passport_rewards
   WHERE visit_id = p_visit_id OR idempotency_key = p_idempotency_key
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'reward_id', v_reward.reward_id,
      'status', v_reward.status, 'amount', v_reward.amount, 'wallet_ledger_id', v_reward.wallet_ledger_id);
  END IF;

  INSERT INTO pos.coffee_passport_rewards(reward_id, customer_id, visit_id, amount, idempotency_key)
  VALUES ('rwd_' || replace(p_visit_id, '-', ''), p_customer_id, p_visit_id, v_amount, p_idempotency_key)
  ON CONFLICT (visit_id) DO NOTHING
  RETURNING * INTO v_reward;
  IF v_reward.reward_id IS NULL THEN
    SELECT * INTO v_reward FROM pos.coffee_passport_rewards WHERE visit_id = p_visit_id FOR UPDATE;
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'reward_id', v_reward.reward_id,
      'status', v_reward.status, 'amount', v_reward.amount, 'wallet_ledger_id', v_reward.wallet_ledger_id);
  END IF;

  INSERT INTO pos.customer_wallets(customer_id) VALUES (p_customer_id)
    ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM pos.customer_wallets
   WHERE customer_id = p_customer_id FOR UPDATE;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'Wallet customer sedang diblokir'; END IF;

  v_balance := v_wallet.available_balance + v_amount;
  UPDATE pos.customer_wallets
     SET available_balance = v_balance,
         total_credited = total_credited + v_amount,
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO pos.customer_wallet_ledger
    (customer_id, amount, direction, balance_after, status, transaction_type,
     reference_type, reference_id, idempotency_key, note)
  VALUES
    (p_customer_id, v_amount, 'credit', v_balance, 'completed', 'transaction_reward',
     'coffee_passport_visit', p_visit_id, v_key, 'Reward Coffee Passport: saldo Djiwa Pay +Rp500')
  RETURNING id INTO v_ledger_id;

  UPDATE pos.coffee_passport_rewards
     SET wallet_ledger_id = v_ledger_id
   WHERE reward_id = v_reward.reward_id;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'reward_id', v_reward.reward_id,
    'status', 'available', 'amount', v_amount, 'wallet_ledger_id', v_ledger_id);
END;
$$;

REVOKE ALL ON FUNCTION pos.coffee_passport_reward_credit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_reward_credit(text, text, text) TO service_role;

DROP FUNCTION IF EXISTS pos.coffee_passport_settle_bid(text, text, text, timestamptz);
CREATE OR REPLACE FUNCTION pos.coffee_passport_settle_bid(
  p_entry_id text,
  p_invoice_id text,
  p_transaction_id text,
  p_provider_amount bigint,
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
    IF coalesce(trim(v_entry.mayar_invoice_id), '') <> coalesce(trim(p_invoice_id), '')
       OR coalesce(trim(v_entry.mayar_transaction_id), '') <> coalesce(trim(p_transaction_id), '')
       OR p_provider_amount IS NULL OR p_provider_amount <> v_entry.bid_amount THEN
      RAISE EXCEPTION 'Replay pembayaran bid tidak cocok';
    END IF;
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'entry_id', v_entry.entry_id);
  END IF;
  IF p_provider_amount IS NULL OR p_provider_amount <> v_entry.bid_amount THEN
    RAISE EXCEPTION 'Nominal pembayaran bid tidak cocok';
  END IF;
  IF coalesce(trim(p_invoice_id), '') = '' OR coalesce(trim(p_transaction_id), '') = '' THEN
    RAISE EXCEPTION 'Identitas pembayaran bid tidak lengkap';
  END IF;
  IF EXISTS (SELECT 1 FROM pos.coffee_passport_bid_entries
    WHERE mayar_invoice_id = p_invoice_id AND entry_id <> v_entry.entry_id) THEN
    RAISE EXCEPTION 'Invoice bid sudah digunakan';
  END IF;
  IF EXISTS (SELECT 1 FROM pos.coffee_passport_bid_entries
    WHERE mayar_transaction_id = p_transaction_id AND entry_id <> v_entry.entry_id) THEN
    RAISE EXCEPTION 'Transaksi bid sudah digunakan';
  END IF;

  SELECT * INTO v_shop FROM pos.coffee_passport_shops
    WHERE shop_id = v_entry.shop_id AND is_active = true AND verification_status = 'approved'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kedai belum menjadi official'; END IF;
  SELECT c.minimum_new_bid_amount, c.minimum_top_increment, c.maximum_bid_amount
    INTO v_minimum, v_minimum, v_maximum
    FROM pos.coffee_passport_bid_config c WHERE config_id = 'default';
  SELECT GREATEST(COALESCE(c.minimum_new_bid_amount, c.minimum_bid_amount, 5000),
                  v_shop.current_bid_amount + COALESCE(c.minimum_existing_increment, c.minimum_top_increment, c.minimum_increment, 1000))
    INTO v_minimum
    FROM pos.coffee_passport_bid_config c WHERE config_id = 'default';
  v_maximum := COALESCE(v_maximum, 999999999);
  IF v_entry.bid_amount < v_minimum THEN RAISE EXCEPTION 'Bid sudah tersalip'; END IF;
  IF v_entry.bid_amount > v_maximum THEN RAISE EXCEPTION 'Bid melebihi batas maksimum'; END IF;

  SELECT count(*)::integer + 1 INTO v_old_rank
    FROM pos.coffee_passport_shops s
   WHERE s.is_active = true AND s.verification_status = 'approved'
     AND s.current_bid_amount > v_shop.current_bid_amount;
  UPDATE pos.coffee_passport_bid_entries
     SET status = 'paid', mayar_invoice_id = trim(p_invoice_id),
         mayar_transaction_id = trim(p_transaction_id), paid_at = p_paid_at
   WHERE entry_id = v_entry.entry_id;
  UPDATE pos.coffee_passport_shops
     SET current_bid_amount = v_entry.bid_amount, updated_at = now()
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
    'shop_id', v_entry.shop_id, 'rank', v_new_rank, 'minimum_bid', v_minimum,
    'maximum_bid', v_maximum);
END;
$$;

REVOKE ALL ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, bigint, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_settle_bid(text, text, text, bigint, timestamptz) TO service_role;
