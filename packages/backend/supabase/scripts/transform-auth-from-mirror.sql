insert into public.yumi_roles (
  source_id,
  name,
  permissions,
  raw
)
select
  document_id,
  nullif(btrim(document->>'name'), ''),
  coalesce(document->'permissions', '[]'::jsonb),
  document
from legacy_mirror.documents
where table_name = 'roles'
on conflict (source_id) do update
set
  name = excluded.name,
  permissions = excluded.permissions,
  raw = excluded.raw;

insert into public.yumi_users (
  source_id,
  username,
  password_hash,
  home_pin_hash,
  home_pin_fingerprint,
  name,
  role_source_id,
  is_active,
  receive_report_emails,
  last_login_at,
  auth_user_id,
  face_descriptor,
  slug,
  raw
)
select
  document_id,
  lower(btrim(coalesce(document->>'username', ''))),
  case
    when nullif(document->>'password', '') is not null
      then crypt(document->>'password', gen_salt('bf'))
    else null
  end,
  case
    when nullif(btrim(coalesce(document->>'homePin', '')), '') is not null
      then crypt(btrim(document->>'homePin'), gen_salt('bf'))
    else null
  end,
  case
    when nullif(btrim(coalesce(document->>'homePin', '')), '') is not null
      then encode(digest(btrim(document->>'homePin'), 'sha256'), 'hex')
    else null
  end,
  coalesce(
    nullif(btrim(document->>'name'), ''),
    split_part(lower(btrim(coalesce(document->>'username', ''))), '@', 1)
  ),
  document->>'roleId',
  coalesce((document->>'isActive')::boolean, true),
  coalesce((document->>'receiveReportEmails')::boolean, false),
  case
    when nullif(document->>'lastLogin', '') is not null
      then to_timestamp((document->>'lastLogin')::double precision / 1000.0)
    else null
  end,
  nullif(btrim(coalesce(document->>'authUserId', '')), ''),
  case
    when jsonb_typeof(document->'faceDescriptor') = 'array'
      then document->'faceDescriptor'
    else null
  end,
  nullif(btrim(coalesce(document->>'slug', '')), ''),
  document
from legacy_mirror.documents
where table_name = 'users'
on conflict (source_id) do update
set
  username = excluded.username,
  password_hash = excluded.password_hash,
  home_pin_hash = excluded.home_pin_hash,
  home_pin_fingerprint = excluded.home_pin_fingerprint,
  name = excluded.name,
  role_source_id = excluded.role_source_id,
  is_active = excluded.is_active,
  receive_report_emails = excluded.receive_report_emails,
  last_login_at = excluded.last_login_at,
  auth_user_id = excluded.auth_user_id,
  face_descriptor = excluded.face_descriptor,
  slug = excluded.slug,
  raw = excluded.raw;

insert into public.yumi_sessions (
  token,
  user_source_id,
  expires_at,
  created_at,
  last_seen_at
)
select
  nullif(btrim(coalesce(document->>'token', '')), ''),
  document->>'userId',
  to_timestamp((document->>'expiresAt')::double precision / 1000.0),
  coalesce(
    to_timestamp((document->>'_creationTime')::double precision / 1000.0),
    now()
  ),
  coalesce(
    to_timestamp((document->>'_creationTime')::double precision / 1000.0),
    now()
  )
from legacy_mirror.documents
where table_name = 'yumiSessions'
  and nullif(btrim(coalesce(document->>'token', '')), '') is not null
  and nullif(btrim(coalesce(document->>'userId', '')), '') is not null
  and nullif(document->>'expiresAt', '') is not null
  and to_timestamp((document->>'expiresAt')::double precision / 1000.0) > now()
  and exists (
    select 1
    from public.yumi_users u
    where u.source_id = document->>'userId'
  )
on conflict (token) do update
set
  user_source_id = excluded.user_source_id,
  expires_at = excluded.expires_at,
  last_seen_at = excluded.last_seen_at;

