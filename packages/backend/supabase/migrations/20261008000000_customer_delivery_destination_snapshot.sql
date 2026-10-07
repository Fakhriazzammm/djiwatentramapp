-- Additive delivery destination snapshot for provider dispatch.
ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS delivery_destination_snapshot jsonb;
