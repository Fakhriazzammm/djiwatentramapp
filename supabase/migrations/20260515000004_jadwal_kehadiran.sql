-- ============================================================
-- ATTENDANCE SCHEDULES — jadwal shift karyawan
-- ============================================================

create table if not exists pos.attendance_schedules (
  source_id          text primary key,
  user_id            text not null references public.yumi_users (source_id) on delete cascade,
  date               date not null,
  shift_name         text not null,
  start_time         time,
  end_time           time,
  status             text not null default 'scheduled'
                     check (status in ('scheduled', 'confirmed', 'completed', 'absent', 'cancelled')),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  raw                jsonb not null default '{}'::jsonb
);

-- Prevent duplicate schedules (same user, same day, same shift)
create unique index if not exists idx_pos_attendance_schedules_unique
  on pos.attendance_schedules (user_id, date, shift_name);

-- Index for fast month-level queries
create index if not exists idx_pos_attendance_schedules_date
  on pos.attendance_schedules (date);

-- Index for user-specific lookups
create index if not exists idx_pos_attendance_schedules_user
  on pos.attendance_schedules (user_id, date);

-- ============================================================
-- PUBLIC VIEW — with join to yumi_users and yumi_roles
-- ============================================================

create or replace view public.pos_attendance_schedules
with (security_invoker = false) as
select
  s.source_id as _id,
  s.user_id as "userId",
  u.name as "userName",
  u.slug as "userSlug",
  coalesce(trim(r.name), 'Team') as "roleName",
  s.date,
  s.shift_name as "shiftName",
  s.start_time as "startTime",
  s.end_time as "endTime",
  s.status,
  s.note,
  s.created_at as "createdAt",
  s.updated_at as "updatedAt",
  s.raw
from pos.attendance_schedules s
left join public.yumi_users u on u.source_id = s.user_id
left join public.yumi_roles r on r.source_id = u.role_source_id;

-- ============================================================
-- GRANTS
-- ============================================================

grant select on public.pos_attendance_schedules to anon, authenticated;
grant insert (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw)
  on pos.attendance_schedules to service_role;
grant update (date, shift_name, start_time, end_time, status, note, updated_at)
  on pos.attendance_schedules to service_role;
grant delete on pos.attendance_schedules to service_role;

-- ============================================================
-- AUTO-UPDATE trigger for updated_at
-- ============================================================

create or replace function pos.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_attendance_schedules_updated_at
  before update on pos.attendance_schedules
  for each row
  execute function pos.set_updated_at();
