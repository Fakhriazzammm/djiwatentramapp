-- =============================================================================
-- Fix: Payroll tables RLS — anon access via public views
-- =============================================================================
-- Masalah: Semua public view payroll (pos_payslips, dll) adalah security_invoker
-- = true (default). RLS di pos.payroll_* hanya mengizinkan authenticated +
-- service_role. Karena app pakai Better Auth, semua frontend request sebagai
-- anon → payroll data tidak bisa diakses.
--
-- Fix: 
--   1. Set security_invoker = false pada semua payroll public views
--      (sama seperti migration 0015_public_view_security_fix.sql)
--   2. Tambah anon SELECT policy di tabel pos payroll sebagai defense-in-depth
-- =============================================================================

-- =============================================================================
-- PART 1: Set security_invoker = false pada payroll public views
-- =============================================================================

alter view public.pos_payroll_periods set (security_invoker = false);
alter view public.pos_payroll_runs set (security_invoker = false);
alter view public.pos_payroll_run_items set (security_invoker = false);
alter view public.pos_payslips set (security_invoker = false);
alter view public.pos_payroll_audit_logs set (security_invoker = false);
alter view public.pos_payroll_role_rules set (security_invoker = false);
alter view public.pos_payroll_user_overrides set (security_invoker = false);
alter view public.pos_payroll_staff_active_view set (security_invoker = false);
alter view public.pos_attendance_payroll_summary_view set (security_invoker = false);

-- =============================================================================
-- PART 2: Defense-in-depth — tambah anon SELECT policies di tabel pos payroll
-- =============================================================================

-- payslips
drop policy if exists "payroll_payslips_anon_select" on pos.payslips;
create policy "payroll_payslips_anon_select"
  on pos.payslips for select to anon, authenticated
  using (true);

-- payroll_periods
drop policy if exists "payroll_periods_anon_select" on pos.payroll_periods;
create policy "payroll_periods_anon_select"
  on pos.payroll_periods for select to anon, authenticated
  using (true);

-- payroll_runs
drop policy if exists "payroll_runs_anon_select" on pos.payroll_runs;
create policy "payroll_runs_anon_select"
  on pos.payroll_runs for select to anon, authenticated
  using (true);

-- payroll_run_items
drop policy if exists "payroll_run_items_anon_select" on pos.payroll_run_items;
create policy "payroll_run_items_anon_select"
  on pos.payroll_run_items for select to anon, authenticated
  using (true);

-- payroll_audit_logs
drop policy if exists "payroll_audit_logs_anon_select" on pos.payroll_audit_logs;
create policy "payroll_audit_logs_anon_select"
  on pos.payroll_audit_logs for select to anon, authenticated
  using (true);

-- payroll_role_rules
drop policy if exists "payroll_role_rules_anon_select" on pos.payroll_role_rules;
create policy "payroll_role_rules_anon_select"
  on pos.payroll_role_rules for select to anon, authenticated
  using (true);

-- payroll_user_overrides
drop policy if exists "payroll_user_overrides_anon_select" on pos.payroll_user_overrides;
create policy "payroll_user_overrides_anon_select"
  on pos.payroll_user_overrides for select to anon, authenticated
  using (true);

-- NOTE: UPDATE/INSERT/DELETE tetap hanya via service_role (edge function)
-- Hanya SELECT yang dibuka untuk anon via public views.
