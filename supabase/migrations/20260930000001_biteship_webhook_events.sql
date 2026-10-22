-- Durable Biteship webhook inbox. Additive and idempotent.
create table if not exists pos.biteship_webhook_events (
  id text primary key,
  provider_event_key text not null unique,
  event_type text not null,
  provider_order_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at double precision not null default extract(epoch from now()) * 1000,
  updated_at double precision not null default extract(epoch from now()) * 1000,
  constraint biteship_webhook_events_status_check check (status in ('queued','processing','processed','failed'))
);
create index if not exists idx_biteship_webhook_events_order on pos.biteship_webhook_events(provider_order_id);
create index if not exists idx_biteship_webhook_events_queue on pos.biteship_webhook_events(status, created_at);
alter table pos.biteship_webhook_events enable row level security;
revoke all on pos.biteship_webhook_events from public, anon, authenticated;
grant select, insert, update on pos.biteship_webhook_events to service_role;

create or replace function pos.enqueue_biteship_webhook_event(
  p_provider_event_key text,
  p_event_type text,
  p_provider_order_id text,
  p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pos, public, pg_catalog as $$
declare
  v_key text := nullif(trim(p_provider_event_key), '');
  v_id text := 'biteship_event_' || md5(v_key);
  v_existing pos.biteship_webhook_events%rowtype;
  v_inserted boolean := false;
  v_now double precision := extract(epoch from now()) * 1000;
begin
  if v_key is null or nullif(trim(p_event_type), '') is null then
    raise exception using errcode = '22023', message = 'Biteship webhook identity is incomplete';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_key));
  select * into v_existing from pos.biteship_webhook_events where provider_event_key = v_key limit 1;
  if v_existing.id is null then
    insert into pos.biteship_webhook_events (id, provider_event_key, event_type, provider_order_id, payload, created_at, updated_at)
    values (v_id, v_key, trim(p_event_type), nullif(trim(p_provider_order_id), ''), coalesce(p_payload, '{}'::jsonb), v_now, v_now);
    v_inserted := true;
  end if;
  return jsonb_build_object('ok', true, 'id', coalesce(v_existing.id, v_id), 'inserted', v_inserted, 'status', coalesce(v_existing.status, 'queued'));
end;
$$;
revoke all on function pos.enqueue_biteship_webhook_event(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function pos.enqueue_biteship_webhook_event(text,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
