-- =============================================================================
-- Fix: Enable RLS + Add Policies untuk 6 tabel yang missing
-- 
-- Latar belakang:
--   Audit RLS menemukan 6 tabel yang bermasalah:
--     1. pos.stock_opname_logs        — RLS on, 0 policy (blocked, padahal ada grant anon)
--     2. public.pos_purchase_logs      — RLS on, 0 policy (blocked, padahal GRANT ALL TO anon)
--     3. pos.attendance_import_aliases — RLS off (wide open)
--     4. pos.attendance_schedules      — RLS off (wide open, frontend langsung DELETE/INSERT via anon)
--     5. pos.daily_receipt_counter     — RLS off (wide open, RPC security definer handle write)
--     6. pos.transaction_analytics     — RLS off (wide open, tidak ada migration asal)
-- =============================================================================

-- =============================================================================
-- 1. pos.stock_opname_logs
--    RLS on (default), 0 policies → semua diblok
--    Migration asli ada: grant insert, select, update to anon
--    Fix: tambah anon_all policy agar grant berlaku
-- =============================================================================
alter table pos.stock_opname_logs enable row level security;

drop policy if exists "anon_all_stock_opname_logs" on pos.stock_opname_logs;
create policy "anon_all_stock_opname_logs"
  on pos.stock_opname_logs
  for all to anon, authenticated
  using (true) with check (true);

-- =============================================================================
-- 2. public.pos_purchase_logs
--    RLS on, 0 policies → semua diblok
--    Migration asli ada: GRANT ALL TO anon, authenticated, service_role
--    Fix: tambah anon_all policy agar grant berlaku
-- =============================================================================
alter table public.pos_purchase_logs enable row level security;

drop policy if exists "anon_all_pos_purchase_logs" on public.pos_purchase_logs;
create policy "anon_all_pos_purchase_logs"
  on public.pos_purchase_logs
  for all to anon, authenticated
  using (true) with check (true);

-- =============================================================================
-- 3. pos.attendance_import_aliases
--    RLS off → siapapun bisa akses langsung via REST API
--    Ada public view (security_invoker = false) untuk anon reads — tetap works
--    Base table hanya untuk service_role — enable RLS untuk block direct anon access
--    Fix: enable RLS + tambah anon_all policy (konsisten dengan tabel pos lain)
-- =============================================================================
alter table pos.attendance_import_aliases enable row level security;

drop policy if exists "anon_all_attendance_import_aliases" on pos.attendance_import_aliases;
create policy "anon_all_attendance_import_aliases"
  on pos.attendance_import_aliases
  for all to anon, authenticated
  using (true) with check (true);

-- =============================================================================
-- 4. pos.attendance_schedules
--    RLS off → siapapun bisa akses langsung via REST API
--    FRONTEND langsung DELETE/INSERT via anon key (attendance-schedule-import.ts)
--    Ada public view (security_invoker = false) untuk anon reads
--    Fix: enable RLS + tambah anon_all policy (konsisten dengan tabel pos lain)
-- =============================================================================
alter table pos.attendance_schedules enable row level security;

drop policy if exists "anon_all_attendance_schedules" on pos.attendance_schedules;
create policy "anon_all_attendance_schedules"
  on pos.attendance_schedules
  for all to anon, authenticated
  using (true) with check (true);

-- =============================================================================
-- 5. pos.daily_receipt_counter
--    RLS off → siapapun bisa akses langsung
--    RPC next_daily_receipt_no() sudah SECURITY DEFINER → bypass RLS
--    Fix: enable RLS + SELECT policy (RPC handle INSERT/UPDATE)
-- =============================================================================
alter table pos.daily_receipt_counter enable row level security;

drop policy if exists "daily_receipt_counter_select" on pos.daily_receipt_counter;
create policy "daily_receipt_counter_select"
  on pos.daily_receipt_counter
  for select to anon, authenticated
  using (true);

-- =============================================================================
-- 6. pos.transaction_analytics
--    RLS off → siapapun bisa akses langsung
--    Tidak ada migration asal — tabel dibuat di luar migration system
--    Fix: enable RLS + tambah anon_all policy (konsisten dengan tabel pos lain)
-- =============================================================================
alter table pos.transaction_analytics enable row level security;

drop policy if exists "anon_all_transaction_analytics" on pos.transaction_analytics;
create policy "anon_all_transaction_analytics"
  on pos.transaction_analytics
  for all to anon, authenticated
  using (true) with check (true);
