-- Run with psql against the target Supabase database.
-- All writes are rolled back; this verifies the contract without creating data.

BEGIN;
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  v_id text := 'verify-payment-contract-' || replace(gen_random_uuid()::text, '-', '');
  v_result jsonb;
  v_count integer;
BEGIN
  INSERT INTO pos.orders (source_id, total_amount, status, raw, payment_method, payment_receipt_kind)
  VALUES (v_id, 8000, 'pending', '{}'::jsonb, 'cash', 'cashier_pending');

  v_result := pos.settle_cashier_order(v_id, 'tunai');
  IF v_result->>'status' <> 'paid' OR coalesce((v_result->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'cash settlement did not settle a pending order: %', v_result;
  END IF;
  v_result := pos.settle_cashier_order(v_id, 'cashier');
  IF coalesce((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'cash settlement is not idempotent: %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM pos.financial_transactions WHERE order_source_id = v_id AND tx_type = 'income';
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected one income transaction, got %', v_count; END IF;
  IF pos.normalize_payment_method('qris', 'cashier_pending', '{"provider":"mayar"}') <> 'qris_mayar' THEN
    RAISE EXCEPTION 'QRIS was classified as cashier';
  END IF;
  IF pos.normalize_payment_method('wallet', 'wallet_paid', NULL) <> 'djiwa_pay' THEN
    RAISE EXCEPTION 'wallet was not canonicalized';
  END IF;
  BEGIN
    PERFORM pos.settle_cashier_order(v_id, 'qris');
    RAISE EXCEPTION 'invalid cashier method was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;

ROLLBACK;
