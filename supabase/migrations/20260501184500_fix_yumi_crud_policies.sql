-- =============================================================================
-- Fix: Add INSERT, UPDATE, DELETE grants + RLS policies for yumi_users/roles
--
-- Root Cause: Initial migration (0004_auth_core.sql) ran:
--   revoke all on public.yumi_users from anon, authenticated;
--   revoke all on public.yumi_roles from anon, authenticated;
--
-- Later migrations only added SELECT grants + RLS SELECT policy
-- (anon_read_active_users). INSERT, UPDATE, DELETE were never re-granted.
--
-- The hybrid hooks write directly to yumi_users/yumi_roles using the browser
-- Supabase client (anon key), so admin user CRUD from /admin/operational-team
-- was silently failing with "permission denied for table yumi_users".
--
-- Fix: Re-grant INSERT/UPDATE/DELETE and add corresponding RLS policies.
-- =============================================================================

-- =============================================================================
-- yumi_users: Re-grant write permissions
-- =============================================================================
grant insert, update, delete on public.yumi_users to anon, authenticated;

-- =============================================================================
-- yumi_users: INSERT policy (create user)
-- =============================================================================
drop policy if exists "anon_insert_users" on public.yumi_users;
create policy "anon_insert_users" on public.yumi_users
  for insert to anon, authenticated
  with check (true);

-- =============================================================================
-- yumi_users: UPDATE policy (edit user)
-- =============================================================================
drop policy if exists "anon_update_users" on public.yumi_users;
create policy "anon_update_users" on public.yumi_users
  for update to anon, authenticated
  using (true)
  with check (true);

-- =============================================================================
-- yumi_users: DELETE policy (delete user)
-- =============================================================================
drop policy if exists "anon_delete_users" on public.yumi_users;
create policy "anon_delete_users" on public.yumi_users
  for delete to anon, authenticated
  using (true);

-- =============================================================================
-- yumi_roles: Re-grant write permissions
-- =============================================================================
grant insert, update, delete on public.yumi_roles to anon, authenticated;

-- =============================================================================
-- yumi_roles: INSERT policy (create role)
-- =============================================================================
drop policy if exists "anon_insert_roles" on public.yumi_roles;
create policy "anon_insert_roles" on public.yumi_roles
  for insert to anon, authenticated
  with check (true);

-- =============================================================================
-- yumi_roles: UPDATE policy (edit role)
-- =============================================================================
drop policy if exists "anon_update_roles" on public.yumi_roles;
create policy "anon_update_roles" on public.yumi_roles
  for update to anon, authenticated
  using (true)
  with check (true);

-- =============================================================================
-- yumi_roles: DELETE policy (delete role)
-- =============================================================================
drop policy if exists "anon_delete_roles" on public.yumi_roles;
create policy "anon_delete_roles" on public.yumi_roles
  for delete to anon, authenticated
  using (true);
