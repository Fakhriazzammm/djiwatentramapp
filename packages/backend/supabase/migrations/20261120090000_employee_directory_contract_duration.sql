begin;

-- Tambah contractDuration (bulan) ke direktori karyawan agar halaman Karyawan App
-- dapat menghitung tanggal berakhir kontrak. Hanya menambah satu key pada raw;
-- tidak mengubah data atau key yang sudah ada.
create or replace function employee_directory_private.read_directory(session_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.yumi_sessions s
    join public.yumi_users u on u.source_id = s.user_source_id
    join public.yumi_roles r on r.source_id = u.role_source_id
    where s.token = session_token
      and s.expires_at > now()
      and u.is_active
      and (r.permissions ? 'users:manage' or lower(btrim(r.name)) in ('admin', 'administrator', 'owner', 'superadmin', 'super admin'))
  ) then
    raise exception 'Akses data karyawan ditolak' using errcode = '42501';
  end if;

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
        'pdfUrl', application.contract_pdf_url
      ) order by application.created_at desc, application.id), '[]'::jsonb) as documents
      from public.employee_onboarding_applications application
      where application.approved_user_source_id = u.source_id and application.status = 'approved'
    ) c on true
  );
end;
$$;

commit;
