-- Read-only booking timeline and delivery projection for authenticated admin surfaces.
create or replace function pos.booking_read_timeline(p_booking_id text)
returns jsonb
language sql
security definer
set search_path = pos, public, pg_catalog
as $$
  select jsonb_build_object(
    'timeline', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from pos.booking_timeline_events e where e.booking_order_source_id = trim(p_booking_id)), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from pos.booking_notification_deliveries d where d.booking_order_source_id = trim(p_booking_id)), '[]'::jsonb)
  );
$$;

create or replace function pos.booking_read_delivery(p_booking_id text)
returns setof pos.booking_notification_deliveries
language sql
security definer
set search_path = pos, public, pg_catalog
as $$
  select * from pos.booking_notification_deliveries
  where booking_order_source_id = trim(p_booking_id)
  order by created_at desc;
$$;

revoke all on function pos.booking_read_timeline(text) from public, anon, authenticated;
revoke all on function pos.booking_read_delivery(text) from public, anon, authenticated;
grant execute on function pos.booking_read_timeline(text) to service_role;
grant execute on function pos.booking_read_delivery(text) to service_role;
notify pgrst, 'reload schema';
