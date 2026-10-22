-- Allow Grab as a customer delivery provider alongside existing courier values.
-- Additive and idempotent: historical orders remain unchanged.
BEGIN;

ALTER TABLE pos.orders
  DROP CONSTRAINT IF EXISTS pos_orders_delivery_provider_check;

ALTER TABLE pos.orders
  ADD CONSTRAINT pos_orders_delivery_provider_check
  CHECK (delivery_provider IS NULL OR delivery_provider IN ('gojek', 'grab', 'maxim'));

COMMIT;
