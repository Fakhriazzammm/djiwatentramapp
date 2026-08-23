-- Additive payment-channel snapshot for auditable shift closing.
-- Existing shift fields remain intact for backward compatibility.

ALTER TABLE pos.shifts
  ADD COLUMN IF NOT EXISTS payment_breakdown_expected jsonb,
  ADD COLUMN IF NOT EXISTS payment_breakdown_actual jsonb,
  ADD COLUMN IF NOT EXISTS payment_breakdown_variance jsonb,
  ADD COLUMN IF NOT EXISTS closing_reconciliation_status text;

-- The existing public.pos_shifts view remains unchanged for compatibility.
-- The closing snapshot is also retained in pos.shifts.raw.closingReconciliation,
-- so this migration does not replace/drop any existing view or dependent object.

-- ROLLBACK:
-- ALTER TABLE pos.shifts DROP COLUMN IF EXISTS payment_breakdown_expected;
-- ALTER TABLE pos.shifts DROP COLUMN IF EXISTS payment_breakdown_actual;
-- ALTER TABLE pos.shifts DROP COLUMN IF EXISTS payment_breakdown_variance;
-- ALTER TABLE pos.shifts DROP COLUMN IF EXISTS closing_reconciliation_status;
