-- Expand wallet provenance for the canonical Djiwa Pay storefront.
-- Additive and idempotent: historical rows remain unchanged.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_wallet_ledger_source_app_allowlist'
      AND conrelid = 'pos.customer_wallet_ledger'::regclass
  ) THEN
    ALTER TABLE pos.customer_wallet_ledger
      DROP CONSTRAINT customer_wallet_ledger_source_app_allowlist;
  END IF;
  ALTER TABLE pos.customer_wallet_ledger
    ADD CONSTRAINT customer_wallet_ledger_source_app_allowlist
    CHECK (source_app IS NULL OR source_app IN ('djiwa-travel', 'djiwa-tentram', 'b2b', 'ordermieyamin', 'djiwapay'));

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_wallet_topups_source_app_allowlist'
      AND conrelid = 'pos.customer_wallet_topups'::regclass
  ) THEN
    ALTER TABLE pos.customer_wallet_topups
      DROP CONSTRAINT customer_wallet_topups_source_app_allowlist;
  END IF;
  ALTER TABLE pos.customer_wallet_topups
    ADD CONSTRAINT customer_wallet_topups_source_app_allowlist
    CHECK (source_app IS NULL OR source_app IN ('djiwa-travel', 'djiwa-tentram', 'b2b', 'ordermieyamin', 'djiwapay'));
END;
$$;
