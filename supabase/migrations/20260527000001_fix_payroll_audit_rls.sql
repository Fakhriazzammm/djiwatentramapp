-- =============================================================================
-- Fix: RLS violation on payroll_audit_logs saat check-in/out via face/PIN
--
-- Masalah:
--   Trigger payroll_shift_accrual pada legacy_mirror.documents menjalankan
--   payroll_accrual_on_check_out() yang INSERT/UPDATE payroll_run_items &
--   payslips. Tabel-tabel ini punya audit trigger yang INSERT ke
--   pos.payroll_audit_logs.
--
--   Karena trigger function default SECURITY INVOKER (jalan dengan privilege
--   user yang melakukan INSERT ke legacy_mirror.documents = anon), dan anon
--   tidak punya INSERT policy di payroll_audit_logs, maka gagal dengan error:
--     "new row violates row-level security policy for table 'payroll_audit_logs'"
--
-- Fix:
--   1. Tambah INSERT policy untuk anon pada pos.payroll_audit_logs
--   2. Ubah payroll_accrual_on_check_out() jadi SECURITY DEFINER agar jalan
--      dengan privilege pemilik function (postgres), bukan anon
-- =============================================================================

begin;

-- =============================================================================
-- 1. Grant INSERT + anon policy untuk payroll_audit_logs
-- =============================================================================
grant insert on pos.payroll_audit_logs to anon, authenticated;

drop policy if exists "payroll_audit_logs_anon_insert" on pos.payroll_audit_logs;
create policy "payroll_audit_logs_anon_insert"
  on pos.payroll_audit_logs for insert to anon, authenticated
  with check (true);

-- =============================================================================
-- 2. Ubah trigger function payroll_accrual_on_check_out jadi SECURITY DEFINER
--    agar audit trigger bisa INSERT ke payroll_audit_logs tanpa tergantung
--    privilege anon user
-- =============================================================================
alter function pos.payroll_accrual_on_check_out() security definer;

-- Juga trigger function audit payroll yang INSERT ke payroll_audit_logs
alter function pos.payroll_audit_trigger_func() security definer;

commit;
