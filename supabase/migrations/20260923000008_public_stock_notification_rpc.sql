-- Expose stock notification delivery RPCs through PostgREST's public schema.
-- The implementation remains in pos and is called through SECURITY DEFINER wrappers.

create or replace function public.claim_stock_notification(
  p_dedupe_key text,
  p_notification_type text,
  p_source_event_id text,
  p_chat_id text
)
returns boolean
language sql
security definer
set search_path = public, pos
as $$
  select pos.claim_stock_notification(
    p_dedupe_key,
    p_notification_type,
    p_source_event_id,
    p_chat_id
  );
$$;

grant execute on function public.claim_stock_notification(text, text, text, text) to service_role;

create or replace function public.mark_stock_notification(
  p_dedupe_key text,
  p_status text,
  p_message_id text default null
)
returns boolean
language sql
security definer
set search_path = public, pos
as $$
  select pos.mark_stock_notification(
    p_dedupe_key,
    p_status,
    p_message_id
  );
$$;

grant execute on function public.mark_stock_notification(text, text, text) to service_role;

notify pgrst, 'reload schema';
