begin;
insert into pos.order_tracking_events (order_source_id, order_no, event_type, to_status, actor_type, source_event_id, metadata, occurred_at)
select source_id, order_number, 'order_lifecycle', status, 'system',
  'order-lifecycle:' || source_id || ':' || status,
  jsonb_build_object('backfill', true, 'payment_method', payment_method, 'order_type', order_type),
  to_timestamp(coalesce(created_at, creation_time, extract(epoch from now())))
from pos.orders
on conflict do nothing;

insert into pos.order_tracking_events (order_source_id, order_no, event_type, to_status, group_type, actor_type, source_event_id, metadata, occurred_at)
select o.source_id, s.order_no, 'production_group', s.status, s.group_type, 'system',
  'production-group:' || s.id || ':' || s.status || ':' || coalesce(s.updated_at::text, ''),
  jsonb_build_object('backfill', true, 'completed_items', coalesce(s.completed_items, '[]'::jsonb)),
  coalesce(s.updated_at, now())
from pos.order_status s
join pos.orders o on o.order_number = s.order_no
on conflict do nothing;
commit;
