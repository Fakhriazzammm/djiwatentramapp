-- Wallet provenance contract: preserve historical NULLs and tag only validated app writes.
-- Additive and idempotent. No balance, settlement, or historical values are rewritten.

ALTER TABLE pos.customer_wallet_ledger
  ADD COLUMN IF NOT EXISTS source_app text;

ALTER TABLE pos.customer_wallet_topups
  ADD COLUMN IF NOT EXISTS source_app text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_wallet_ledger_source_app_allowlist'
      AND conrelid = 'pos.customer_wallet_ledger'::regclass
  ) THEN
    ALTER TABLE pos.customer_wallet_ledger
      ADD CONSTRAINT customer_wallet_ledger_source_app_allowlist
      CHECK (source_app IS NULL OR source_app IN ('djiwa-travel', 'djiwa-tentram', 'b2b', 'ordermieyamin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_wallet_topups_source_app_allowlist'
      AND conrelid = 'pos.customer_wallet_topups'::regclass
  ) THEN
    ALTER TABLE pos.customer_wallet_topups
      ADD CONSTRAINT customer_wallet_topups_source_app_allowlist
      CHECK (source_app IS NULL OR source_app IN ('djiwa-travel', 'djiwa-tentram', 'b2b', 'ordermieyamin'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_customer_source_created
  ON pos.customer_wallet_ledger (customer_id, source_app, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_topups_customer_source_created
  ON pos.customer_wallet_topups (customer_id, source_app, created_at DESC);

CREATE OR REPLACE FUNCTION pos.wallet_copy_topup_source_app()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  IF NEW.source_app IS NULL AND NEW.reference_type = 'wallet_topup' AND NEW.reference_id IS NOT NULL THEN
    SELECT t.source_app INTO NEW.source_app
    FROM pos.customer_wallet_topups t
    WHERE t.topup_id = NEW.reference_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'customer_wallet_ledger_copy_topup_source_app'
      AND tgrelid = 'pos.customer_wallet_ledger'::regclass
  ) THEN
    CREATE TRIGGER customer_wallet_ledger_copy_topup_source_app
      BEFORE INSERT ON pos.customer_wallet_ledger
      FOR EACH ROW EXECUTE FUNCTION pos.wallet_copy_topup_source_app();
  END IF;
END;
$$;

COMMENT ON COLUMN pos.customer_wallet_ledger.source_app IS
  'Validated server-side application provenance; NULL is retained for historical or unknown rows.';
COMMENT ON COLUMN pos.customer_wallet_topups.source_app IS
  'Validated server-side application provenance; NULL is retained for historical or unknown rows.';
