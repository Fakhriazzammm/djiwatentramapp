begin;

-- The idempotency index is partial (source_event_id is not null).
-- PostgreSQL cannot infer a partial unique index from an ON CONFLICT target
-- without its predicate, so use the safe catch-all form for trigger inserts.
create or replace function pos.capture_order_tracking_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pos, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into pos.order_tracking_events (
      order_source_id, order_no, event_type, to_status, actor_type, source_event_id, metadata
    ) values (
      new.source_id, new.order_number, 'order_lifecycle', new.status, 'system',
      'order-lifecycle:' || new.source_id || ':' || new.status,
      jsonb_build_object('payment_method', new.payment_method, 'order_type', new.order_type)
    ) on conflict do nothing;
  elsif old.status is distinct from new.status then
    insert into pos.order_tracking_events (
      order_source_id, order_no, event_type, from_status, to_status, actor_type, source_event_id, metadata
    ) values (
      new.source_id, new.order_number, 'order_lifecycle', old.status, new.status, 'system',
      'order-lifecycle:' || new.source_id || ':' || new.status,
      jsonb_build_object('payment_method', new.payment_method, 'order_type', new.order_type)
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function pos.capture_order_tracking_production()
returns trigger
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  tracked_order_id text;
begin
  select source_id into tracked_order_id
  from pos.orders
  where order_number = new.order_no
  limit 1;

  if tracked_order_id is null then return new; end if;

  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into pos.order_tracking_events (
      order_source_id, order_no, event_type, from_status, to_status, group_type,
      actor_type, source_event_id, metadata, occurred_at
    ) values (
      tracked_order_id, new.order_no, 'production_group',
      case when tg_op = 'INSERT' then null else old.status end,
      new.status, new.group_type, 'system',
      'production-group:' || new.id || ':' || new.status || ':' || coalesce(new.updated_at::text, ''),
      jsonb_build_object('completed_items', coalesce(new.completed_items, '[]'::jsonb)),
      coalesce(new.updated_at, now())
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

commit;
