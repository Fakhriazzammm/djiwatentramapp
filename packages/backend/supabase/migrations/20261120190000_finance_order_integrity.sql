-- Integritas keuangan pesanan.
-- 1) Menghapus pesanan ikut menghapus income-nya (RLS membuat kasir non-admin gagal menghapus income dari klien -> income yatim).
-- 2) Label "Penjualan Pesanan #-" diperbaiki: nomor pesanan baru terbit saat settlement.
-- 3) Fungsi cek integritas untuk deteksi income yatim dan selisih total.

CREATE OR REPLACE FUNCTION pos.cascade_delete_order_income()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM pos.financial_transactions
  WHERE order_source_id = OLD.source_id AND tx_type = 'income';
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION pos.cascade_delete_order_income() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cascade_delete_order_income ON pos.orders;
CREATE TRIGGER trg_cascade_delete_order_income
  BEFORE DELETE ON pos.orders
  FOR EACH ROW EXECUTE FUNCTION pos.cascade_delete_order_income();

CREATE OR REPLACE FUNCTION pos.settle_cashier_order(
  p_order_id text,
  p_payment_method text DEFAULT 'cash'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_order pos.orders%ROWTYPE;
  v_now double precision := extract(epoch from now()) * 1000;
  v_tx_id text := 'fin_cashier_' || trim(p_order_id);
  v_canonical text;
  v_inserted boolean := false;
  v_status text;
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
  v_status := CASE WHEN v_order.status = 'pending' THEN 'paid' ELSE v_order.status END;

  -- Update dulu agar trigger menerbitkan nomor pesanan sebelum income dicatat.
  UPDATE pos.orders
  SET status = v_status,
      payment_method = 'cash', payment_receipt_kind = 'cashier',
      payment_channel_canonical = 'cashier_cash',
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
        'cashierSettlementAt', v_now, 'cashierSettlementTransactionId', v_tx_id)
  WHERE source_id = v_order.source_id;

  SELECT * INTO v_order FROM pos.orders WHERE source_id = v_order.source_id;

  INSERT INTO pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, creation_time, metadata, raw
  ) VALUES (
    v_tx_id, 'income', v_order.total_amount, 'Penjualan',
    'Penjualan Pesanan #' || coalesce(nullif(btrim(v_order.order_number), ''), v_order.source_id),
    v_now, 'cash', 'completed', v_order.source_id, v_now,
    jsonb_build_object('kind', 'cashier_order_settlement', 'orderId', v_order.source_id,
      'orderNumber', v_order.order_number, 'paymentReceiptKind', 'cashier'),
    jsonb_build_object('kind', 'cashier_order_settlement', 'orderId', v_order.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;
  v_inserted := FOUND;

  RETURN jsonb_build_object('orderId', v_order.source_id, 'status', v_status,
    'transactionId', v_tx_id, 'idempotent', NOT v_inserted);
END;
$function$;

REVOKE ALL ON FUNCTION pos.settle_cashier_order(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.settle_cashier_order(text, text) TO authenticated, service_role;

-- Isi ulang label lama "#-" dari nomor pesanan yang kini sudah ada. Hanya deskripsi dan metadata, nominal tidak berubah.
UPDATE pos.financial_transactions f
SET description = 'Penjualan Pesanan #' || o.order_number,
    metadata = coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object('orderNumber', o.order_number)
FROM pos.orders o
WHERE o.source_id = f.order_source_id
  AND f.tx_type = 'income'
  AND f.description = 'Penjualan Pesanan #-'
  AND nullif(btrim(o.order_number), '') IS NOT NULL;

-- Cek integritas: income tanpa pesanan, pesanan lunas tanpa income, nominal tidak sama.
CREATE OR REPLACE FUNCTION public.finance_integrity_report(p_since_ms double precision DEFAULT 0)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $$
  SELECT jsonb_build_object(
    'orphanIncome', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.source_id, 'orderId', f.order_source_id,
        'description', f.description, 'amount', f.amount, 'txDate', f.tx_date) ORDER BY f.tx_date DESC)
      FROM pos.financial_transactions f
      WHERE f.tx_type = 'income' AND f.order_source_id IS NOT NULL AND f.tx_date >= p_since_ms
        AND NOT EXISTS (SELECT 1 FROM pos.orders o WHERE o.source_id = f.order_source_id)), '[]'::jsonb),
    'paidWithoutIncome', COALESCE((SELECT jsonb_agg(jsonb_build_object('orderId', o.source_id, 'orderNumber', o.order_number, 'amount', o.total_amount))
      FROM pos.orders o
      WHERE o.status IN ('paid', 'completed') AND o.created_at >= p_since_ms AND o.total_amount > 0
        AND NOT EXISTS (SELECT 1 FROM pos.financial_transactions f WHERE f.order_source_id = o.source_id AND f.tx_type = 'income')), '[]'::jsonb),
    'amountMismatch', COALESCE((SELECT jsonb_agg(jsonb_build_object('orderId', o.source_id, 'orderNumber', o.order_number,
        'orderAmount', o.total_amount, 'incomeAmount', f.amount))
      FROM pos.financial_transactions f JOIN pos.orders o ON o.source_id = f.order_source_id
      WHERE f.tx_type = 'income' AND f.tx_date >= p_since_ms AND f.amount <> o.total_amount), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.finance_integrity_report(double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_integrity_report(double precision) TO service_role;
NOTIFY pgrst, 'reload schema';
