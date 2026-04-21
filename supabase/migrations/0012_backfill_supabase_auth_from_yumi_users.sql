create temporary table tmp_yumi_auth_backfill on commit drop as
select
  u.source_id,
  lower(trim(u.username)) as email,
  u.username,
  u.name,
  u.slug,
  u.role_source_id,
  coalesce(u.is_active, true) as is_active,
  u.receive_report_emails,
  u.last_login_at,
  u.face_descriptor,
  u.raw,
  case
    when u.password_hash is not null and btrim(u.password_hash) <> '' then u.password_hash
    when u.home_pin_hash is not null and btrim(u.home_pin_hash) <> '' then u.home_pin_hash
    else null
  end as encrypted_password,
  coalesce(existing.id, gen_random_uuid()) as auth_id
from public.yumi_users u
left join auth.users existing
  on lower(existing.email) = lower(trim(u.username))
where u.username is not null
  and btrim(u.username) <> '';

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  t.auth_id,
  'authenticated',
  'authenticated',
  t.email,
  t.encrypted_password,
  now(),
  '',
  '',
  '',
  '',
  t.last_login_at,
  jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email')
  ),
  jsonb_build_object(
    'name', t.name,
    'source_id', t.source_id,
    'slug', t.slug,
    'role_source_id', t.role_source_id,
    'is_active', t.is_active,
    'receive_report_emails', t.receive_report_emails
  ),
  now(),
  now(),
  false,
  false
from tmp_yumi_auth_backfill t
where not exists (
  select 1
  from auth.users u
  where lower(u.email) = t.email
);

update auth.users u
set
  encrypted_password = coalesce(t.encrypted_password, u.encrypted_password),
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  confirmation_token = coalesce(u.confirmation_token, ''),
  recovery_token = coalesce(u.recovery_token, ''),
  email_change = coalesce(u.email_change, ''),
  email_change_token_new = coalesce(u.email_change_token_new, ''),
  last_sign_in_at = coalesce(t.last_login_at, u.last_sign_in_at),
  raw_app_meta_data = jsonb_build_object(
    'provider', 'email',
    'providers', jsonb_build_array('email')
  ),
  raw_user_meta_data = jsonb_build_object(
    'name', t.name,
    'source_id', t.source_id,
    'slug', t.slug,
    'role_source_id', t.role_source_id,
    'is_active', t.is_active,
    'receive_report_emails', t.receive_report_emails
  ),
  updated_at = now()
from tmp_yumi_auth_backfill t
where lower(u.email) = t.email;

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', t.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  t.email,
  coalesce(t.last_login_at, now()),
  now(),
  now()
from tmp_yumi_auth_backfill t
join auth.users u
  on lower(u.email) = t.email
where not exists (
  select 1
  from auth.identities i
  where i.provider = 'email'
    and lower(i.provider_id) = t.email
);

update public.yumi_users y
set auth_user_id = u.id::text
from tmp_yumi_auth_backfill t
join auth.users u
  on lower(u.email) = t.email
where y.source_id = t.source_id;
