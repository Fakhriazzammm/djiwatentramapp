begin;

alter table public.yumi_users
  add column if not exists schedule_enabled boolean not null default true;

-- The signing workflow still uses contract_status. This records the employment outcome.
alter table public.employee_onboarding_applications
  add column if not exists employment_contract_status text
    check (employment_contract_status in ('active', 'resigned', 'ended'));

create or replace view public.pos_staff_users as
select u.source_id as _id, u.username, u.name, u.role_source_id as "roleId",
       trim(r.name) as "roleName", u.slug, u.is_active as "isActive",
       u.receive_report_emails as "receiveReportEmails", u.telegram_code,
       u.schedule_enabled as "scheduleEnabled"
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;

create or replace function employee_directory_private.require_employee_admin(p_token text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.yumi_sessions s
    join public.yumi_users u on u.source_id = s.user_source_id
    join public.yumi_roles r on r.source_id = u.role_source_id
    where s.token = p_token and s.expires_at > now() and u.is_active
      and (r.permissions ? 'users:manage'
        or lower(btrim(r.name)) in ('admin', 'administrator', 'owner', 'superadmin', 'super admin'))
  ) then
    raise exception 'Akses kelola karyawan ditolak' using errcode = '42501';
  end if;
end;
$$;
revoke all on function employee_directory_private.require_employee_admin(text) from public;

create or replace function employee_directory_private.set_schedule(p_user text, p_enabled boolean)
returns boolean language plpgsql set search_path = ''
as $$
begin
  if p_enabled is null then
    raise exception 'Pilihan jadwal tidak valid' using errcode = '22023';
  end if;
  update public.yumi_users set schedule_enabled = p_enabled where source_id = p_user;
  if not found then
    raise exception 'Karyawan tidak ditemukan' using errcode = 'P0002';
  end if;
  return p_enabled;
end;
$$;

create or replace function employee_directory_private.set_contract_status(p_user text, p_contract uuid, p_status text)
returns text language plpgsql set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('active', 'resigned', 'ended') then
    raise exception 'Status kontrak tidak valid' using errcode = '22023';
  end if;
  update public.employee_onboarding_applications
     set employment_contract_status = p_status
   where id = p_contract and approved_user_source_id = p_user and status = 'approved';
  if not found then
    raise exception 'Kontrak karyawan tidak ditemukan' using errcode = 'P0002';
  end if;
  return p_status;
end;
$$;

-- Lock the staff rows before replacing shifts so a stale generator cannot delete
-- existing shifts after the employee has been removed from the scheduling roster.
create or replace function employee_directory_private.replace_schedules(
  p_users text[], p_start date, p_end date, p_rows jsonb
)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  eligible_count integer;
  deleted_count integer;
  inserted_count integer;
begin
  if p_start is null or p_end is null or p_end < p_start or cardinality(p_users) is null
     or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rentang atau data jadwal tidak valid' using errcode = '22023';
  end if;

  select count(*) into eligible_count from (
    select u.source_id from public.yumi_users u
    where u.source_id = any(p_users) and u.is_active and u.schedule_enabled
    order by u.source_id for update
  ) eligible;
  if eligible_count <> (select count(distinct id) from unnest(p_users) id) then
    raise exception 'Ada karyawan yang tidak tersedia untuk jadwal baru' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_rows) as input(user_id text, date date)
    where input.user_id is null or input.date is null
       or not coalesce(input.user_id = any(p_users), false) or input.date not between p_start and p_end
  ) then
    raise exception 'Data jadwal di luar karyawan atau rentang yang dipilih' using errcode = '22023';
  end if;

  delete from pos.attendance_schedules s
   where s.user_id = any(p_users) and s.date between p_start and p_end
     and not (s.raw ? 'coveredBy' or s.raw ? 'coverFor');
  get diagnostics deleted_count = row_count;

  insert into pos.attendance_schedules (source_id, user_id, date, shift_name, start_time, end_time, status, note, raw)
  select gen_random_uuid()::text, input.user_id, input.date, input.shift_name, input.start_time,
         input.end_time, coalesce(input.status, 'scheduled'), input.note, coalesce(input.raw, '{}'::jsonb)
    from jsonb_to_recordset(p_rows) as input(
      user_id text, date date, shift_name text, start_time time, end_time time,
      status text, note text, raw jsonb
    )
   where not exists (
     select 1 from pos.attendance_schedules protected
     where protected.user_id = input.user_id and protected.date = input.date
       and (protected.raw ? 'coveredBy' or protected.raw ? 'coverFor')
   );
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('inserted', inserted_count, 'deleted', deleted_count);
end;
$$;

revoke all on function employee_directory_private.set_schedule(text, boolean) from public;
revoke all on function employee_directory_private.set_contract_status(text, uuid, text) from public;
revoke all on function employee_directory_private.replace_schedules(text[], date, date, jsonb) from public;

create or replace function employee_directory_private.set_schedule_from_admin(p_token text, p_user text, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  perform employee_directory_private.require_employee_admin(p_token);
  return employee_directory_private.set_schedule(p_user, p_enabled);
end;
$$;

create or replace function employee_directory_private.set_contract_status_from_admin(p_token text, p_user text, p_contract uuid, p_status text)
returns text language plpgsql security definer set search_path = ''
as $$
begin
  perform employee_directory_private.require_employee_admin(p_token);
  return employee_directory_private.set_contract_status(p_user, p_contract, p_status);
end;
$$;

create or replace function employee_directory_private.replace_schedules_from_admin(
  p_token text, p_users text[], p_start date, p_end date, p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform employee_directory_private.require_employee_admin(p_token);
  return employee_directory_private.replace_schedules(p_users, p_start, p_end, p_rows);
end;
$$;

create or replace function public.admin_set_employee_schedule(session_token text, user_source_id text, schedule_enabled boolean)
returns boolean language sql set search_path = ''
begin atomic
  select employee_directory_private.set_schedule_from_admin(session_token, user_source_id, schedule_enabled);
end;

create or replace function public.admin_set_employee_contract_status(session_token text, user_source_id text, contract_id uuid, employment_status text)
returns text language sql set search_path = ''
begin atomic
  select employee_directory_private.set_contract_status_from_admin(session_token, user_source_id, contract_id, employment_status);
end;

create or replace function public.admin_replace_employee_schedules(session_token text, user_ids text[], start_date date, end_date date, schedule_rows jsonb)
returns jsonb language sql set search_path = ''
begin atomic
  select employee_directory_private.replace_schedules_from_admin(session_token, user_ids, start_date, end_date, schedule_rows);
end;

revoke all on function employee_directory_private.set_schedule_from_admin(text, text, boolean) from public;
revoke all on function employee_directory_private.set_contract_status_from_admin(text, text, uuid, text) from public;
revoke all on function employee_directory_private.replace_schedules_from_admin(text, text[], date, date, jsonb) from public;
revoke all on function public.admin_set_employee_schedule(text, text, boolean) from public;
revoke all on function public.admin_set_employee_contract_status(text, text, uuid, text) from public;
revoke all on function public.admin_replace_employee_schedules(text, text[], date, date, jsonb) from public;
grant execute on function employee_directory_private.set_schedule_from_admin(text, text, boolean) to anon, authenticated;
grant execute on function employee_directory_private.set_contract_status_from_admin(text, text, uuid, text) to anon, authenticated;
grant execute on function employee_directory_private.replace_schedules_from_admin(text, text[], date, date, jsonb) to anon, authenticated;
grant execute on function public.admin_set_employee_schedule(text, text, boolean) to anon, authenticated;
grant execute on function public.admin_set_employee_contract_status(text, text, uuid, text) to anon, authenticated;
grant execute on function public.admin_replace_employee_schedules(text, text[], date, date, jsonb) to anon, authenticated;

create or replace function employee_directory_private.check_new_shift()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  eligible boolean;
begin
  if tg_op = 'UPDATE' and (old.user_id, old.date) = (new.user_id, new.date)
     and (not (new.raw ? 'coverFor') or (old.raw->>'coverFor') is not distinct from (new.raw->>'coverFor')) then
    return new;
  end if;
  select u.schedule_enabled and (u.is_active or new.date < (now() at time zone 'Asia/Jakarta')::date)
    into eligible from public.yumi_users u where u.source_id = new.user_id for share;
  if eligible is false then
    raise exception 'Karyawan tidak tersedia untuk jadwal baru' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function employee_directory_private.check_new_shift() from public;

drop trigger if exists trg_check_new_employee_shift on pos.attendance_schedules;
create trigger trg_check_new_employee_shift
before insert or update of user_id, date, raw on pos.attendance_schedules
for each row execute function employee_directory_private.check_new_shift();

-- Defer unapplied imports while an employee is excluded from new shifts.
drop trigger if exists trg_apply_pending_schedules on public.yumi_users;
create trigger trg_apply_pending_schedules
after insert or update of name, is_active on public.yumi_users
for each row when (new.schedule_enabled)
execute function pos.apply_pending_schedules();

CREATE OR REPLACE FUNCTION pos.cover_candidates(p_absent text, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_role text;
  v_week date := date_trunc('week', p_date::timestamp)::date;
BEGIN
  SELECT role_source_id INTO v_role FROM public.yumi_users WHERE source_id = p_absent;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY (x->>'sameRole')::boolean DESC, (x->>'weekShifts')::int ASC, x->>'name')
    FROM (
      SELECT jsonb_build_object(
        'userId', u.source_id,
        'name', u.name,
        'roleName', trim(coalesce(r.name, '')),
        'sameRole', (u.role_source_id IS NOT DISTINCT FROM v_role),
        'state', CASE WHEN s.source_id IS NULL THEN 'unscheduled' ELSE 'off' END,
        'weekShifts', (
          SELECT count(*) FROM pos.attendance_schedules w
          WHERE w.user_id = u.source_id AND w.date >= v_week AND w.date < v_week + 7
            AND w.status <> 'off' AND lower(coalesce(w.shift_name, '')) !~ '(off|libur)'
        )
      ) AS x
      FROM public.yumi_users u
      LEFT JOIN public.yumi_roles r ON r.source_id = u.role_source_id
      LEFT JOIN pos.attendance_schedules s ON s.user_id = u.source_id AND s.date = p_date
      WHERE u.is_active AND u.schedule_enabled
        AND u.source_id <> p_absent
        AND lower(trim(coalesce(r.name, ''))) NOT IN ('owner', 'admin', 'manager', 'hrd', 'client_viewer')
        AND (s.source_id IS NULL OR s.status = 'off' OR lower(coalesce(s.shift_name, '')) ~ '(off|libur)')
        -- hanya staf yang aktif absen dalam 60 hari terakhir
        AND EXISTS (
          SELECT 1 FROM public.pos_attendance_logs l
          WHERE l."userId" = u.source_id AND l."timestamp" > (extract(epoch FROM now()) * 1000 - 60 * 86400000::bigint)
        )
        -- tidak sedang izin/cuti/sakit pada tanggal itu
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_leave_requests q
          WHERE q.user_id = u.source_id AND q.status IN ('pending', 'approved')
            AND q.leave_type IN ('cuti', 'izin', 'sakit', 'other') AND p_date BETWEEN q.start_date AND q.end_date
        )
        -- belum punya permintaan pengganti/tukar yang menunggu pada tanggal itu
        AND NOT EXISTS (
          SELECT 1 FROM public.attendance_leave_requests q
          WHERE q.status = 'pending' AND q.leave_type IN ('pengganti_shift', 'tukar_shift') AND q.start_date = p_date
            AND (q.user_id = u.source_id OR q.metadata ->> 'partner_id' = u.source_id)
        )
    ) t
  ), '[]'::jsonb);
END;
$$;

create or replace function employee_directory_private.read_directory(session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform employee_directory_private.require_employee_admin(session_token);

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      '_id', u.source_id,
      'name', u.name,
      'username', u.username,
      'initial', upper(left(u.name, 1)),
      'slug', coalesce(nullif(u.slug, ''), split_part(u.username, '@', 1)),
      'photoUrl', coalesce(u.photo_url, a.photo_url),
      'roleId', u.role_source_id,
      'roleName', trim(r.name),
      'isActive', u.is_active,
      'scheduleEnabled', u.schedule_enabled,
      'scheduleEligible', lower(trim(coalesce(r.name, ''))) not in ('owner', 'admin', 'administrator', 'superadmin', 'super admin', 'manager', 'hrd', 'client_viewer')
        and not (coalesce(r.permissions, '[]'::jsonb) ? 'users:manage'),
      'hasFace', coalesce(jsonb_typeof(u.face_descriptor) = 'array', false)
        or coalesce(jsonb_typeof(u.raw->'faceDescriptor') = 'array', false),
      'raw', jsonb_build_object(
        'phone', coalesce(nullif(btrim(u.raw->>'phone'), ''), nullif(btrim(a.phone), '')),
        'identityNumber', coalesce(nullif(u.raw->>'identityNumber', ''), a.identity_number),
        'placeOfBirth', coalesce(nullif(u.raw->>'placeOfBirth', ''), a.birth_place),
        'birthDate', coalesce(nullif(u.raw->>'birthDate', ''), a.birth_date::text),
        'address', coalesce(nullif(u.raw->>'address', ''), a.address),
        'startDate', coalesce(nullif(u.raw->>'startDate', ''), a.employment->>'startDate'),
        'employmentType', coalesce(nullif(u.raw->>'employmentType', ''), a.employment->>'employmentType'),
        'contractDuration', coalesce(nullif(u.raw->'contractDuration', 'null'::jsonb), a.employment->'contractDuration'),
        'contractEndDate', coalesce(nullif(u.raw->>'contractEndDate', ''), a.employment->>'contractEndDate'),
        'jabatan', coalesce(nullif(u.raw->>'jabatan', ''), a.employment->>'jabatan'),
        'monthlySalary', coalesce(nullif(u.raw->'monthlySalary', 'null'::jsonb), a.employment->'monthlySalary'),
        'location', coalesce(nullif(u.raw->>'location', ''), a.employment->>'location'),
        'emergencyContactName', coalesce(nullif(u.raw->>'emergencyContactName', ''), a.emergency_contact->>'name'),
        'emergencyContactPhone', coalesce(nullif(u.raw->>'emergencyContactPhone', ''), a.emergency_contact->>'phone'),
        'cvUrl', coalesce(nullif(u.raw->>'cvUrl', ''), a.cv_url),
        'contracts', c.documents
      )
    ) order by u.name, u.source_id), '[]'::jsonb)
    from public.yumi_users u
    left join public.yumi_roles r on r.source_id = u.role_source_id
    left join lateral (
      select application.*
      from public.employee_onboarding_applications application
      where application.approved_user_source_id = u.source_id and application.status = 'approved'
      order by application.reviewed_at desc nulls last, application.created_at desc, application.id
      limit 1
    ) a on true
    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', application.id,
        'registrationNumber', application.registration_number,
        'status', coalesce(nullif(application.raw->>'contractStatus', ''), application.contract_status),
        'employmentStatus', application.employment_contract_status,
        'pdfUrl', application.contract_pdf_url
      ) order by application.created_at desc, application.id), '[]'::jsonb) as documents
      from public.employee_onboarding_applications application
      where application.approved_user_source_id = u.source_id and application.status = 'approved'
    ) c on true
  );
end;
$$;

commit;
