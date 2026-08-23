-- Booking Phase 6 foundation: durable timeline and notification delivery queue.
-- Additive only. This migration does not send external notifications.

create table if not exists pos.booking_timeline_events (
  id text primary key,
  booking_order_source_id text not null,
  event_type text not null,
  event_reference text not null,
  from_value text,
  to_value text,
  payload jsonb not null default '{}'::jsonb,
  created_at double precision not null default extract(epoch from now()) * 1000
);

create unique index if not exists ux_booking_timeline_event_dedupe
  on pos.booking_timeline_events (booking_order_source_id, event_type, event_reference);
create index if not exists idx_booking_timeline_booking_created
  on pos.booking_timeline_events (booking_order_source_id, created_at desc);

create table if not exists pos.booking_notification_deliveries (
  id text primary key,
  booking_order_source_id text not null,
  event_type text not null,
  channel text not null,
  dedupe_key text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at double precision not null default extract(epoch from now()) * 1000,
  sent_at double precision,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at double precision not null default extract(epoch from now()) * 1000,
  updated_at double precision not null default extract(epoch from now()) * 1000,
  constraint booking_notification_delivery_status_check
    check (status in ('queued','sending','sent','failed','retrying')),
  constraint booking_notification_delivery_channel_check
    check (channel in ('whatsapp','telegram','internal'))
);

create unique index if not exists ux_booking_notification_dedupe
  on pos.booking_notification_deliveries (dedupe_key);
create index if not exists idx_booking_notification_queue
  on pos.booking_notification_deliveries (status, available_at);
create index if not exists idx_booking_notification_booking
  on pos.booking_notification_deliveries (booking_order_source_id, created_at desc);

alter table pos.booking_timeline_events enable row level security;
alter table pos.booking_notification_deliveries enable row level security;
revoke all on pos.booking_timeline_events from public, anon, authenticated;
revoke all on pos.booking_notification_deliveries from public, anon, authenticated;
grant select, insert, update on pos.booking_timeline_events to service_role;
grant select, insert, update on pos.booking_notification_deliveries to service_role;

create or replace function pos.record_booking_timeline_event(
  p_booking_id text,
  p_event_type text,
  p_event_reference text,
  p_from_value text default null,
  p_to_value text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_id text := 'booking_timeline_' || md5(trim(p_booking_id) || ':' || p_event_type || ':' || p_event_reference);
  v_now double precision := extract(epoch from now()) * 1000;
  v_inserted boolean := false;
begin
  if nullif(trim(p_booking_id), '') is null or nullif(trim(p_event_type), '') is null or nullif(trim(p_event_reference), '') is null then
    raise exception using errcode = '22023', message = 'Booking timeline identity is incomplete';
  end if;
  if not exists (select 1 from pos.booking_orders where source_id = trim(p_booking_id)) then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  insert into pos.booking_timeline_events(
    id, booking_order_source_id, event_type, event_reference,
    from_value, to_value, payload, created_at
  ) values (
    v_id, trim(p_booking_id), trim(p_event_type), trim(p_event_reference),
    p_from_value, p_to_value, coalesce(p_payload, '{}'::jsonb), v_now
  ) on conflict (booking_order_source_id, event_type, event_reference) do nothing;
  v_inserted := found;

  return jsonb_build_object('ok', true, 'id', v_id, 'inserted', v_inserted);
end;
$$;

create or replace function pos.enqueue_booking_notification(
  p_booking_id text,
  p_event_type text,
  p_channel text,
  p_schedule_reference text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_dedupe text := 'booking:' || trim(p_booking_id) || ':' || trim(p_event_type) || ':' || trim(p_channel) || ':' || trim(p_schedule_reference);
  v_id text := 'booking_notification_' || md5(v_dedupe);
  v_now double precision := extract(epoch from now()) * 1000;
  v_inserted boolean := false;
begin
  if nullif(trim(p_booking_id), '') is null or nullif(trim(p_event_type), '') is null or nullif(trim(p_channel), '') is null or nullif(trim(p_schedule_reference), '') is null then
    raise exception using errcode = '22023', message = 'Booking notification identity is incomplete';
  end if;
  if p_channel not in ('whatsapp','telegram','internal') then
    raise exception using errcode = '22023', message = 'Unsupported booking notification channel';
  end if;
  if not exists (select 1 from pos.booking_orders where source_id = trim(p_booking_id)) then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  insert into pos.booking_notification_deliveries(
    id, booking_order_source_id, event_type, channel, dedupe_key,
    status, payload, created_at, updated_at
  ) values (
    v_id, trim(p_booking_id), trim(p_event_type), trim(p_channel), v_dedupe,
    'queued', coalesce(p_payload, '{}'::jsonb), v_now, v_now
  ) on conflict (dedupe_key) do nothing;
  v_inserted := found;

  return jsonb_build_object('ok', true, 'id', v_id, 'dedupeKey', v_dedupe, 'inserted', v_inserted, 'status', 'queued');
end;
$$;

create or replace function pos.booking_orders_phase6_after_update()
returns trigger
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_reference text := extract(epoch from clock_timestamp())::text || ':' || txid_current()::text;
  v_payload jsonb := jsonb_build_object('bookingId', new.source_id, 'bookingCode', new.booking_code, 'customerName', new.customer_name, 'customerPhone', new.customer_phone, 'bookingDate', new.booking_date, 'arrivalTime', new.arrival_time);
begin
  if old.booking_status is distinct from new.booking_status then
    perform pos.record_booking_timeline_event(new.source_id, 'booking_status_changed', v_reference, old.booking_status, new.booking_status, v_payload);
    perform pos.enqueue_booking_notification(new.source_id, 'booking_status_changed', 'internal', v_reference, v_payload || jsonb_build_object('fromStatus', old.booking_status, 'toStatus', new.booking_status));
    if new.customer_phone is not null and btrim(new.customer_phone) <> '' then
      perform pos.enqueue_booking_notification(new.source_id, 'booking_status_changed', 'whatsapp', v_reference, v_payload || jsonb_build_object('fromStatus', old.booking_status, 'toStatus', new.booking_status));
    end if;
  end if;
  if old.payment_status is distinct from new.payment_status then
    perform pos.record_booking_timeline_event(new.source_id, 'payment_status_changed', v_reference, old.payment_status, new.payment_status, v_payload);
    perform pos.enqueue_booking_notification(new.source_id, 'payment_status_changed', 'internal', v_reference, v_payload || jsonb_build_object('fromStatus', old.payment_status, 'toStatus', new.payment_status));
    if new.customer_phone is not null and btrim(new.customer_phone) <> '' then
      perform pos.enqueue_booking_notification(new.source_id, 'payment_status_changed', 'whatsapp', v_reference, v_payload || jsonb_build_object('fromStatus', old.payment_status, 'toStatus', new.payment_status));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_booking_orders_phase6_after_update on pos.booking_orders;
create trigger trg_booking_orders_phase6_after_update
after update on pos.booking_orders
for each row execute function pos.booking_orders_phase6_after_update();

revoke all on function pos.record_booking_timeline_event(text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function pos.enqueue_booking_notification(text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function pos.booking_orders_phase6_after_update() from public, anon, authenticated;
grant execute on function pos.record_booking_timeline_event(text,text,text,text,text,jsonb) to service_role;
grant execute on function pos.enqueue_booking_notification(text,text,text,text,jsonb) to service_role;

notify pgrst, 'reload schema';
