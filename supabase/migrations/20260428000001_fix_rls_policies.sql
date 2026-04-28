-- =============================================================================
-- Fix RLS Policies for All Application Tables
--
-- Root cause: The app uses custom auth (yumi-auth edge function + PIN-based
-- login) instead of Supabase Auth. All frontend operations run under the
-- `anon` role (publishable key, no Supabase session). Without permissive RLS
-- policies on the pos and legacy_mirror schemas, INSERT/UPDATE/DELETE on those
-- tables are silently blocked even though GRANT statements exist.
--
-- Additionally, the frontend directly queries yumi_sessions / yumi_users to
-- validate session tokens — those tables had all access revoked in migration
-- 0004, so session-gated write actions fail.
--
-- Fixes applied:
--   1. Enable RLS + add permissive policies on all pos schema tables
--   2. Enable RLS + add permissive policies on legacy_mirror tables
--   3. Add SELECT access on yumi_sessions / yumi_users / yumi_roles for anon
--      (column-level grants exclude password_hash and home_pin_hash)
--   4. Grant SELECT on legacy_mirror.documents (missing from 0017)
--   5. Grant USAGE/SELECT on sequences for bigserial columns
-- =============================================================================


-- =============================================================================
-- SECTION 1: POS SCHEMA — Enable RLS + Permissive Policies
-- The pos schema is exposed via the Supabase Data API (config.toml schemas).
-- All frontend mutations target these tables using the anon key.  Without
-- explicit RLS policies every write is blocked, even with GRANT in place.
-- =============================================================================

-- categories
alter table pos.categories enable row level security;
drop policy if exists "anon_all_categories" on pos.categories;
create policy "anon_all_categories" on pos.categories
  for all to anon, authenticated using (true) with check (true);

-- products
alter table pos.products enable row level security;
drop policy if exists "anon_all_products" on pos.products;
create policy "anon_all_products" on pos.products
  for all to anon, authenticated using (true) with check (true);

-- orders
alter table pos.orders enable row level security;
drop policy if exists "anon_all_orders" on pos.orders;
create policy "anon_all_orders" on pos.orders
  for all to anon, authenticated using (true) with check (true);

-- order_items
alter table pos.order_items enable row level security;
drop policy if exists "anon_all_order_items" on pos.order_items;
create policy "anon_all_order_items" on pos.order_items
  for all to anon, authenticated using (true) with check (true);

-- inventory
alter table pos.inventory enable row level security;
drop policy if exists "anon_all_inventory" on pos.inventory;
create policy "anon_all_inventory" on pos.inventory
  for all to anon, authenticated using (true) with check (true);

-- inventory_transactions
alter table pos.inventory_transactions enable row level security;
drop policy if exists "anon_all_inventory_transactions" on pos.inventory_transactions;
create policy "anon_all_inventory_transactions" on pos.inventory_transactions
  for all to anon, authenticated using (true) with check (true);

-- inventory_stores
alter table pos.inventory_stores enable row level security;
drop policy if exists "anon_all_inventory_stores" on pos.inventory_stores;
create policy "anon_all_inventory_stores" on pos.inventory_stores
  for all to anon, authenticated using (true) with check (true);

-- financial_transactions
alter table pos.financial_transactions enable row level security;
drop policy if exists "anon_all_financial_transactions" on pos.financial_transactions;
create policy "anon_all_financial_transactions" on pos.financial_transactions
  for all to anon, authenticated using (true) with check (true);

-- discounts
alter table pos.discounts enable row level security;
drop policy if exists "anon_all_discounts" on pos.discounts;
create policy "anon_all_discounts" on pos.discounts
  for all to anon, authenticated using (true) with check (true);

-- site_settings
alter table pos.site_settings enable row level security;
drop policy if exists "anon_all_site_settings" on pos.site_settings;
create policy "anon_all_site_settings" on pos.site_settings
  for all to anon, authenticated using (true) with check (true);

-- shifts
alter table pos.shifts enable row level security;
drop policy if exists "anon_all_shifts" on pos.shifts;
create policy "anon_all_shifts" on pos.shifts
  for all to anon, authenticated using (true) with check (true);

-- financial_targets
alter table pos.financial_targets enable row level security;
drop policy if exists "anon_all_financial_targets" on pos.financial_targets;
create policy "anon_all_financial_targets" on pos.financial_targets
  for all to anon, authenticated using (true) with check (true);

-- recipes
alter table pos.recipes enable row level security;
drop policy if exists "anon_all_recipes" on pos.recipes;
create policy "anon_all_recipes" on pos.recipes
  for all to anon, authenticated using (true) with check (true);

-- base_recipes
alter table pos.base_recipes enable row level security;
drop policy if exists "anon_all_base_recipes" on pos.base_recipes;
create policy "anon_all_base_recipes" on pos.base_recipes
  for all to anon, authenticated using (true) with check (true);

-- booking_settings
alter table pos.booking_settings enable row level security;
drop policy if exists "anon_all_booking_settings" on pos.booking_settings;
create policy "anon_all_booking_settings" on pos.booking_settings
  for all to anon, authenticated using (true) with check (true);

-- booking_orders
alter table pos.booking_orders enable row level security;
drop policy if exists "anon_all_booking_orders" on pos.booking_orders;
create policy "anon_all_booking_orders" on pos.booking_orders
  for all to anon, authenticated using (true) with check (true);

-- booking_order_items
alter table pos.booking_order_items enable row level security;
drop policy if exists "anon_all_booking_order_items" on pos.booking_order_items;
create policy "anon_all_booking_order_items" on pos.booking_order_items
  for all to anon, authenticated using (true) with check (true);

-- booking_date_capacity
alter table pos.booking_date_capacity enable row level security;
drop policy if exists "anon_all_booking_date_capacity" on pos.booking_date_capacity;
create policy "anon_all_booking_date_capacity" on pos.booking_date_capacity
  for all to anon, authenticated using (true) with check (true);

-- migration_runs
alter table pos.migration_runs enable row level security;
drop policy if exists "anon_all_migration_runs" on pos.migration_runs;
create policy "anon_all_migration_runs" on pos.migration_runs
  for all to anon, authenticated using (true) with check (true);


-- =============================================================================
-- SECTION 2: LEGACY MIRROR SCHEMA — Enable RLS + Fix Missing SELECT Grant
-- legacy_mirror.documents is accessed directly by the frontend for minigames,
-- HPP calculations, attendance logs, and AI memory.  Migration 0017 only
-- granted INSERT/UPDATE/DELETE — SELECT was missing, so getMirrorDocument()
-- always returned null.
-- =============================================================================

-- Grant the missing SELECT privilege
grant select on legacy_mirror.documents to anon, authenticated;
grant select on legacy_mirror.import_runs to anon, authenticated;

-- Enable RLS and add permissive policies
alter table legacy_mirror.documents enable row level security;
drop policy if exists "anon_all_documents" on legacy_mirror.documents;
create policy "anon_all_documents" on legacy_mirror.documents
  for all to anon, authenticated using (true) with check (true);

alter table legacy_mirror.import_runs enable row level security;
drop policy if exists "anon_all_import_runs" on legacy_mirror.import_runs;
create policy "anon_all_import_runs" on legacy_mirror.import_runs
  for all to anon, authenticated using (true) with check (true);


-- =============================================================================
-- SECTION 3: PUBLIC AUTH TABLES — Allow anon to SELECT for session validation
--
-- The frontend helper getSessionUserByToken() queries yumi_sessions and
-- yumi_users directly (using the anon client) to validate session tokens
-- before performing mutations.  Migration 0004 revoked all access from anon,
-- so every session check silently returned null and all write actions failed.
--
-- Fix: re-grant SELECT on these tables with RLS policies.
-- Sensitive columns (password_hash, home_pin_hash) are excluded via
-- column-level grants so they never appear in anon query results.
-- =============================================================================

-- yumi_sessions: allow anon to look up non-expired sessions
grant select (id, token, user_source_id, expires_at, created_at, last_seen_at)
  on public.yumi_sessions to anon, authenticated;

drop policy if exists "anon_read_active_sessions" on public.yumi_sessions;
create policy "anon_read_active_sessions" on public.yumi_sessions
  for select to anon, authenticated
  using (expires_at > now());

-- yumi_users: allow anon to read user profile (exclude credential columns)
grant select (source_id, username, name, role_source_id, is_active,
              receive_report_emails, last_login_at, auth_user_id,
              face_descriptor, slug, raw)
  on public.yumi_users to anon, authenticated;

drop policy if exists "anon_read_active_users" on public.yumi_users;
create policy "anon_read_active_users" on public.yumi_users
  for select to anon, authenticated
  using (is_active = true);

-- yumi_roles: allow anon to read role definitions (needed for permission checks)
grant select on public.yumi_roles to anon, authenticated;

drop policy if exists "anon_read_roles" on public.yumi_roles;
create policy "anon_read_roles" on public.yumi_roles
  for select to anon, authenticated
  using (true);


-- =============================================================================
-- SECTION 4: SEQUENCE GRANTS for bigserial / serial columns
--
-- Tables with auto-increment PKs need USAGE + SELECT on their sequence so
-- that anon/authenticated can INSERT rows.  Without these, Supabase returns
-- "permission denied for sequence …_id_seq" and inserts fail silently or
-- with an opaque error.
-- =============================================================================

grant usage, select on sequence pos.order_items_id_seq to anon, authenticated;
grant usage, select on sequence pos.booking_order_items_id_seq to anon, authenticated;
grant usage, select on sequence pos.migration_runs_id_seq to anon, authenticated;
grant usage, select on sequence legacy_mirror.import_runs_id_seq to anon, authenticated;
