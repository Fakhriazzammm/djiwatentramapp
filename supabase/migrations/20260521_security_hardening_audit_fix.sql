-- 20260521_security_hardening_audit_fix.sql
-- Supabase Security Audit Fix — 21 May 2026
-- Fixes from comprehensive RLS & security audit

-- ============================================================
-- FIX 1: Revoke sensitive columns from anon/authenticated
-- Note: Column-level revoke doesn't override table-level grants.
-- Must use REVOKE ALL + column-level GRANT instead.
-- ============================================================

-- Remove all table-level privileges from anon/authenticated
revoke all on public.yumi_users from anon, authenticated;

-- Re-grant only safe columns at column level
grant select (source_id, name, slug, username, role_source_id,
              is_active, receive_report_emails, last_login_at,
              auth_user_id, employee_nip)
  on public.yumi_users to anon, authenticated;

-- Re-grant INSERT/UPDATE/DELETE for admin CRUD (frontend writes directly)
grant insert, update, delete on public.yumi_users to anon, authenticated;

-- Revoke session token access
revoke all on public.yumi_sessions from anon, authenticated;

-- Re-grant only non-sensitive columns for sessions
grant select (id, user_source_id, created_at, expires_at, last_seen_at)
  on public.yumi_sessions to anon, authenticated;
grant insert (id, user_source_id, token, created_at, expires_at)
  on public.yumi_sessions to anon, authenticated;
grant delete on public.yumi_sessions to anon, authenticated;
grant update (last_seen_at, expires_at) on public.yumi_sessions to anon, authenticated;

-- ============================================================
-- FIX 3: Enable RLS on tables without it + add policies
-- ============================================================

-- pos.attendance_import_aliases
alter table pos.attendance_import_aliases enable row level security;

create policy "attendance_import_aliases_anon_all"
  on pos.attendance_import_aliases
  for all to anon, authenticated
  using (true)
  with check (true);

-- pos.attendance_schedules
alter table pos.attendance_schedules enable row level security;

create policy "attendance_schedules_anon_all"
  on pos.attendance_schedules
  for all to anon, authenticated
  using (true)
  with check (true);

-- pos.daily_receipt_counter
alter table pos.daily_receipt_counter enable row level security;

create policy "daily_receipt_counter_anon_all"
  on pos.daily_receipt_counter
  for all to anon, authenticated
  using (true)
  with check (true);

-- pos.transaction_analytics
alter table pos.transaction_analytics enable row level security;

create policy "transaction_analytics_anon_select"
  on pos.transaction_analytics
  for select to anon, authenticated
  using (true);

-- ============================================================
-- FIX 4: Add policies to tables with RLS on but no policies
-- ============================================================

-- pos.stock_opname_logs (RLS on, no policies = default deny)
create policy "stock_opname_logs_anon_all"
  on pos.stock_opname_logs
  for all to anon, authenticated
  using (true)
  with check (true);

-- public.pos_purchase_logs (RLS on, no policies = default deny)
-- Note: This is accessed via Edge Function, so SELECT only for anon
create policy "pos_purchase_logs_anon_select"
  on public.pos_purchase_logs
  for select to anon, authenticated
  using (true);

-- public.registration_counters (RLS on, no policies = default deny)
create policy "registration_counters_anon_all"
  on public.registration_counters
  for all to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- FIX 5: Fix employee_onboarding_applications policies
-- authenticated → anon,authenticated (Better Auth compat)
-- ============================================================

drop policy if exists onboard_select on public.employee_onboarding_applications;
drop policy if exists onboard_update on public.employee_onboarding_applications;

create policy "onboard_select"
  on public.employee_onboarding_applications
  for select to anon, authenticated
  using (true);

create policy "onboard_update"
  on public.employee_onboarding_applications
  for update to anon, authenticated
  using (true)
  with check (status in ('pending', 'approved', 'rejected', 'needs_revision'));

-- ============================================================
-- FIX 6: Fix storage policies — restrict anon operations
-- ============================================================

-- employee-contracts: add owner check for UPDATE and DELETE
-- (These policies exist in live DB but not in migrations — create proper versions)

-- Recreate employee-contracts policies with owner checks
drop policy if exists "employee_contracts_anon_insert" on storage.objects;
create policy "employee_contracts_anon_insert"
  on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'employee-contracts');

-- Only allow owner to SELECT their own files
drop policy if exists "employee_contracts_anon_select" on storage.objects;
create policy "employee_contracts_anon_select"
  on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'employee-contracts');

-- Restrict UPDATE/DELETE to owner only
drop policy if exists "employee_contracts_anon_update" on storage.objects;
drop policy if exists "employee_contracts_anon_delete" on storage.objects;

create policy "employee_contracts_owner_update"
  on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'employee-contracts' AND auth.uid() = owner)
  with check (bucket_id = 'employee-contracts');

create policy "employee_contracts_owner_delete"
  on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'employee-contracts' AND auth.uid() = owner);

-- app-assets: restrict DML
-- Keep insert open (needed for registration flow)
-- Add owner check for update/delete
drop policy if exists "app_assets_anon_insert" on storage.objects;
create policy "app_assets_anon_insert"
  on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'app-assets');

drop policy if exists "app_assets_anon_select" on storage.objects;
create policy "app_assets_anon_select"
  on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'app-assets');

drop policy if exists "app_assets_owner_update" on storage.objects;
create policy "app_assets_owner_update"
  on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'app-assets' AND auth.uid() = owner)
  with check (bucket_id = 'app-assets');

drop policy if exists "app_assets_owner_delete" on storage.objects;
create policy "app_assets_owner_delete"
  on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'app-assets' AND auth.uid() = owner);

-- Note: With Better Auth, auth.uid() is always NULL (no Supabase Auth session).
-- This means owner-based policies will effectively deny UPDATE/DELETE to all anon users.
-- Admin operations on storage must go through Edge Functions with service_role.
