create or replace view public.pos_variation_presets
with (security_invoker = true) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'name', ''), 'Variation Preset') as name,
  coalesce(d.document->'options', '[]'::jsonb) as options,
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'variationPresets';

create or replace view public.pos_attendance_logs
with (security_invoker = true) as
select
  d.document_id as _id,
  nullif(d.document->>'userId', '') as "userId",
  coalesce(nullif(d.document->>'type', ''), 'check_in') as type,
  coalesce(
    nullif(d.document->>'timestamp', '')::bigint,
    floor(d.creation_time)::bigint
  ) as timestamp,
  nullif(d.document->>'photoUrl', '') as "photoUrl",
  nullif(d.document->>'notes', '') as notes,
  case
    when jsonb_typeof(d.document->'location') = 'object' then d.document->'location'
    else null
  end as location,
  nullif(d.document->>'shiftName', '') as "shiftName",
  nullif(d.document->>'shiftOpenTimeSnapshot', '') as "shiftOpenTimeSnapshot",
  coalesce(u.name, 'Unknown Staff') as "userName",
  coalesce(trim(r.name), 'N/A') as "roleName",
  d.document as raw
from legacy_mirror.documents d
left join public.yumi_users u on u.source_id = nullif(d.document->>'userId', '')
left join public.yumi_roles r on r.source_id = u.role_source_id
where d.table_name = 'attendance';

create or replace view public.pos_users_public
with (security_invoker = true) as
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

create or replace view public.pos_minigames
with (security_invoker = true) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'brandSlug', ''), '') as "brandSlug",
  coalesce(nullif(d.document->>'name', ''), 'Mini Game') as name,
  coalesce(nullif(d.document->>'slug', ''), '') as slug,
  nullif(d.document->>'description', '') as description,
  coalesce((d.document->>'isActive')::boolean, false) as "isActive",
  coalesce((d.document->>'requireUniqueContact')::boolean, true) as "requireUniqueContact",
  coalesce((d.document->>'maxSpinsPerContact')::integer, 1) as "maxSpinsPerContact",
  nullif(d.document->>'startAt', '')::bigint as "startAt",
  nullif(d.document->>'endAt', '')::bigint as "endAt",
  coalesce(nullif(d.document->>'spinDurationMs', '')::integer, 5200) as "spinDurationMs",
  nullif(d.document->>'thankYouMessage', '') as "thankYouMessage",
  coalesce(d.document->'prizes', '[]'::jsonb) as prizes,
  coalesce(nullif(d.document->>'createdAt', '')::bigint, floor(d.creation_time)::bigint) as "createdAt",
  coalesce(nullif(d.document->>'updatedAt', '')::bigint, floor(d.creation_time)::bigint) as "updatedAt",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'miniGames';

create or replace view public.pos_minigame_entries
with (security_invoker = true) as
select
  d.document_id as _id,
  nullif(d.document->>'gameId', '') as "gameId",
  coalesce(nullif(d.document->>'brandSlug', ''), '') as "brandSlug",
  nullif(d.document->>'fullName', '') as "fullName",
  nullif(d.document->>'email', '') as email,
  nullif(d.document->>'whatsapp', '') as whatsapp,
  nullif(d.document->>'instagram', '') as instagram,
  nullif(d.document->>'prizeId', '') as "prizeId",
  nullif(d.document->>'prizeLabel', '') as "prizeLabel",
  nullif(d.document->>'prizeDescription', '') as "prizeDescription",
  nullif(d.document->>'voucherCode', '') as "voucherCode",
  nullif(d.document->>'spinAngle', '')::numeric as "spinAngle",
  coalesce(nullif(d.document->>'contactStatus', ''), 'new') as "contactStatus",
  nullif(d.document->>'adminNotes', '') as "adminNotes",
  coalesce(nullif(d.document->>'createdAt', '')::bigint, floor(d.creation_time)::bigint) as "createdAt",
  coalesce(nullif(d.document->>'updatedAt', '')::bigint, floor(d.creation_time)::bigint) as "updatedAt",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'miniGameEntries';

create or replace view public.pos_ai_conversation_memory
with (security_invoker = true) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'sessionId', ''), 'default') as "sessionId",
  coalesce(nullif(d.document->>'role', ''), 'user') as role,
  coalesce(nullif(d.document->>'content', ''), '') as content,
  case
    when jsonb_typeof(d.document->'metadata') = 'object' then d.document->'metadata'
    else '{}'::jsonb
  end as metadata,
  coalesce(nullif(d.document->>'timestamp', '')::bigint, floor(d.creation_time)::bigint) as timestamp,
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'conversationMemory';

create or replace view public.pos_follow_up_tasks
with (security_invoker = true) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'title', ''), 'Task') as title,
  coalesce(nullif(d.document->>'description', ''), '') as description,
  coalesce(nullif(d.document->>'priority', ''), 'medium') as priority,
  nullif(d.document->>'dueDate', '')::bigint as "dueDate",
  coalesce(nullif(d.document->>'category', ''), 'other') as category,
  coalesce(nullif(d.document->>'actionType', ''), 'review') as "actionType",
  case
    when jsonb_typeof(d.document->'actionData') in ('object', 'array') then d.document->'actionData'
    else null
  end as "actionData",
  coalesce(nullif(d.document->>'status', ''), 'pending') as status,
  coalesce(nullif(d.document->>'createdAt', '')::bigint, floor(d.creation_time)::bigint) as "createdAt",
  nullif(d.document->>'completedAt', '')::bigint as "completedAt",
  nullif(d.document->>'completedBy', '') as "completedBy",
  nullif(d.document->>'dismissalReason', '') as "dismissalReason",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'followUpTasks';

grant select on public.pos_variation_presets to anon, authenticated;
grant select on public.pos_attendance_logs to anon, authenticated;
grant select on public.pos_users_public to anon, authenticated;
grant select on public.pos_minigames to anon, authenticated;
grant select on public.pos_minigame_entries to anon, authenticated;
grant select on public.pos_ai_conversation_memory to anon, authenticated;
grant select on public.pos_follow_up_tasks to anon, authenticated;

