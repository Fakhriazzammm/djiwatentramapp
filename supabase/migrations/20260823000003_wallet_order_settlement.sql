-- Atomic Djiwa Pay order settlement: capture hold, settle order finance, and create notification.
-- Prevents a successful wallet debit from ending without receipt/order notification.

CREATE OR REPLACE FUNCTION pos.wallet_settle_order(
  p_customer_id text,
  p_order_id text,
  p_hold_id text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_hold pos.customer_wallet_holds;
  v_capture jsonb;
  v_financial_id text;
  v_now double precision := extract(epoch from now()) * 1000;
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

  UPDATE pos.orders
  SET status = 'paid',
      payment_method = 'wallet',
      payment_receipt_kind = 'wallet_paid',
      delivery_status = COALESCE(delivery_status, 'paid')
  WHERE source_id = p_order_id;

  IF NOT EXISTS (SELECT 1 FROM pos.financial_transactions WHERE order_source_id = p_order_id) THEN
    v_financial_id := 'fin_wallet_' || md5(p_order_id);
    INSERT INTO pos.financial_transactions (
      source_id, tx_type, amount, category, description, tx_date,
      payment_method, status, order_source_id, creation_time, metadata, raw
    ) VALUES (
      v_financial_id, 'income', v_order.total_amount, 'Penjualan',
      'Penjualan Pesanan #' || COALESCE(v_order.order_number, '-'), v_now,
      'wallet', 'completed', p_order_id, v_now,
      jsonb_build_object('orderId', p_order_id, 'orderNumber', v_order.order_number, 'source', 'djiwa_pay'),
      jsonb_build_object('kind', 'wallet_order_settlement', 'holdId', p_hold_id)
    );
  END IF;

  INSERT INTO public.pos_notifications (
    notification_type, priority, title, message, order_source_id, order_number,
    source, dedupe_key, action_type, action_payload, created_by, created_at,
    expires_at, is_active
  ) VALUES (
    'order_paid', 'normal', 'Pembayaran Djiwa Pay Berhasil',
    'Pesanan DjiwaApp sudah dibayar dengan Djiwa Pay', p_order_id, v_order.order_number,
    'customer_self_service', 'order:' || p_order_id || ':order_paid', 'open_order',
    jsonb_build_object(
      'orderId', p_order_id, 'orderNumber', v_order.order_number,
      'source', 'djiwaapp', 'paymentMethod', 'wallet', 'paymentStatus', 'paid',
      'customerName', v_order.customer_name, 'tableNumber', v_order.table_number,
      'orderType', v_order.order_type, 'totalAmount', v_order.total_amount
    ), 'system', now(), now() + interval '30 minutes', true
  ) ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'status', 'paid', 'order_id', p_order_id, 'capture', v_capture);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.wallet_settle_order(text, text, text, text) TO service_role;
