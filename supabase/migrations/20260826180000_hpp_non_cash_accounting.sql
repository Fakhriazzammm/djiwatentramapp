-- Reclassify linked HPP transactions as non-cash COGS.
-- Additive/safe: keeps financial transaction and accounting history, but moves
-- linked HPP journal from cash to inventory. Five unlinked HPP rows remain review.

INSERT INTO public.accounting_chart_of_accounts (code, name, type, normal_balance)
VALUES ('5-2500', 'Harga Pokok Penjualan (HPP/COGS)', 'expense', 'debit')
ON CONFLICT (code) DO NOTHING;

-- Backup the affected accounting rows before reclassification.
CREATE TABLE IF NOT EXISTS public.accounting_entries_hpp_backup_20260826 AS
SELECT ae.*
FROM public.accounting_entries ae
JOIN pos.financial_transactions ft
  ON ft.source_id = ae.transaction_source_id
WHERE ft.tx_type = 'expense'
  AND ft.category = 'HPP'
  AND ft.order_source_id IS NOT NULL;

-- Classify only HPP rows that are linked to a real order.
UPDATE pos.financial_transactions
SET transaction_kind = 'order_cogs',
    is_cash_outflow = false,
    cogs_order_source_id = order_source_id,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{accountingClassification}',
      '"non_cash_cogs"'::jsonb,
      true
    )
WHERE tx_type = 'expense'
  AND category = 'HPP'
  AND order_source_id IS NOT NULL
  AND (transaction_kind IS DISTINCT FROM 'order_cogs'
       OR is_cash_outflow IS DISTINCT FROM false);

-- Unlinked HPP cannot be safely classified as order COGS.
UPDATE pos.financial_transactions
SET transaction_kind = 'HPP_REVIEW',
    is_cash_outflow = false,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{accountingClassification}',
      '"review_unlinked_hpp"'::jsonb,
      true
    )
WHERE tx_type = 'expense'
  AND category = 'HPP'
  AND order_source_id IS NULL
  AND transaction_kind IS NULL;

-- Reclassify existing linked HPP journal entries:
-- Debit operating expense -> Debit COGS; Credit cash -> Credit inventory.
UPDATE public.accounting_entries ae
SET coa_id = coa.id,
    description = COALESCE(ae.description, 'HPP/COGS') || ' [non-cash COGS]'
FROM public.accounting_chart_of_accounts coa,
     pos.financial_transactions ft
WHERE ft.source_id = ae.transaction_source_id
  AND ft.tx_type = 'expense'
  AND ft.category = 'HPP'
  AND ft.order_source_id IS NOT NULL
  AND (
    (ae.entry_type = 'debit' AND coa.code = '5-2500')
    OR (ae.entry_type = 'kredit' AND coa.code = '1-2000')
  );

-- Future HPP inserts use Debit COGS / Credit Inventory.
CREATE OR REPLACE FUNCTION public.fn_create_accounting_entries(
  p_source_id text,
  p_tx_type text,
  p_amount numeric,
  p_category text default null,
  p_description text default null,
  p_payment_method text default null
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_coa_debit text;
  v_coa_kredit text;
  v_coa_id_debit uuid;
  v_coa_id_kredit uuid;
  v_desc text;
BEGIN
  IF p_amount <= 0 THEN RETURN; END IF;
  v_desc := coalesce(p_description, p_category, 'Transaksi');

  IF p_tx_type = 'income' THEN
    v_coa_debit := public.fn_map_cash_coa(p_payment_method);
    v_coa_kredit := '4-1000';
  ELSIF p_tx_type = 'expense' AND upper(coalesce(p_category, '')) = 'HPP' THEN
    v_coa_debit := '5-2500';
    v_coa_kredit := '1-2000';
  ELSIF p_tx_type = 'expense' THEN
    v_coa_debit := public.fn_map_expense_coa(p_category, p_description);
    v_coa_kredit := public.fn_map_cash_coa(p_payment_method);
  ELSE
    RETURN;
  END IF;

  SELECT id INTO v_coa_id_debit FROM public.accounting_chart_of_accounts WHERE code = v_coa_debit;
  SELECT id INTO v_coa_id_kredit FROM public.accounting_chart_of_accounts WHERE code = v_coa_kredit;
  IF v_coa_id_debit IS NULL OR v_coa_id_kredit IS NULL THEN
    RAISE WARNING 'COA not found: debit=%, kredit=%', v_coa_debit, v_coa_kredit;
    RETURN;
  END IF;

  INSERT INTO public.accounting_entries (transaction_source_id, coa_id, entry_type, amount, description, item_index)
  VALUES (p_source_id, v_coa_id_debit, 'debit', p_amount, v_desc, 0)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.accounting_entries (transaction_source_id, coa_id, entry_type, amount, description, item_index)
  VALUES (p_source_id, v_coa_id_kredit, 'kredit', p_amount, v_desc, 1)
  ON CONFLICT DO NOTHING;
END;
$$;

NOTIFY pgrst, 'reload schema';
