-- ================================================================
-- Fix attendance_schedules OFF status constraint
-- Previous migration dropped pos_attendance_schedules_status_check, but the
-- original unnamed inline CHECK was created by PostgreSQL as
-- attendance_schedules_status_check. Drop both possible names so OFF can be
-- inserted by jadwal imports.
-- ================================================================

alter table pos.attendance_schedules
  drop constraint if exists attendance_schedules_status_check;

alter table pos.attendance_schedules
  drop constraint if exists pos_attendance_schedules_status_check;

alter table pos.attendance_schedules
  add constraint attendance_schedules_status_check
    check (status in ('scheduled', 'confirmed', 'completed', 'absent', 'cancelled', 'off'));

notify pgrst, 'reload schema';
