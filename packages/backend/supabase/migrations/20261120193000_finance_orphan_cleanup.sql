-- Pembersihan income yatim existing (20 Nov 2026). Cadangan: pos.fin_orphan_backup_20261120 (25 baris, dibuat di produksi).
-- Dihapus: 15 baris (data uji PROBE/TEST dan duplikat jelas: nominal sama, selisih <= 5 menit dengan pesanan yang masih ada).
-- Dipertahankan: 10 penjualan tanpa pasangan jelas, ditandai metadata.orphanReviewed = true.
-- Laporan integritas tidak lagi menghitung baris yang sudah ditandai ditinjau.
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
        AND COALESCE(f.metadata->>'orphanReviewed', 'false') <> 'true'
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
