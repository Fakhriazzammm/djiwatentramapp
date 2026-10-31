-- Charge a Travel eSIM order directly from the customer's Djiwa Pay wallet.
-- The order-scoped advisory lock and stable ledger key make concurrent retries safe.

CREATE OR REPLACE FUNCTION pos.wallet_charge_travel_order(
  p_customer_id text,
  p_order_id text,
  p_amount bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pos
AS $$
DECLARE
  v_customer_id text := NULLIF(btrim(p_customer_id), '');
  v_order_id text := NULLIF(btrim(p_order_id), '');
  v_idempotency_key text;
  v_existing pos.customer_wallet_ledger;
  v_wallet pos.customer_wallets;
  v_balance bigint;
  v_ledger_id bigint;
BEGIN
  IF v_customer_id IS NULL OR v_order_id IS NULL OR length(v_order_id) > 128
     OR v_order_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAVEL_ORDER_CHARGE_INVALID_INPUT';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAVEL_ORDER_CHARGE_INVALID_AMOUNT';
  END IF;

  v_idempotency_key := 'djiwa-travel-order:' || v_order_id;

  -- Serialize this Travel order even if a conflicting caller supplies another customer.
  PERFORM pg_advisory_xact_lock(hashtextextended('djiwa-travel:' || v_order_id, 0));

  SELECT ledger.*
    INTO v_existing
    FROM pos.customer_wallet_ledger AS ledger
   WHERE ledger.source_app = 'djiwa-travel'
     AND ledger.reference_type = 'travel_order'
     AND ledger.reference_id = v_order_id
     AND ledger.direction = 'debit'
     AND ledger.status = 'completed'
   ORDER BY ledger.id
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.customer_id <> v_customer_id
       OR v_existing.amount <> p_amount
       OR v_existing.transaction_type <> 'order_debit'
       OR v_existing.idempotency_key <> v_idempotency_key THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TRAVEL_ORDER_CHARGE_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_charged',
      'ledgerId', v_existing.id::text,
      'balance', v_existing.balance_after
    );
  END IF;

  SELECT * INTO v_wallet
    FROM pos.customer_wallets
   WHERE customer_id = v_customer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'result', 'insufficient_balance', 'balance', 0);
  END IF;
  IF v_wallet.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'result', 'wallet_blocked');
  END IF;
  IF v_wallet.available_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'result', 'insufficient_balance', 'balance', v_wallet.available_balance);
  END IF;

  v_balance := v_wallet.available_balance - p_amount;
  UPDATE pos.customer_wallets
     SET available_balance = v_balance,
         total_debited = total_debited + p_amount,
         updated_at = now()
   WHERE customer_id = v_customer_id;

  INSERT INTO pos.customer_wallet_ledger (
    customer_id, amount, direction, balance_after, status, transaction_type,
    reference_type, reference_id, idempotency_key, note, source_app
  ) VALUES (
    v_customer_id, p_amount, 'debit', v_balance, 'completed', 'order_debit',
    'travel_order', v_order_id, v_idempotency_key, 'Pembayaran order eSIM Djiwa Travel', 'djiwa-travel'
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'charged',
    'ledgerId', v_ledger_id::text,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION pos.wallet_charge_travel_order(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.wallet_charge_travel_order(text, text, bigint) TO service_role, supabase_admin;

COMMENT ON FUNCTION pos.wallet_charge_travel_order(text, text, bigint) IS
  'Atomically charge one Djiwa Travel order from the verified customer wallet; retries return the original ledger debit.';
