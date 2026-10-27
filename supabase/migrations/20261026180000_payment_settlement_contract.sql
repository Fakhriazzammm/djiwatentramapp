-- Canonical payment settlement contract for Customer, POS, Admin, and Mayar.
-- Every settlement locks the order, writes at most one income transaction, and
-- records the canonical channel without removing legacy payment aliases.

CREATE OR REPLACE FUNCTION pos.normalize_payment_method(
  p_payment_method text,
  p_payment_receipt_kind text DEFAULT NULL,
  p_payment_gateway jsonb DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_method text := lower(regexp_replace(coalesce(p_payment_method, ''), '[[:space:]-]+', '_', 'g'));
  v_receipt text := lower(regexp_replace(coalesce(p_payment_receipt_kind, ''), '[[:space:]-]+', '_', 'g'));
  v_gateway text := lower(coalesce(p_payment_gateway->>'provider', ''));
BEGIN
  IF v_method IN ('qris', 'qris_mayar', 'mayar', 'gateway')
    OR v_receipt IN ('gateway', 'gateway_pending', 'gateway_paid', 'mayar', 'qris', 'qris_mayar')
    OR v_gateway IN ('mayar', 'gateway', 'qris')
  THEN RETURN 'qris_mayar'; END IF;
  IF v_method IN ('wallet', 'djiwa_pay', 'djiwaapp_wallet', 'djiwa_pay_wallet')
    OR v_receipt IN ('wallet', 'wallet_pending', 'wallet_paid', 'djiwa_pay')
  THEN RETURN 'djiwa_pay'; END IF;
  IF v_method IN ('cash', 'tunai', 'cashier', 'cashier_cash')
    OR v_receipt IN ('cashier', 'cashier_pending')
  THEN RETURN 'cashier_cash'; END IF;
  RETURN 'unknown';
END;
$$;

CREATE OR REPLACE FUNCTION pos.settle_cashier_order(
  p_order_id text,
  p_payment_method text DEFAULT 'cash'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_order pos.orders%ROWTYPE;
  v_now double precision := extract(epoch from now()) * 1000;
  v_tx_id text := 'fin_cashier_' || trim(p_order_id);
  v_canonical text;
  v_inserted boolean := false;
BEGIN
  IF nullif(trim(p_order_id), '') IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Order ID is required';
  END IF;
  v_canonical := pos.normalize_payment_method(p_payment_method, 'cashier_pending', NULL);
  IF v_canonical <> 'cashier_cash' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Cashier settlement requires cash payment';
  END IF;

  SELECT * INTO v_order FROM pos.orders WHERE source_id = trim(p_order_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0002', message = 'Order not found'; END IF;
  IF v_order.status NOT IN ('pending', 'paid', 'completed') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'Order is not eligible for cashier settlement';
  END IF;

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, creation_time, metadata, raw
  ) VALUES (
    v_tx_id, 'income', v_order.total_amount, 'Penjualan',
    'Penjualan Pesanan #' || coalesce(v_order.order_number, '-'),
    v_now, 'cash', 'completed', v_order.source_id, v_now,
    jsonb_build_object('kind', 'cashier_order_settlement', 'orderId', v_order.source_id,
      'orderNumber', v_order.order_number, 'paymentReceiptKind', 'cashier'),
    jsonb_build_object('kind', 'cashier_order_settlement', 'orderId', v_order.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;
  v_inserted := FOUND;

  UPDATE pos.orders
  SET status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END,
      payment_method = 'cash', payment_receipt_kind = 'cashier',
      payment_channel_canonical = 'cashier_cash',
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
        'cashierSettlementAt', v_now, 'cashierSettlementTransactionId', v_tx_id)
  WHERE source_id = v_order.source_id;

  RETURN jsonb_build_object('orderId', v_order.source_id,
    'status', CASE WHEN v_order.status = 'pending' THEN 'paid' ELSE v_order.status END,
    'transactionId', v_tx_id, 'idempotent', NOT v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION pos.wallet_settle_order(
  p_customer_id text,
  p_order_id text,
  p_hold_id text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public, pg_catalog AS $$
DECLARE
  v_order pos.orders;
  v_hold pos.customer_wallet_holds;
  v_capture jsonb;
  v_financial_id text := 'fin_wallet_' || md5(p_order_id);
  v_now double precision := extract(epoch from now()) * 1000;
  v_inserted boolean := false;
BEGIN
  IF coalesce(trim(p_customer_id), '') = '' OR coalesce(trim(p_order_id), '') = '' OR coalesce(trim(p_hold_id), '') = '' THEN
    RAISE EXCEPTION 'Customer, order, dan hold wajib diisi';
  END IF;
  SELECT * INTO v_order FROM pos.orders WHERE source_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tidak ditemukan'; END IF;
  IF coalesce(v_order.customer_source_id, '') <> p_customer_id THEN RAISE EXCEPTION 'Order bukan milik customer'; END IF;
  SELECT * INTO v_hold FROM pos.customer_wallet_holds WHERE hold_id = p_hold_id FOR UPDATE;
  IF NOT FOUND OR v_hold.customer_id <> p_customer_id OR v_hold.order_id <> p_order_id THEN
    RAISE EXCEPTION 'Wallet hold tidak valid untuk order';
  END IF;
  IF v_order.status IN ('paid', 'completed') AND v_hold.status = 'captured' THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'status', v_order.status, 'order_id', p_order_id);
  END IF;

  v_capture := pos.wallet_capture_hold(p_hold_id, p_idempotency_key || ':capture');
  UPDATE pos.orders SET status = 'paid', payment_method = 'wallet',
    payment_receipt_kind = 'wallet_paid', payment_channel_canonical = 'djiwa_pay',
    delivery_status = COALESCE(delivery_status, 'paid') WHERE source_id = p_order_id;

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, creation_time, metadata, raw
  ) VALUES (
    v_financial_id, 'income', v_order.total_amount, 'Penjualan',
    'Penjualan Pesanan #' || COALESCE(v_order.order_number, '-'), v_now,
    'wallet', 'completed', p_order_id, v_now,
    jsonb_build_object('orderId', p_order_id, 'orderNumber', v_order.order_number,
      'source', 'djiwa_pay', 'paymentChannelCanonical', 'djiwa_pay'),
    jsonb_build_object('kind', 'wallet_order_settlement', 'holdId', p_hold_id)
  ) ON CONFLICT (source_id) DO NOTHING;
  v_inserted := FOUND;

  RETURN jsonb_build_object('ok', true, 'dedup', NOT v_inserted,
    'status', 'paid', 'order_id', p_order_id, 'capture', v_capture);
END;
$$;

CREATE OR REPLACE FUNCTION pos.record_mayar_financial_transaction(
  p_order_id text, p_order_number text, p_amount numeric, p_customer_name text,
  p_paid_at double precision, p_payment_gateway jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pos, public, pg_catalog AS $$
DECLARE
  v_order pos.orders%ROWTYPE;
  v_existing pos.financial_transactions%ROWTYPE;
  v_source_id text := 'fin_mayar_' || md5(btrim(p_order_id));
  v_now double precision := extract(epoch from now()) * 1000;
BEGIN
  IF nullif(btrim(p_order_id), '') IS NULL THEN RAISE EXCEPTION USING errcode = '22023', message = 'Mayar order id is required'; END IF;
  IF coalesce(p_amount, 0) < 0 THEN RAISE EXCEPTION USING errcode = '22023', message = 'Mayar amount is invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('payment-settlement:' || btrim(p_order_id)));
  SELECT * INTO v_order FROM pos.orders WHERE source_id = btrim(p_order_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0002', message = 'Mayar order not found'; END IF;
  IF abs(coalesce(v_order.total_amount, 0) - coalesce(p_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Mayar amount mismatch';
  END IF;

  SELECT * INTO v_existing FROM pos.financial_transactions
  WHERE order_source_id = btrim(p_order_id) AND tx_type = 'income'
  LIMIT 1;
  IF FOUND THEN
    UPDATE pos.orders SET payment_method = 'mayar', payment_receipt_kind = 'gateway_paid',
      payment_channel_canonical = 'qris_mayar' WHERE source_id = btrim(p_order_id);
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'sourceId', v_existing.source_id);
  END IF;

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, metadata, creation_time, raw
  ) VALUES (
    v_source_id, 'income', coalesce(p_amount, 0), 'Penjualan',
    'Penjualan Pesanan #' || coalesce(nullif(btrim(p_order_number), ''), btrim(p_order_id)),
    coalesce(p_paid_at, v_now), 'mayar', 'completed', btrim(p_order_id),
    coalesce(p_payment_gateway, '{}'::jsonb) || jsonb_build_object('orderId', btrim(p_order_id),
      'customerName', nullif(btrim(coalesce(p_customer_name, '')), '')),
    v_now, jsonb_build_object('kind', 'mayar_order_settlement', 'orderId', btrim(p_order_id),
      'orderNumber', nullif(btrim(coalesce(p_order_number, '')), ''))
  ) ON CONFLICT (source_id) DO NOTHING;

  UPDATE pos.orders SET status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END,
    payment_method = 'mayar', payment_receipt_kind = 'gateway_paid',
    payment_channel_canonical = 'qris_mayar',
    payment_gateway = coalesce(p_payment_gateway, payment_gateway)
  WHERE source_id = btrim(p_order_id);
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'sourceId', v_source_id,
    'status', CASE WHEN v_order.status = 'pending' THEN 'paid' ELSE v_order.status END);
END;
$$;

REVOKE ALL ON FUNCTION pos.normalize_payment_method(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.normalize_payment_method(text, text, jsonb) TO service_role, authenticated;
REVOKE ALL ON FUNCTION pos.settle_cashier_order(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.settle_cashier_order(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION pos.wallet_settle_order(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION pos.record_mayar_financial_transaction(text, text, numeric, text, double precision, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.record_mayar_financial_transaction(text, text, numeric, text, double precision, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
