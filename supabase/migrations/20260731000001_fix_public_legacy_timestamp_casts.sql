-- Fix legacy-mirror epoch timestamps stored as JSON decimal strings (for
-- example "1775066626192.0"). Direct ::bigint casts raise 22P02 and make
-- PostgREST return HTTP 400 for the entire view.
--
-- Keep the existing column order/types and definer-view behavior. Numeric
-- parsing is guarded so unexpected non-numeric JSON values degrade to the
-- existing fallback (required fields) or NULL (optional fields), rather than
-- breaking every row returned by the view.

begin;

create or replace view public.pos_ai_conversation_memory
with (security_invoker = false) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'sessionId', ''), 'default') as "sessionId",
  coalesce(nullif(d.document->>'role', ''), 'user') as role,
  coalesce(nullif(d.document->>'content', ''), '') as content,
  case
    when jsonb_typeof(d.document->'metadata') = 'object' then d.document->'metadata'
    else '{}'::jsonb
  end as metadata,
  coalesce(
    case
      when nullif(d.document->>'timestamp', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
        case
          when nullif(d.document->>'timestamp', '')::numeric
               between -9223372036854775808::numeric and 9223372036854775807::numeric
            then nullif(d.document->>'timestamp', '')::numeric::bigint
        end
    end,
    floor(d.creation_time)::bigint
  ) as "timestamp",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'conversationMemory';

create or replace view public.pos_follow_up_tasks
with (security_invoker = false) as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'title', ''), 'Task') as title,
  coalesce(nullif(d.document->>'description', ''), '') as description,
  coalesce(nullif(d.document->>'priority', ''), 'medium') as priority,
  case
    when nullif(d.document->>'dueDate', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      case
        when nullif(d.document->>'dueDate', '')::numeric
             between -9223372036854775808::numeric and 9223372036854775807::numeric
          then nullif(d.document->>'dueDate', '')::numeric::bigint
      end
  end as "dueDate",
  coalesce(nullif(d.document->>'category', ''), 'other') as category,
  coalesce(nullif(d.document->>'actionType', ''), 'review') as "actionType",
  case
    when jsonb_typeof(d.document->'actionData') in ('object', 'array') then d.document->'actionData'
    else null
  end as "actionData",
  coalesce(nullif(d.document->>'status', ''), 'pending') as status,
  coalesce(
    case
      when nullif(d.document->>'createdAt', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
        case
          when nullif(d.document->>'createdAt', '')::numeric
               between -9223372036854775808::numeric and 9223372036854775807::numeric
            then nullif(d.document->>'createdAt', '')::numeric::bigint
        end
    end,
    floor(d.creation_time)::bigint
  ) as "createdAt",
  case
    when nullif(d.document->>'completedAt', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      case
        when nullif(d.document->>'completedAt', '')::numeric
             between -9223372036854775808::numeric and 9223372036854775807::numeric
          then nullif(d.document->>'completedAt', '')::numeric::bigint
      end
  end as "completedAt",
  nullif(d.document->>'completedBy', '') as "completedBy",
  nullif(d.document->>'dismissalReason', '') as "dismissalReason",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'followUpTasks';

-- CREATE OR REPLACE preserves the existing owner and ACL. Keep the explicit
-- public API grants reproducible and the established definer-view property.
alter view public.pos_ai_conversation_memory set (security_invoker = false);
alter view public.pos_follow_up_tasks set (security_invoker = false);
grant select on public.pos_ai_conversation_memory to anon, authenticated;
grant select on public.pos_follow_up_tasks to anon, authenticated;

commit;
