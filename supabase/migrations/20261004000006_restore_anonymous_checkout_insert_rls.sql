begin;

-- The storefront checkout uses a Better Auth session, not a Supabase Auth JWT.
-- Therefore the browser Supabase client reaches Postgres as `anon`. Keep the
-- anonymous path insert-only: no read, update, delete, or enumeration access.
create policy "anon_orders_insert_checkout"
  on pos.orders
  for insert
  to anon
  with check (source_id is not null);

create policy "anon_order_items_insert_checkout"
  on pos.order_items
  for insert
  to anon
  with check (order_source_id is not null);

commit;
