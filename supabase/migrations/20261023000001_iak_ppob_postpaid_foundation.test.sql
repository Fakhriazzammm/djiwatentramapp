DO $$
DECLARE
  required_column text;
  required_columns text[] := ARRAY[
    'service_kind', 'service_type', 'customer_source_id', 'customer_number',
    'inquiry_payload', 'bill_amount', 'admin_fee', 'total_amount', 'wallet_hold_id',
    'payment_status', 'provider_status', 'provider_updated_at', 'last_error_code'
  ];
  required_index text;
  required_indexes text[] := ARRAY[
    'idx_ppob_transactions_customer_number',
    'idx_ppob_transactions_provider_pending'
  ];
BEGIN
  FOREACH required_column IN ARRAY required_columns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'pos' AND table_name = 'ppob_transactions' AND column_name = required_column
    ) THEN
      RAISE EXCEPTION 'missing pos.ppob_transactions column: %', required_column;
    END IF;
  END LOOP;

  FOREACH required_index IN ARRAY required_indexes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'pos' AND tablename = 'ppob_transactions' AND indexname = required_index
    ) THEN
      RAISE EXCEPTION 'missing pos.ppob_transactions index: %', required_index;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pos.ppob_transactions'::regclass
      AND conname = 'ppob_transactions_payment_status_check'
  ) THEN
    RAISE EXCEPTION 'missing payment status invariant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pos.ppob_transactions'::regclass
      AND conname = 'ppob_transactions_service_kind_check'
  ) THEN
    RAISE EXCEPTION 'missing service kind invariant';
  END IF;
END;
$$;

-- The migration is additive and settlement remains delegated to the existing
-- idempotent wallet RPCs. No PROCESS callback may capture a hold by itself.
