-- Aktif / nonaktif karyawan dari halaman Data Karyawan Admin.
-- Akun administrator (admin/owner) dilindungi agar tidak bisa dinonaktifkan dari halaman ini.
-- Status nonaktif membuat karyawan tidak muncul di grid Jadwal dan pemilih shift.

begin;

create or replace function employee_directory_private.set_employee_active(
  session_token text,
  target_user_source_id text,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_active is null then
    raise exception 'Status karyawan tidak valid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.yumi_sessions s
    join public.yumi_users u on u.source_id = s.user_source_id
    join public.yumi_roles r on r.source_id = u.role_source_id
    where s.token = session_token
      and s.expires_at > now()
      and u.is_active
      and (coalesce(r.permissions, '[]'::jsonb) ? 'users:manage'
        or lower(btrim(r.name)) in ('admin', 'administrator', 'owner', 'superadmin', 'super admin'))
  ) then
    raise exception 'Akses ubah status karyawan ditolak' using errcode = '42501';
  end if;

  select lower(btrim(coalesce(r.name, '')))
    into v_role
    from public.yumi_users u
    left join public.yumi_roles r on r.source_id = u.role_source_id
   where u.source_id = target_user_source_id;

  if v_role is null then
    raise exception 'Karyawan tidak ditemukan' using errcode = 'P0002';
  end if;

  if v_role in ('admin', 'administrator', 'owner', 'superadmin', 'super admin') then
    raise exception 'Akun administrator tidak bisa dinonaktifkan dari Data Karyawan' using errcode = '42501';
  end if;

  update public.yumi_users
     set is_active = p_active,
         raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
           'statusChangedAt', now(),
           'statusChangedVia', 'admin'
         )
   where source_id = target_user_source_id;

  return p_active;
end;
$$;

revoke all on function employee_directory_private.set_employee_active(text, text, boolean) from public;
grant execute on function employee_directory_private.set_employee_active(text, text, boolean) to anon, authenticated;

create or replace function public.admin_set_employee_active(
  session_token text,
  user_source_id text,
  is_active boolean
)
returns boolean
language sql
set search_path = ''
begin atomic
  select employee_directory_private.set_employee_active(session_token, user_source_id, is_active);
end;

revoke all on function public.admin_set_employee_active(text, text, boolean) from public;
grant execute on function public.admin_set_employee_active(text, text, boolean) to anon, authenticated;

commit;
