-- Set the current active customer membership validity for the 2026 member period.
-- Idempotent: rerunning keeps the same explicit expiry date and does not touch inactive customers.
UPDATE pos.customers
SET membership_expires_at = DATE '2026-12-31',
    updated_at = now()
WHERE is_active = true
  AND membership_expires_at IS DISTINCT FROM DATE '2026-12-31';
