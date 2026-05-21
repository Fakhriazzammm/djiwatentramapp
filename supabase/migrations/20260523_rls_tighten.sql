-- ============================================================================
-- 20260523_rls_tighten.sql
-- Supabase Auth Migration - RLS Tightening
-- ============================================================================
-- WARNING: Only run AFTER all users have logged in via Fase 1 (Supabase Auth
--          session migration 20260522_supabase_auth_preparatory.sql).
--          Running this prematurely will LOCK OUT all users who haven't
--          re-authenticated through Supabase Auth!
-- ============================================================================
-- To deploy:   supabase db query --linked --file supabase/migrations/20260523_rls_tighten.sql
-- Or via:      psql "$SUPABASE_DATABASE_URL" -f supabase/migrations/20260523_rls_tighten.sql
-- ============================================================================

begin;

-- ============================================================
-- 1. yumi_users — Revoke anon write, restrict to admin only
-- ============================================================

-- Hapus anon write grants (dari migration 20260501184500)
revoke insert, update, delete on public.yumi_users from anon;

-- Drop old wide-open anon policies
-- Note: SELECT tetap anon via migration 20260521
drop policy if exists "anon_insert_users" on public.yumi_users;
drop policy if exists "anon_update_users" on public.yumi_users;
drop policy if exists "anon_delete_users" on public.yumi_users;

-- Policy: admin can INSERT new users
create policy "admin_insert_users" on public.yumi_users
  for insert to authenticated
  with check (
    public.get_yumi_user_claims()->>'role_name' = 'admin'
  );

-- Policy: admin can UPDATE users
create policy "admin_update_users" on public.yumi_users
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin')
  with check (true);

-- Policy: admin can DELETE users
create policy "admin_delete_users" on public.yumi_users
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin');

-- ============================================================
-- 2. yumi_roles — Revoke anon write, restrict to admin only
-- ============================================================

revoke insert, update, delete on public.yumi_roles from anon;

drop policy if exists "anon_insert_roles" on public.yumi_roles;
drop policy if exists "anon_update_roles" on public.yumi_roles;
drop policy if exists "anon_delete_roles" on public.yumi_roles;

create policy "admin_insert_roles" on public.yumi_roles
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' = 'admin');

create policy "admin_update_roles" on public.yumi_roles
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin')
  with check (true);

create policy "admin_delete_roles" on public.yumi_roles
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' = 'admin');

-- ============================================================
-- 3. pos schema — Authenticated-only access
-- ============================================================

-- Revoke anon access to pos schema tables
revoke all on schema pos from anon;

-- Re-grant USAGE (required for any access) to authenticated role
grant usage on schema pos to authenticated;

-- pos.products: all CRUD for authenticated users
create policy "pos_products_auth_all" on pos.products
  for all to authenticated
  using (true)
  with check (true);

-- pos.categories: all CRUD for authenticated users
create policy "pos_categories_auth_all" on pos.categories
  for all to authenticated
  using (true)
  with check (true);

-- pos.inventory: admin/owner can write, all authenticated can read
create policy "pos_inventory_auth_select" on pos.inventory
  for select to authenticated
  using (true);

create policy "pos_inventory_auth_insert" on pos.inventory
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

create policy "pos_inventory_auth_update" on pos.inventory
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'))
  with check (true);

create policy "pos_inventory_auth_delete" on pos.inventory
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.orders: all authenticated can read/write
create policy "pos_orders_auth_all" on pos.orders
  for all to authenticated
  using (true)
  with check (true);

-- pos.order_items: all authenticated can read/write
create policy "pos_order_items_auth_all" on pos.order_items
  for all to authenticated
  using (true)
  with check (true);

-- pos.financial_transactions: admin/owner write, all authenticated read
create policy "pos_financial_tx_auth_select" on pos.financial_transactions
  for select to authenticated
  using (true);

create policy "pos_financial_tx_auth_insert" on pos.financial_transactions
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

create policy "pos_financial_tx_auth_update" on pos.financial_transactions
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'))
  with check (true);

create policy "pos_financial_tx_auth_delete" on pos.financial_transactions
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.base_recipes: admin write, all authenticated read
create policy "pos_base_recipes_auth_select" on pos.base_recipes
  for select to authenticated
  using (true);

create policy "pos_base_recipes_auth_insert" on pos.base_recipes
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

create policy "pos_base_recipes_auth_update" on pos.base_recipes
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'))
  with check (true);

create policy "pos_base_recipes_auth_delete" on pos.base_recipes
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.recipes: admin write, all authenticated read
create policy "pos_recipes_auth_select" on pos.recipes
  for select to authenticated
  using (true);

create policy "pos_recipes_auth_insert" on pos.recipes
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

create policy "pos_recipes_auth_update" on pos.recipes
  for update to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'))
  with check (true);

create policy "pos_recipes_auth_delete" on pos.recipes
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.inventory_transactions: admin write, all authenticated read
create policy "pos_inventory_tx_auth_select" on pos.inventory_transactions
  for select to authenticated
  using (true);

create policy "pos_inventory_tx_auth_insert" on pos.inventory_transactions
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

create policy "pos_inventory_tx_auth_delete" on pos.inventory_transactions
  for delete to authenticated
  using (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.stock_opname_logs: admin write, all authenticated read
create policy "pos_stock_opname_auth_select" on pos.stock_opname_logs
  for select to authenticated
  using (true);

create policy "pos_stock_opname_auth_insert" on pos.stock_opname_logs
  for insert to authenticated
  with check (public.get_yumi_user_claims()->>'role_name' in ('admin', 'owner'));

-- pos.attendance_schedules: all authenticated can CRUD
create policy "pos_attendance_schedules_auth_all" on pos.attendance_schedules
  for all to authenticated
  using (true)
  with check (true);

-- pos.attendance_import_aliases: all authenticated can CRUD
create policy "pos_attendance_aliases_auth_all" on pos.attendance_import_aliases
  for all to authenticated
  using (true)
  with check (true);

-- ============================================================
-- 4. yumi_sessions — Revoke all (hanya service_role) + tighten
-- ============================================================

-- Hanya service_role yang boleh akses tabel session
revoke all on public.yumi_sessions from anon, authenticated;

-- Drop policies if exist
drop policy if exists "anon_insert_sessions" on public.yumi_sessions;
drop policy if exists "anon_select_sessions" on public.yumi_sessions;
drop policy if exists "authenticated_select_sessions" on public.yumi_sessions;
drop policy if exists "authenticated_insert_sessions" on public.yumi_sessions;

-- Grant exactly back to service_role only
grant select, insert, update, delete on public.yumi_sessions to service_role;

-- ============================================================
-- 5. Restore minimal anon SELECT untuk public views
--    (required for registration flow — masih anon)
-- ============================================================

-- Pastikan view tetap bisa diakses anon (untuk registration flow)
grant select on public.pos_users_public to anon;
grant select on public.pos_staff_roles to anon;

-- Grant usage back so anon can access the pos schema views
grant usage on schema pos to anon;

-- ============================================================
-- 6. Verification queries (commented out — uncomment to test)
-- ============================================================
-- select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- from pg_policies
-- where tablename like 'yumi_%' or schemaname = 'pos'
-- order by tablename, cmd;

commit;
