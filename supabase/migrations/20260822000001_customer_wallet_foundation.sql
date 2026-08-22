-- Customer wallet foundation: internal IDR store credit only.
-- Additive and idempotent. No withdraw, cash-out, or customer-to-customer transfer.

CREATE TABLE IF NOT EXISTS pos.customer_wallets (
  customer_id text PRIMARY KEY REFERENCES pos.customers(source_id),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  available_balance bigint NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  held_balance bigint NOT NULL DEFAULT 0 CHECK (held_balance >= 0),
  total_credited bigint NOT NULL DEFAULT 0 CHECK (total_credited >= 0),
  total_debited bigint NOT NULL DEFAULT 0 CHECK (total_debited >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.customer_wallet_ledger (
  id bigserial PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  amount bigint NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'reversed', 'cancelled')),
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'topup_pending', 'topup_completed', 'wallet_hold', 'wallet_capture',
    'wallet_release', 'order_debit', 'refund', 'manual_credit',
    'manual_debit', 'adjustment'
  )),
  reference_type text,
  reference_id text,
  idempotency_key text NOT NULL UNIQUE,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.customer_wallet_holds (
  hold_id text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  order_id text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'captured', 'released', 'expired')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_customer_created
  ON pos.customer_wallet_ledger (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_reference
  ON pos.customer_wallet_ledger (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_holds_customer_status
  ON pos.customer_wallet_holds (customer_id, status);

CREATE OR REPLACE VIEW public.pos_customer_wallets_view AS
SELECT
  w.customer_id,
  w.currency,
  w.available_balance,
  w.held_balance,
  w.total_credited,
  w.total_debited,
  w.status,
  w.updated_at
FROM pos.customer_wallets w;

CREATE OR REPLACE VIEW public.pos_customers_view AS
SELECT
  c.source_id,
  c.email,
  c.name,
  c.phone,
  c.photo_url,
  c.total_points,
  c.lifetime_points,
  c.total_orders,
  c.total_spent,
  c.last_order_at,
  c.created_at,
  COALESCE(w.available_balance, 0)::bigint AS wallet_balance,
  COALESCE(w.held_balance, 0)::bigint AS wallet_held_balance,
  COALESCE(w.total_credited, 0)::bigint AS wallet_total_credited,
  COALESCE(w.total_debited, 0)::bigint AS wallet_total_debited,
  COALESCE(w.status, 'active') AS wallet_status
FROM pos.customers c
LEFT JOIN pos.customer_wallets w ON w.customer_id = c.source_id
WHERE c.is_active = true;

GRANT USAGE ON SCHEMA pos TO anon, authenticated, service_role;
GRANT SELECT ON public.pos_customer_wallets_view TO anon, authenticated, service_role;
GRANT SELECT ON pos.customer_wallet_ledger TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pos.customer_wallet_ledger_id_seq TO service_role;

CREATE OR REPLACE FUNCTION pos.wallet_ensure(p_customer_id text)
RETURNS pos.customer_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_wallet pos.customer_wallets;
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' THEN
    RAISE EXCEPTION 'customer_id wajib diisi';
  END IF;
  INSERT INTO pos.customer_wallets(customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = p_customer_id;
  RETURN v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION pos.wallet_create_hold(
  p_customer_id text,
  p_order_id text,
  p_amount bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_wallet pos.customer_wallets;
  v_hold pos.customer_wallet_holds;
  v_ledger_id bigint;
  v_hold_id text := 'wh_' || md5(p_customer_id || ':' || p_order_id || ':' || p_idempotency_key);
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Nominal wallet tidak valid'; END IF;
  IF coalesce(trim(p_order_id), '') = '' THEN RAISE EXCEPTION 'order_id wajib diisi'; END IF;
  IF coalesce(trim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'idempotency_key wajib diisi'; END IF;

  SELECT * INTO v_hold FROM pos.customer_wallet_holds WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'hold_id', v_hold.hold_id, 'status', v_hold.status, 'amount', v_hold.amount);
  END IF;

  PERFORM pos.wallet_ensure(p_customer_id);
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = p_customer_id FOR UPDATE;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'Wallet customer sedang diblokir'; END IF;
  IF v_wallet.available_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BALANCE', 'available_balance', v_wallet.available_balance, 'required', p_amount);
  END IF;

  UPDATE pos.customer_wallets
  SET available_balance = available_balance - p_amount,
      held_balance = held_balance + p_amount,
      updated_at = now()
  WHERE customer_id = p_customer_id;

  INSERT INTO pos.customer_wallet_holds(hold_id, customer_id, order_id, amount, idempotency_key)
  VALUES (v_hold_id, p_customer_id, p_order_id, p_amount, p_idempotency_key);

  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (p_customer_id, p_amount, 'debit', v_wallet.available_balance - p_amount, 'pending', 'wallet_hold', 'order', p_order_id, 'ledger_' || p_idempotency_key, 'Saldo ditahan untuk checkout')
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'hold_id', v_hold_id, 'ledger_id', v_ledger_id, 'status', 'held', 'amount', p_amount, 'available_balance', v_wallet.available_balance - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION pos.wallet_capture_hold(p_hold_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_hold pos.customer_wallet_holds; v_wallet pos.customer_wallets;
BEGIN
  SELECT * INTO v_hold FROM pos.customer_wallet_holds WHERE hold_id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet hold tidak ditemukan'; END IF;
  IF v_hold.status = 'captured' THEN RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', 'captured', 'hold_id', p_hold_id); END IF;
  IF v_hold.status <> 'held' THEN RAISE EXCEPTION 'Wallet hold tidak dapat dicapture'; END IF;
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = v_hold.customer_id FOR UPDATE;
  UPDATE pos.customer_wallets SET held_balance = held_balance - v_hold.amount, total_debited = total_debited + v_hold.amount, updated_at = now() WHERE customer_id = v_hold.customer_id;
  UPDATE pos.customer_wallet_holds SET status = 'captured', captured_at = now() WHERE hold_id = p_hold_id;
  UPDATE pos.customer_wallet_ledger SET status = 'completed', transaction_type = 'order_debit', idempotency_key = 'capture_' || p_idempotency_key WHERE reference_type = 'order' AND reference_id = v_hold.order_id AND status = 'pending';
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'captured', 'hold_id', p_hold_id, 'amount', v_hold.amount);
END;
$$;

CREATE OR REPLACE FUNCTION pos.wallet_release_hold(p_hold_id text, p_idempotency_key text, p_reason text DEFAULT 'Order dibatalkan')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_hold pos.customer_wallet_holds; v_wallet pos.customer_wallets;
BEGIN
  SELECT * INTO v_hold FROM pos.customer_wallet_holds WHERE hold_id = p_hold_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet hold tidak ditemukan'; END IF;
  IF v_hold.status = 'released' THEN RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', 'released', 'hold_id', p_hold_id); END IF;
  IF v_hold.status <> 'held' THEN RAISE EXCEPTION 'Wallet hold tidak dapat direlease'; END IF;
  SELECT * INTO v_wallet FROM pos.customer_wallets WHERE customer_id = v_hold.customer_id FOR UPDATE;
  UPDATE pos.customer_wallets SET available_balance = available_balance + v_hold.amount, held_balance = held_balance - v_hold.amount, updated_at = now() WHERE customer_id = v_hold.customer_id;
  UPDATE pos.customer_wallet_holds SET status = 'released', released_at = now() WHERE hold_id = p_hold_id;
  UPDATE pos.customer_wallet_ledger SET status = 'cancelled' WHERE reference_type = 'order' AND reference_id = v_hold.order_id AND status = 'pending';
  INSERT INTO pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type, reference_type, reference_id, idempotency_key, note)
  VALUES (v_hold.customer_id, v_hold.amount, 'credit', v_wallet.available_balance + v_hold.amount, 'completed', 'wallet_release', 'order', v_hold.order_id, 'release_' || p_idempotency_key, p_reason);
  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'released', 'hold_id', p_hold_id, 'amount', v_hold.amount);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.wallet_ensure(text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_create_hold(text, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_capture_hold(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_release_hold(text, text, text) TO service_role;
