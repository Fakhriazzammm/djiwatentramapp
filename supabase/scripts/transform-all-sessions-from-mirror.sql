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
  and exists (
    select 1
    from public.yumi_users u
    where u.source_id = document->>'userId'
  )
on conflict (token) do update
set
  user_source_id = excluded.user_source_id,
  expires_at = excluded.expires_at,
  created_at = least(yumi_sessions.created_at, excluded.created_at),
  last_seen_at = greatest(yumi_sessions.last_seen_at, excluded.last_seen_at);
