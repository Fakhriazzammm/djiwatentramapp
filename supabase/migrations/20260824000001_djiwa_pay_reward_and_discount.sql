-- Djiwa Pay transaction reward + payment-channel discount foundation.
-- Additive/idempotent: preserves legacy points and wallet history.

ALTER TABLE pos.customer_wallet_ledger
  DROP CONSTRAINT IF EXISTS customer_wallet_ledger_transaction_type_check;

ALTER TABLE pos.customer_wallet_ledger
  ADD CONSTRAINT customer_wallet_ledger_transaction_type_check CHECK (
    transaction_type = ANY (ARRAY[
      'topup_pending', 'topup_completed', 'wallet_hold', 'wallet_capture',
      'wallet_release', 'order_debit', 'transaction_reward', 'refund',
      'manual_credit', 'manual_debit', 'adjustment'
    ])
  );

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_reward_reference
  ON pos.customer_wallet_ledger (reference_type, reference_id)
  WHERE transaction_type = 'transaction_reward';

CREATE OR REPLACE FUNCTION pos.grant_djiwa_pay_transaction_reward(
  p_customer_id text,
  p_order_id text,
  p_amount bigint DEFAULT 1000
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_wallet pos.customer_wallets;
  v_balance bigint;
  v_key text := 'djiwa_pay_reward:' || trim(p_order_id);
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' OR coalesce(trim(p_order_id), '') = '' THEN
    RAISE EXCEPTION 'Customer dan order wajib diisi';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal reward tidak valid';
  END IF;

  IF EXISTS (SELECT 1 FROM pos.customer_wallet_ledger WHERE idempotency_key = v_key) THEN
    SELECT available_balance INTO v_balance FROM pos.customer_wallets WHERE customer_id = p_customer_id;
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'amount', p_amount, 'balance', v_balance);
  END IF;

  INSERT INTO pos.customer_wallets(customer_id) VALUES (p_customer_id) ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = p_customer_id FOR UPDATE;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'Wallet customer sedang diblokir'; END IF;

  v_balance := v_wallet.available_balance + p_amount;
  UPDATE pos.customer_wallets SET available_balance = v_balance, total_credited = total_credited + p_amount, updated_at = now() WHERE customer_id = p_customer_id;
  INSERT INTO pos.customer_wallet_ledger (customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (p_customer_id, p_amount, 'credit', v_balance, 'completed', 'transaction_reward', 'order', p_order_id, v_key, 'Reward transaksi DjiwaApp: saldo Djiwa Pay +Rp1.000');
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'amount', p_amount, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION pos.wallet_settle_order(
  p_customer_id text, p_order_id text, p_hold_id text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders; v_hold pos.customer_wallet_holds; v_capture jsonb; v_reward jsonb; v_financial_id text;
  v_now double precision := extract(epoch from now()) * 1000;
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' OR coalesce(trim(p_order_id), '') = '' OR coalesce(trim(p_hold_id), '') = '' THEN RAISE EXCEPTION 'Customer, order, dan hold wajib diisi'; END IF;
  SELECT * INTO v_order FROM pos.orders WHERE source_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;
  IF coalesce(v_order.customer_source_id, '') <> p_customer_id THEN RAISE EXCEPTION 'Order bukan milik customer'; END IF;
  SELECT * INTO v_hold FROM pos.customer_wallet_holds WHERE hold_id = p_hold_id FOR UPDATE;
  IF NOT FOUND OR v_hold.customer_id <> p_customer_id OR v_hold.order_id <> p_order_id THEN RAISE EXCEPTION 'Wallet hold tidak valid untuk order'; END IF;
  IF v_order.status IN ('paid', 'completed') AND v_hold.status = 'captured' THEN
    v_reward := pos.grant_djiwa_pay_transaction_reward(p_customer_id, p_order_id, 1000);
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', v_order.status, 'order_id', p_order_id, 'reward', v_reward);
  END IF;
  v_capture := pos.wallet_capture_hold(p_hold_id, p_idempotency_key || ':capture');
  UPDATE pos.orders SET status = 'paid', payment_method = 'wallet', payment_receipt_kind = 'wallet_paid', delivery_status = COALESCE(delivery_status, 'paid') WHERE source_id = p_order_id;
  IF NOT EXISTS (SELECT 1 FROM pos.financial_transactions WHERE order_source_id = p_order_id) THEN
    v_financial_id := 'fin_wallet_' || md5(p_order_id);
    INSERT INTO pos.financial_transactions (source_id, tx_type, amount, category, description, tx_date, payment_method, status, order_source_id, creation_time, metadata, raw)
    VALUES (v_financial_id, 'income', v_order.total_amount, 'Penjualan', 'Penjualan Pesanan #' || COALESCE(v_order.order_number, '-'), v_now, 'wallet', 'completed', p_order_id, v_now,
      jsonb_build_object('orderId', p_order_id, 'orderNumber', v_order.order_number, 'source', 'djiwa_pay'), jsonb_build_object('kind', 'wallet_order_settlement', 'holdId', p_hold_id));
  END IF;
  v_reward := pos.grant_djiwa_pay_transaction_reward(p_customer_id, p_order_id, 1000);
  INSERT INTO public.pos_notifications (notification_type, priority, title, message, order_source_id, order_number, source, dedupe_key, action_type, action_payload, created_by, created_at, expires_at, is_active)
  VALUES ('order_paid', 'normal', 'Pembayaran Djiwa Pay Berhasil', 'Pesanan DjiwaApp sudah dibayar dengan Djiwa Pay', p_order_id, v_order.order_number, 'customer_self_service', 'order:' || p_order_id || ':order_paid', 'open_order',
    jsonb_build_object('orderId', p_order_id, 'orderNumber', v_order.order_number, 'source', 'djiwaapp', 'paymentMethod', 'wallet', 'paymentStatus', 'paid', 'customerName', v_order.customer_name, 'tableNumber', v_order.table_number, 'orderType', v_order.order_type, 'totalAmount', v_order.total_amount, 'djiwaPayRewardAmount', 1000), 'system', now(), now() + interval '30 minutes', true)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'paid', 'order_id', p_order_id, 'capture', v_capture, 'reward', v_reward);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.grant_djiwa_pay_transaction_reward(text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_settle_order(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION pos.award_djiwa_pay_reward_on_order_settled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.status IN ('paid', 'completed') AND COALESCE(NEW.customer_source_id, '') <> '' THEN
    PERFORM pos.grant_djiwa_pay_transaction_reward(NEW.customer_source_id, NEW.source_id, 1000);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_award_djiwa_pay_reward ON pos.orders;
CREATE TRIGGER trg_award_djiwa_pay_reward AFTER INSERT OR UPDATE OF status ON pos.orders FOR EACH ROW EXECUTE FUNCTION pos.award_djiwa_pay_reward_on_order_settled();
GRANT EXECUTE ON FUNCTION pos.award_djiwa_pay_reward_on_order_settled() TO service_role;

UPDATE pos.site_settings
SET raw = jsonb_set(jsonb_set(COALESCE(raw, '{}'::jsonb), '{djiwaPayDiscountPercent}', '20'::jsonb, true), '{djiwaPayTransactionReward}', '1000'::jsonb, true)
WHERE source_id IS NOT NULL;
