-- Global read state for the single-branch POS notification center.
-- Additive: legacy per-user read rows remain intact for rollback/history.
ALTER TABLE public.pos_notifications
  ADD COLUMN IF NOT EXISTS global_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS global_acknowledged_at timestamptz;
