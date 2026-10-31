BEGIN;

DO $$
DECLARE
  v_customer_id text := 'travel_wallet_test_' || replace(gen_random_uuid()::text, '-', '');
  v_order_id text := 'travel_order_test_' || replace(gen_random_uuid()::text, '-', '');
  v_insufficient_order_id text := 'travel_order_test_' || replace(gen_random_uuid()::text, '-', '');
  v_first jsonb;
  v_retry jsonb;
  v_insufficient jsonb;
  v_ledger_count integer;
  v_balance bigint;
BEGIN
  INSERT INTO pos.customers (source_id, email, name, is_active)
  VALUES (v_customer_id, v_customer_id || '@example.invalid', 'Travel wallet test', true);
  INSERT INTO pos.customer_wallets (customer_id, available_balance, status)
  VALUES (v_customer_id, 50000, 'active');

  v_first := pos.wallet_charge_travel_order(v_customer_id, v_order_id, 30000);
  v_retry := pos.wallet_charge_travel_order(v_customer_id, v_order_id, 30000);

  IF v_first->>'result' <> 'charged' OR v_retry->>'result' <> 'already_charged' THEN
    RAISE EXCEPTION 'charge and retry must return charged/already_charged: %, %', v_first, v_retry;
  END IF;
  IF v_first->>'ledgerId' IS DISTINCT FROM v_retry->>'ledgerId' THEN
    RAISE EXCEPTION 'retry must return the original ledger ID';
  END IF;
  IF (SELECT available_balance FROM pos.customer_wallets WHERE customer_id = v_customer_id) <> 20000 THEN
    RAISE EXCEPTION 'retry charged the wallet more than once';
  END IF;

  BEGIN
    PERFORM pos.wallet_charge_travel_order(v_customer_id, v_order_id, 25000);
    RAISE EXCEPTION 'same Travel order with a different amount must be rejected';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TRAVEL_ORDER_CHARGE_CONFLICT' THEN
      RAISE;
    END IF;
  END;

  v_insufficient := pos.wallet_charge_travel_order(v_customer_id, v_insufficient_order_id, 25000);
  IF v_insufficient->>'result' <> 'insufficient_balance' THEN
    RAISE EXCEPTION 'insufficient balance must not charge: %', v_insufficient;
  END IF;
  SELECT available_balance INTO v_balance FROM pos.customer_wallets WHERE customer_id = v_customer_id;
  IF v_balance <> 20000 THEN
    RAISE EXCEPTION 'insufficient balance changed the wallet';
  END IF;

  SELECT count(*) INTO v_ledger_count
    FROM pos.customer_wallet_ledger
   WHERE customer_id = v_customer_id
     AND source_app = 'djiwa-travel'
     AND reference_type = 'travel_order'
     AND reference_id = v_order_id
     AND direction = 'debit'
     AND status = 'completed'
     AND transaction_type = 'order_debit';
  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one completed Travel order debit, got %', v_ledger_count;
  END IF;

  IF has_function_privilege('anon', 'pos.wallet_charge_travel_order(text,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'pos.wallet_charge_travel_order(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must not execute the Travel wallet RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'pos.wallet_charge_travel_order(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute the Travel wallet RPC';
  END IF;
  IF NOT has_function_privilege('supabase_admin', 'pos.wallet_charge_travel_order(text,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'auth-server runtime role must execute the Travel wallet RPC';
  END IF;
END;
$$;

ROLLBACK;
