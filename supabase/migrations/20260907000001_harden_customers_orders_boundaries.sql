-- 2026-09-07: Close anonymous enumeration/destructive access to customer & order data.
-- Context (verified before applying):
--   * anon previously had ALL (incl. DELETE/TRUNCATE) on pos.customers, pos.orders,
--     pos.order_items, public.pos_orders, public.pos_customers_view, plus RLS policies
--     granting anon ALL with USING true — anyone without login could read AND delete orders.
--   * Staff (POS/Admin) authenticate via Supabase `authenticated` (16/16 active staff have
--     auth_user_id after backfill), so authenticated/service_role grants keep apps working.
--   * Storefront receipt/tracking reads now go through POST /api/customer/guest-orders
--     (Better Auth server) instead of anonymous supabase reads.
--   * Anonymous INSERT on orders/order_items remains REQUIRED by the current storefront
--     checkout write path; final removal is a follow-up when checkout moves to a trusted API.

begin;

-- Customer records are managed by trusted backends; anon has no need.
revoke all on table pos.customers from anon;

-- Orders: keep anonymous INSERT for checkout, remove everything else (read/mutate/delete).
revoke select, update, delete, truncate, references, trigger
  on table pos.orders, pos.order_items from anon;
grant insert on table pos.orders, pos.order_items to anon;

-- Public projections no longer readable by anon (enumerasi pelanggan/order ditutup).
revoke all on table public.pos_customers_view, public.pos_orders from anon;

-- Staff/POS/Admin authenticated sessions and server-side service_role keep full access.
grant select on table public.pos_customers_view, public.pos_orders
  to authenticated, service_role;
grant select, insert, update, delete on table pos.customers, pos.orders, pos.order_items
  to authenticated, service_role;

commit;
