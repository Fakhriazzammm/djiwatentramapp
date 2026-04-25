-- Grant USAGE on pos schema so authenticated/anon roles can access tables directly
-- (required for supabase.schema("pos") client calls to work)
grant usage on schema pos to anon, authenticated;
grant usage on schema legacy_mirror to anon, authenticated;

-- Read grants (covers tables not already accessible via public views)
grant select on all tables in schema pos to anon, authenticated;

-- Write grants for pos tables that receive client-side mutations
grant insert, update, delete on pos.shifts to anon, authenticated;
grant insert, update, delete on pos.financial_transactions to anon, authenticated;
grant insert, update, delete on pos.financial_targets to anon, authenticated;
grant insert, update, delete on pos.orders to anon, authenticated;
grant insert, update, delete on pos.order_items to anon, authenticated;
grant insert, update, delete on pos.inventory to anon, authenticated;
grant insert, update, delete on pos.inventory_transactions to anon, authenticated;
grant insert, update, delete on pos.categories to anon, authenticated;
grant insert, update, delete on pos.products to anon, authenticated;
grant insert, update, delete on pos.discounts to anon, authenticated;
grant insert, update, delete on pos.site_settings to anon, authenticated;
grant insert, update, delete on pos.booking_orders to anon, authenticated;
grant insert, update, delete on pos.booking_order_items to anon, authenticated;
grant insert, update, delete on pos.booking_settings to anon, authenticated;
grant insert, update, delete on pos.booking_date_capacity to anon, authenticated;
grant insert, update, delete on pos.base_recipes to anon, authenticated;
grant insert, update, delete on pos.recipes to anon, authenticated;
grant insert, update, delete on pos.inventory_stores to anon, authenticated;

-- Write grants for legacy_mirror schema
grant insert, update, delete on legacy_mirror.documents to anon, authenticated;
