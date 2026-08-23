-- Booking notification queue worker contract.
-- Additive, idempotent, and does not send external messages.

create or replace function pos.claim_booking_notification_deliveries(
  p_worker_id text,
  p_limit integer default 25,
  p_now double precision default extract(epoch from now()) * 1000
)
returns setof pos.booking_notification_deliveries
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception using errcode = '22023', message = 'Notification worker id is required';
  end if;
  return query
  with candidates as (
    select id
    from pos.booking_notification_deliveries
    where status in ('queued','retrying')
      and available_at <= p_now
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update pos.booking_notification_deliveries d
    set status = 'sending',
        attempt_count = d.attempt_count + 1,
        updated_at = p_now,
        last_error = null,
        payload = d.payload || jsonb_build_object('claimedBy', trim(p_worker_id), 'claimedAt', p_now)
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select * from claimed order by created_at asc;
end;
$$;

create or replace function pos.complete_booking_notification_delivery(
  p_id text,
  p_status text,
  p_error text default null,
  p_retry_delay_ms double precision default 60000,
  p_now double precision default extract(epoch from now()) * 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_row pos.booking_notification_deliveries%rowtype;
  v_next_status text := trim(p_status);
  v_next_time double precision := p_now + greatest(1000, coalesce(p_retry_delay_ms, 60000));
begin
  if v_next_status not in ('sent','failed','retrying') then
    raise exception using errcode = '22023', message = 'Invalid notification completion status';
  end if;
  update pos.booking_notification_deliveries
  set status = v_next_status,
      sent_at = case when v_next_status = 'sent' then p_now else sent_at end,
      last_error = nullif(trim(coalesce(p_error, '')), ''),
      available_at = case when v_next_status = 'retrying' then v_next_time else available_at end,
      updated_at = p_now
  where id = trim(p_id)
  returning * into v_row;
  if not found then
    raise exception using errcode = 'P0002', message = 'Notification delivery not found';
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'attemptCount', v_row.attempt_count, 'sentAt', v_row.sent_at, 'availableAt', v_row.available_at);
end;
$$;

revoke all on function pos.claim_booking_notification_deliveries(text, integer, double precision) from public, anon, authenticated;
revoke all on function pos.complete_booking_notification_delivery(text, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function pos.claim_booking_notification_deliveries(text, integer, double precision) to service_role;
grant execute on function pos.complete_booking_notification_delivery(text, text, text, double precision, double precision) to service_role;

notify pgrst, 'reload schema';
