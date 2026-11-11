-- Samakan "Kas bersih" dashboard admin dengan laporan Arus Kas
-- (apps/admin/src/hooks/use-hybrid-finance-analytics-data.ts, useHybridCashFlowReport):
--   inflow  = transaksi income berstatus completed (termasuk modal awal, sesuai laporan)
--   outflow = expense completed KECUALI HPP (category 'hpp', transaction_kind 'order_cogs',
--             atau is_cash_outflow = false). HPP dikembalikan terpisah untuk referensi.
-- is_cash_outflow memakai IS FALSE agar NULL tetap dihitung sebagai arus kas (sama dengan
-- "tx.isCashOutflow !== false" di laporan).

CREATE OR REPLACE FUNCTION public.admin_cashflow_summary(p_start double precision, p_end double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH tx AS (
    SELECT ft.tx_type,
           ft.amount,
           (lower(coalesce(ft.category, '')) = 'hpp'
            OR lower(coalesce(ft.transaction_kind, '')) = 'order_cogs'
            OR ft.is_cash_outflow IS FALSE) AS is_hpp
    FROM pos.financial_transactions ft
    WHERE ft.status = 'completed'
      AND ft.tx_date >= p_start
      AND ft.tx_date < p_end
  )
  SELECT jsonb_build_object(
    'income', COALESCE(sum(amount) FILTER (WHERE tx_type = 'income'), 0),
    'expense', COALESCE(sum(amount) FILTER (WHERE tx_type = 'expense' AND NOT is_hpp), 0),
    'hpp', COALESCE(sum(amount) FILTER (WHERE tx_type = 'expense' AND is_hpp), 0),
    'net', COALESCE(sum(amount) FILTER (WHERE tx_type = 'income'), 0)
           - COALESCE(sum(amount) FILTER (WHERE tx_type = 'expense' AND NOT is_hpp), 0)
  )
  FROM tx;
$$;

REVOKE ALL ON FUNCTION public.admin_cashflow_summary(double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cashflow_summary(double precision, double precision) TO service_role;
