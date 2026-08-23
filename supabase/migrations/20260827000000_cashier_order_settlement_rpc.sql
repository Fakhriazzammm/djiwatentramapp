-- Atomically settle a POS cashier payment without granting cashier direct
-- INSERT/UPDATE access to financial_transactions.

CREATE OR REPLACE FUNCTION pos.settle_cashier_order(
  p_order_id text,
  p_payment_method text DEFAULT 'cash'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_order pos.orders%ROWTYPE;
  v_now double precision := extract(epoch from now()) * 1000;
  v_tx_id text := 'fin_cashier_' || trim(p_order_id);
  v_payment_method text := lower(coalesce(nullif(trim(p_payment_method), ''), 'cash'));
  v_was_settled boolean := false;
BEGIN
  IF nullif(trim(p_order_id), '') IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Order ID is required';
  END IF;
  IF v_payment_method NOT IN ('cash', 'tunai', 'cashier') THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Cashier settlement requires cash payment';
  END IF;

  SELECT * INTO v_order
  FROM pos.orders
  WHERE source_id = trim(p_order_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Order not found';
  END IF;
  IF v_order.status IN ('cancelled', 'completed', 'paid') THEN
    RETURN jsonb_build_object('orderId', v_order.source_id, 'status', v_order.status, 'idempotent', true);
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'Order is not eligible for cashier settlement';
  END IF;

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, creation_time, metadata, raw
  ) VALUES (
    v_tx_id, 'income', v_order.total_amount, 'Penjualan',
    'Penjualan Pesanan #' || coalesce(v_order.order_number, '-'),
    v_now, v_payment_method, 'completed', v_order.source_id, v_now,
    jsonb_build_object(
      'kind', 'cashier_order_settlement',
      'orderId', v_order.source_id,
      'orderNumber', v_order.order_number,
      'paymentReceiptKind', 'cashier'
    ),
    jsonb_build_object('kind', 'cashier_order_settlement', 'orderId', v_order.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;

  UPDATE pos.orders
  SET status = 'paid', payment_method = v_payment_method,
      payment_receipt_kind = 'cashier', raw = coalesce(raw, '{}'::jsonb) ||
        jsonb_build_object('cashierSettlementAt', v_now, 'cashierSettlementTransactionId', v_tx_id)
  WHERE source_id = v_order.source_id;

  RETURN jsonb_build_object(
    'orderId', v_order.source_id, 'status', 'paid',
    'transactionId', v_tx_id, 'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION pos.settle_cashier_order(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.settle_cashier_order(text, text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
