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
  u.raw
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;

alter view public.pos_users_public set (security_invoker = false);

grant select on public.pos_users_public to anon, authenticated;
