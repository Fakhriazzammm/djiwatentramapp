-- Explicit tax activation flag for Admin/POS/Customer.
-- Additive and idempotent; preserves existing rates and historical order snapshots.
ALTER TABLE pos.site_settings
  ADD COLUMN IF NOT EXISTS tax_enabled boolean;

-- Preserve legacy behavior for existing settings rows: a positive configured
-- rate remains active, while zero/null remains inactive.
UPDATE pos.site_settings
SET tax_enabled = COALESCE(tax_enabled, COALESCE(tax_rate, 0) > 0)
WHERE tax_enabled IS NULL;

ALTER TABLE pos.site_settings
  ALTER COLUMN tax_enabled SET DEFAULT false;

COMMENT ON COLUMN pos.site_settings.tax_enabled IS
  'Explicit activation flag for tax calculation on new orders; historical order snapshots are unchanged.';

-- The authoritative RPC reads this setting so client previews and server totals
-- cannot diverge when the Admin toggle is changed.
