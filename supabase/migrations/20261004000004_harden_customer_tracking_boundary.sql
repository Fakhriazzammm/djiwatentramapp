begin;

-- Customer tracking reads use the Better Auth API boundary. Anonymous clients only
-- retain the minimum insert capability required by the existing checkout flow.
drop policy if exists anon_all_orders on pos.orders;
drop policy if exists anon_all_order_items on pos.order_items;
revoke select, update, delete, truncate, references, trigger
  on table pos.orders, pos.order_items from anon;
grant insert on table pos.orders, pos.order_items to anon;

-- Do not expose the aggregate order projection to anonymous PostgREST callers.
revoke all on table public.pos_orders from anon;

commit;
