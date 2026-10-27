-- Keep POS checkout writes atomic from the cashier's perspective.
-- Cashiers may create orders, but RLS intentionally prevents direct finance
-- ledger inserts. This security-definer RPC is the single idempotent bridge.

CREATE OR REPLACE FUNCTION pos.repair_pos_order_settlement(
  p_order_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_order pos.orders%ROWTYPE;
  v_existing text;
  v_now double precision := extract(epoch FROM now()) * 1000;
  v_payment_method text;
  v_tx_id text;
BEGIN
  IF nullif(trim(p_order_id), '') IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Order ID is required';
  END IF;

  SELECT * INTO v_order
  FROM pos.orders
  WHERE source_id = trim(p_order_id)
    AND source = 'pos'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'POS order not found';
  END IF;
  IF v_order.status NOT IN ('paid', 'completed') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'POS order is not paid';
  END IF;

  SELECT source_id INTO v_existing
  FROM pos.financial_transactions
  WHERE order_source_id = v_order.source_id
    AND tx_type = 'income'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'orderId', v_order.source_id,
      'transactionId', v_existing,
      'repaired', false,
      'idempotent', true
    );
  END IF;

  v_payment_method := lower(coalesce(nullif(trim(v_order.payment_method), ''), 'cash'));
  IF v_payment_method = 'tunai' THEN
    v_payment_method := 'cash';
  END IF;
  v_tx_id := 'fin_pos_settlement_' || trim(v_order.source_id);

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, creation_time, metadata, raw
  ) VALUES (
    v_tx_id,
    'income',
    v_order.total_amount,
    'Penjualan',
    'Penjualan Pesanan #' || coalesce(v_order.order_number, '-'),
    coalesce(v_order.created_at, v_now),
    v_payment_method,
    'completed',
    v_order.source_id,
    v_now,
    jsonb_build_object(
      'dailyReceiptNo', v_order.daily_receipt_no,
      'orderNumber', v_order.order_number,
      'source', 'pos'
    ),
    jsonb_build_object(
      'kind', 'order_settlement_repair',
      'orderId', v_order.source_id,
      'orderNumber', v_order.order_number
    )
  ) ON CONFLICT (source_id) DO NOTHING;

  RETURN jsonb_build_object(
    'orderId', v_order.source_id,
    'transactionId', v_tx_id,
    'repaired', true,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION pos.repair_pos_order_settlement(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.repair_pos_order_settlement(text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
