-- =============================================================================
-- Bug Fix: Remove sensitive columns from anon grants + pos_users_public view
--         + Efficient "currently in store" RPC
--
-- Issues fixed:
--   #5  — pos_users_public exposed u.raw (contains faceDescriptor in plaintext)
--   #5b — Column grants explicitly gave face_descriptor + raw to anon role  
--   #6  — Login fallback now uses home_pin_fingerprint (SHA256) via view
--   #7  — fetchCurrentlyInStore now uses efficient RPC instead of 2000-row fetch
-- =============================================================================

-- =============================================================================
-- STEP 1: Revoke sensitive column grants from anon + authenticated
-- =============================================================================

revoke select (face_descriptor, raw)
  on public.yumi_users
  from anon, authenticated;

grant select (source_id, username, name, role_source_id, is_active,
              receive_report_emails, last_login_at, auth_user_id,
              home_pin_fingerprint, slug)
  on public.yumi_users to anon, authenticated;

-- =============================================================================
-- STEP 2: Recreate pos_users_public view WITHOUT raw, WITH home_pin_fingerprint
-- =============================================================================

drop view if exists public.pos_users_public;

create or replace view public.pos_users_public as
select
  u.source_id as _id,
  u.name,
  u.slug,
  upper(left(coalesce(u.name, '?'), 1)) as initial,
  coalesce(u.is_active, true) as "isActive",
  case
    when jsonb_typeof(u.raw->'faceDescriptor') = 'array' then true
    else false
  end as "hasFace",
  u.username,
  u.role_source_id as "roleId",
  trim(r.name) as "roleName",
  u.receive_report_emails as "receiveReportEmails",
  u.last_login_at as "lastLogin",
  u.home_pin_fingerprint as "homePinFingerprint"
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;

-- =============================================================================
-- STEP 3: Efficient "currently in store" query via RPC
--
-- Replaces fetchCurrentlyInStore() which fetched 2000+ logs and filtered in JS.
-- Uses DISTINCT ON to get the latest attendance log per active user directly.
-- =============================================================================

create or replace function public.get_currently_in_store()
returns table (
  user_id text,
  user_name text,
  role_id text,
  check_in_time bigint
)
language sql
security definer
as $$
  with active_users as (
    select source_id, name, role_source_id
    from public.yumi_users
    where is_active = true
  ),
  latest_logs as (
    select distinct on (d.document->>'userId')
      d.document->>'userId' as user_id,
      d.document->>'type' as log_type,
      (d.document->>'timestamp')::bigint as ts
    from legacy_mirror.documents d
    where d.table_name = 'attendance'
      and d.document->>'userId' is not null
    order by d.document->>'userId', (d.document->>'timestamp')::bigint desc
  )
  select
    u.source_id,
    u.name,
    u.role_source_id,
    l.ts
  from active_users u
  inner join latest_logs l on l.user_id = u.source_id
  where l.log_type = 'check_in'
  order by u.name;
$$;
