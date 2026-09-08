-- Task 8: durable Mayar webhook queue. Additive only; no historical rows are changed.

create table if not exists pos.mayar_payment_events (
  id text primary key,
  provider_event_key text not null unique,
  provider_transaction_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at double precision not null default extract(epoch from now()) * 1000,
  claimed_at double precision,
  claimed_by text,
  processed_at double precision,
  last_error text,
  created_at double precision not null default extract(epoch from now()) * 1000,
  updated_at double precision not null default extract(epoch from now()) * 1000,
  constraint mayar_payment_events_status_check check (status in ('queued','processing','retrying','sent','terminal'))
);

create unique index if not exists ux_mayar_payment_events_transaction
  on pos.mayar_payment_events (provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists idx_mayar_payment_events_queue
  on pos.mayar_payment_events (status, available_at, created_at);

alter table pos.mayar_payment_events enable row level security;
revoke all on pos.mayar_payment_events from public, anon, authenticated;
grant select, insert, update on pos.mayar_payment_events to service_role;

create or replace function pos.enqueue_mayar_payment_event(
  p_provider_event_key text,
  p_event_type text,
  p_provider_transaction_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_id text := 'mayar_event_' || md5(trim(p_provider_event_key));
  v_now double precision := extract(epoch from now()) * 1000;
  v_inserted boolean := false;
  v_existing pos.mayar_payment_events%rowtype;
begin
  if nullif(trim(p_provider_event_key), '') is null or nullif(trim(p_event_type), '') is null then
    raise exception using errcode = '22023', message = 'Mayar event identity is incomplete';
  end if;
  perform pg_advisory_xact_lock(hashtext(trim(p_provider_event_key)));
  if nullif(trim(p_provider_transaction_id), '') is not null then
    perform pg_advisory_xact_lock(hashtext('tx:' || trim(p_provider_transaction_id)));
  end if;
  select * into v_existing from pos.mayar_payment_events
    where provider_event_key = trim(p_provider_event_key)
       or (provider_transaction_id = nullif(trim(p_provider_transaction_id), '') and provider_transaction_id is not null)
    order by created_at asc limit 1;
  if v_existing.id is null then
    insert into pos.mayar_payment_events (id, provider_event_key, provider_transaction_id, event_type, payload, created_at, updated_at)
    values (v_id, trim(p_provider_event_key), nullif(trim(p_provider_transaction_id), ''), trim(p_event_type), coalesce(p_payload, '{}'::jsonb), v_now, v_now);
    v_inserted := true;
  end if;
  return jsonb_build_object('ok', true, 'id', coalesce(v_existing.id, v_id), 'inserted', v_inserted, 'status', coalesce(v_existing.status, 'queued'));
end;
$$;

create or replace function pos.claim_mayar_payment_events(
  p_worker_id text,
  p_limit integer default 10,
  p_now double precision default extract(epoch from now()) * 1000
)
returns setof pos.mayar_payment_events
language plpgsql security definer
set search_path = pos, public, pg_catalog
as $$
begin
  if nullif(trim(p_worker_id), '') is null then raise exception using errcode = '22023', message = 'Mayar worker id is required'; end if;
  return query
  with candidates as (
    select id from pos.mayar_payment_events
    where (status in ('queued','retrying') and available_at <= p_now)
       or (status = 'processing' and claimed_at <= p_now - 300000)
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  ), claimed as (
    update pos.mayar_payment_events e set status='processing', attempt_count=e.attempt_count+1,
      claimed_at=p_now, claimed_by=trim(p_worker_id), updated_at=p_now, last_error=null
    from candidates c where e.id=c.id returning e.*
  ) select * from claimed order by created_at asc;
end;
$$;

create or replace function pos.complete_mayar_payment_event(
  p_id text, p_status text, p_error text default null,
  p_retry_delay_ms double precision default 60000,
  p_max_attempts integer default 8,
  p_now double precision default extract(epoch from now()) * 1000
)
returns jsonb language plpgsql security definer set search_path = pos, public, pg_catalog
as $$
declare v_row pos.mayar_payment_events%rowtype; v_status text := trim(p_status); v_final text;
begin
  if v_status not in ('sent','retrying','terminal') then raise exception using errcode='22023', message='Invalid Mayar event completion status'; end if;
  v_final := case when v_status='retrying' and coalesce((select attempt_count from pos.mayar_payment_events where id=trim(p_id)),0) >= greatest(1,p_max_attempts) then 'terminal' else v_status end;
  update pos.mayar_payment_events set status=v_final, processed_at=case when v_final='sent' then p_now else processed_at end,
    available_at=case when v_final='retrying' then p_now+greatest(1000,coalesce(p_retry_delay_ms,60000)) else available_at end,
    last_error=nullif(trim(coalesce(p_error,'')),''), updated_at=p_now where id=trim(p_id) returning * into v_row;
  if not found then raise exception using errcode='P0002', message='Mayar event not found'; end if;
  return jsonb_build_object('ok',true,'id',v_row.id,'status',v_row.status,'attemptCount',v_row.attempt_count);
end;
$$;

revoke all on function pos.enqueue_mayar_payment_event(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function pos.claim_mayar_payment_events(text,integer,double precision) from public, anon, authenticated;
revoke all on function pos.complete_mayar_payment_event(text,text,text,double precision,integer,double precision) from public, anon, authenticated;
grant execute on function pos.enqueue_mayar_payment_event(text,text,text,jsonb) to service_role;
grant execute on function pos.claim_mayar_payment_events(text,integer,double precision) to service_role;
grant execute on function pos.complete_mayar_payment_event(text,text,text,double precision,integer,double precision) to service_role;
notify pgrst, 'reload schema';
