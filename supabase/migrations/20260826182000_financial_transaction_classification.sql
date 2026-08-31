-- Automatic classification for future financial transactions.
-- Backward-compatible: only fills classification when the caller did not provide it.

CREATE OR REPLACE FUNCTION pos.classify_financial_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tx_type = 'expense' AND upper(COALESCE(NEW.category, '')) = 'HPP' THEN
    IF NEW.order_source_id IS NOT NULL THEN
      NEW.transaction_kind := COALESCE(NEW.transaction_kind, 'order_cogs');
      NEW.cogs_order_source_id := COALESCE(NEW.cogs_order_source_id, NEW.order_source_id);
    ELSE
      NEW.transaction_kind := COALESCE(NEW.transaction_kind, 'HPP_REVIEW');
    END IF;
    NEW.is_cash_outflow := false;
  ELSIF NEW.tx_type = 'expense' THEN
    NEW.transaction_kind := COALESCE(
      NEW.transaction_kind,
      CASE
        WHEN COALESCE(NEW.metadata, '{}'::jsonb) ? 'scanItems' THEN 'purchase'
        ELSE 'operating_expense'
      END
    );
    NEW.is_cash_outflow := COALESCE(NEW.is_cash_outflow, true);
  ELSIF NEW.tx_type = 'income' THEN
    NEW.transaction_kind := COALESCE(NEW.transaction_kind, 'income');
    NEW.is_cash_outflow := COALESCE(NEW.is_cash_outflow, false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_financial_transaction ON pos.financial_transactions;
CREATE TRIGGER trg_classify_financial_transaction
  BEFORE INSERT OR UPDATE OF tx_type, category, order_source_id, metadata, transaction_kind, is_cash_outflow
  ON pos.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION pos.classify_financial_transaction();

NOTIFY pgrst, 'reload schema';
