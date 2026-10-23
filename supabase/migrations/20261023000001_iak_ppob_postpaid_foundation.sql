ALTER TABLE pos.ppob_transactions
  ADD COLUMN IF NOT EXISTS service_kind TEXT,
  ADD COLUMN IF NOT EXISTS service_type TEXT,
  ADD COLUMN IF NOT EXISTS customer_source_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_number TEXT,
  ADD COLUMN IF NOT EXISTS inquiry_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bill_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS admin_fee NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS wallet_hold_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

UPDATE pos.ppob_transactions
SET total_amount = COALESCE(total_amount, price),
    provider_status = CASE status WHEN '0' THEN 'success' WHEN '2' THEN 'failed' ELSE 'pending' END,
    payment_status = CASE WHEN payload->>'payment_status' IN ('paid', 'failed', 'refunded') THEN payload->>'payment_status' ELSE payment_status END,
    provider_updated_at = COALESCE(provider_updated_at, updated_at)
WHERE total_amount IS NULL
   OR provider_status = 'pending'
   OR provider_updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pos.ppob_transactions'::regclass AND conname = 'ppob_transactions_service_kind_check') THEN
    ALTER TABLE pos.ppob_transactions ADD CONSTRAINT ppob_transactions_service_kind_check
      CHECK (service_kind IS NULL OR service_kind IN ('prepaid', 'postpaid')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pos.ppob_transactions'::regclass AND conname = 'ppob_transactions_payment_status_check') THEN
    ALTER TABLE pos.ppob_transactions ADD CONSTRAINT ppob_transactions_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pos.ppob_transactions'::regclass AND conname = 'ppob_transactions_provider_status_check') THEN
    ALTER TABLE pos.ppob_transactions ADD CONSTRAINT ppob_transactions_provider_status_check
      CHECK (provider_status IN ('pending', 'success', 'failed')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE pos.ppob_transactions VALIDATE CONSTRAINT ppob_transactions_service_kind_check;
ALTER TABLE pos.ppob_transactions VALIDATE CONSTRAINT ppob_transactions_payment_status_check;
ALTER TABLE pos.ppob_transactions VALIDATE CONSTRAINT ppob_transactions_provider_status_check;

CREATE INDEX IF NOT EXISTS idx_ppob_transactions_customer_number
  ON pos.ppob_transactions (customer_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ppob_transactions_provider_pending
  ON pos.ppob_transactions (provider_status, updated_at DESC)
  WHERE provider_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ppob_transactions_source_created
  ON pos.ppob_transactions (customer_source_id, created_at DESC);

REVOKE ALL ON pos.ppob_transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON pos.ppob_transactions TO service_role;
