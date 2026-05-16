-- ================================================================
-- PHASE 2: ATTENDANCE SCHEDULE MIGRATION — OFF status + Aliases
-- ================================================================

-- 1. Add 'off' as allowed status in attendance_schedules
alter table pos.attendance_schedules
  drop constraint if exists pos_attendance_schedules_status_check;

alter table pos.attendance_schedules
  add constraint pos_attendance_schedules_status_check
    check (status in ('scheduled', 'confirmed', 'completed', 'absent', 'cancelled', 'off'));

-- 2. Update public view to expose status properly (already mapped)
--    No change needed, status column is already passed through

-- ================================================================
-- PERSISTENT IMPORT ALIASES TABLE
-- ================================================================

create table if not exists pos.attendance_import_aliases (
  source_id       text primary key,
  raw_name        text not null,
  user_id         text references public.yumi_users (source_id) on delete set null,
  role_hint       text,
  outlet_hint     text,
  is_placeholder  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  raw             jsonb not null default '{}'::jsonb
);

-- unique per raw_name
create unique index if not exists idx_attendance_import_aliases_raw_name
  on pos.attendance_import_aliases (raw_name);

-- trigger auto-update updated_at
create or replace function pos.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_attendance_import_aliases_updated_at
  before update on pos.attendance_import_aliases
  for each row
  execute function pos.set_updated_at();

-- public view
create or replace view public.pos_attendance_import_aliases
with (security_invoker = false) as
select
  a.source_id as _id,
  a.raw_name as "rawName",
  a.user_id as "userId",
  u.name as "userName",
  u.slug as "userSlug",
  a.role_hint as "roleHint",
  a.outlet_hint as "outletHint",
  a.is_placeholder as "isPlaceholder",
  a.created_at as "createdAt",
  a.updated_at as "updatedAt",
  a.raw
from pos.attendance_import_aliases a
left join public.yumi_users u on u.source_id = a.user_id;

-- grants
grant select on public.pos_attendance_import_aliases to anon, authenticated;
grant select, insert, update, delete on pos.attendance_import_aliases to service_role;
