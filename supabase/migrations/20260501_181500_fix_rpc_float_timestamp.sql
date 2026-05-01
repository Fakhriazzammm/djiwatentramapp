-- Fix: handle float timestamps in get_currently_in_store RPC
-- Some attendance documents store timestamps as floats (e.g., "1776843244939.0")
-- which fail with ::bigint. Use ::float::bigint instead.

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
      (d.document->>'timestamp')::float::bigint as ts
    from legacy_mirror.documents d
    where d.table_name = 'attendance'
      and d.document->>'userId' is not null
    order by d.document->>'userId', (d.document->>'timestamp')::float::bigint desc
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
