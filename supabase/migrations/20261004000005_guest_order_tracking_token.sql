begin;
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS guest_access_token text;
COMMENT ON COLUMN pos.orders.guest_access_token IS 'Random bearer token for guest order tracking; never exposed in public.pos_orders.';
commit;
