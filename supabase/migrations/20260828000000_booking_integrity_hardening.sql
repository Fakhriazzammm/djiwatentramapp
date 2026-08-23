-- Booking integrity hardening: additive audit trail and guarded admin transitions.
-- Preserves existing RPC signatures and API payloads.

create table if not exists pos.booking_order_events (
  source_id text primary key,
  source_reference text,
  booking_order_source_id text not null,
  event_type text not null,
  actor_user_id text,
  actor_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at double precision not null default extract(epoch from now()) * 1000
);

alter table pos.booking_order_events add column if not exists source_reference text;

create index if not exists idx_booking_order_events_booking_created
  on pos.booking_order_events (booking_order_source_id, created_at desc);

create unique index if not exists ux_booking_order_events_reference_v2
  on pos.booking_order_events (booking_order_source_id, event_type, source_reference)
  where source_reference is not null;

alter table pos.booking_order_events enable row level security;
revoke all on pos.booking_order_events from public, anon, authenticated;
grant select, insert on pos.booking_order_events to service_role;

create or replace function pos.admin_update_booking(
  p_booking_id text,
  p_payload jsonb,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_old_date text;
  v_date text;
  v_guest_count integer;
  v_people_per_table integer;
  v_max_people integer;
  v_max_tables integer;
  v_is_closed boolean := false;
  v_booked_people integer := 0;
  v_booked_tables integer := 0;
  v_table_count integer;
  v_now double precision := extract(epoch from now()) * 1000;
  v_event_id text;
  v_item jsonb;
  v_line integer := 0;
  v_total numeric;
begin
  if nullif(trim(p_booking_id), '') is null then
    raise exception using errcode = '22023', message = 'Booking id is required';
  end if;

  select * into v_booking
  from pos.booking_orders
  where source_id = trim(p_booking_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  v_old_date := v_booking.booking_date;
  v_date := coalesce(nullif(trim(p_payload->>'bookingDate'), ''), v_booking.booking_date);
  v_guest_count := greatest(1, coalesce((p_payload->>'guestCount')::integer, v_booking.guest_count));

  if v_booking.payment_status in ('paid', 'verified')
     and p_payload ? 'totalAmount'
     and greatest(0, (p_payload->>'totalAmount')::numeric) <> v_booking.total_amount then
    raise exception using errcode = '42501', message = 'Paid booking total cannot be edited';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.slug || ':' || v_date, 0));

  select greatest(1, s.default_people_per_table), s.default_max_people, s.default_max_tables
    into v_people_per_table, v_max_people, v_max_tables
  from pos.booking_settings s
  where s.slug = v_booking.slug
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Booking date is unavailable';
  end if;

  select greatest(1, coalesce(c.people_per_table, v_people_per_table)),
         coalesce(c.max_people, v_max_people), coalesce(c.max_tables, v_max_tables),
         coalesce(c.is_closed, false)
    into v_people_per_table, v_max_people, v_max_tables, v_is_closed
  from pos.booking_date_capacity c
  where c.slug = v_booking.slug and c.booking_date = v_date
  for update;
  if not found then
    v_is_closed := false;
  end if;
  if v_is_closed then
    raise exception using errcode = 'P0001', message = 'Booking date is unavailable';
  end if;

  v_table_count := ceil(v_guest_count::numeric / greatest(1, v_people_per_table))::integer;
  select coalesce(sum(guest_count), 0), coalesce(sum(table_count), 0)
    into v_booked_people, v_booked_tables
  from pos.booking_orders
  where slug = v_booking.slug
    and booking_date = v_date
    and source_id <> v_booking.source_id
    and booking_status not in ('cancelled', 'expired', 'no_show')
    and (booking_status <> 'pending' or guest_expires_at is null or guest_expires_at > v_now);

  if v_max_people > 0 and v_booked_people + v_guest_count > v_max_people then
    raise exception using errcode = 'P0001', message = 'People capacity is full';
  end if;
  if v_max_tables > 0 and v_booked_tables + v_table_count > v_max_tables then
    raise exception using errcode = 'P0001', message = 'Table capacity is full';
  end if;

  update pos.booking_orders set
    customer_name = case when p_payload ? 'customerName' then trim(p_payload->>'customerName') else customer_name end,
    customer_phone = case when p_payload ? 'customerPhone' then trim(p_payload->>'customerPhone') else customer_phone end,
    customer_email = case when p_payload ? 'customerEmail' then trim(p_payload->>'customerEmail') else customer_email end,
    notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end,
    booking_date = v_date,
    guest_count = v_guest_count,
    table_count = v_table_count,
    payment_method = case when p_payload ? 'paymentMethod' then p_payload->>'paymentMethod' else payment_method end,
    raw = coalesce(raw, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb)
  where source_id = v_booking.source_id;

  if p_items is not null then
    delete from pos.booking_order_items where booking_order_source_id = p_booking_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      v_line := v_line + 1;
      if greatest(0, coalesce((v_item->>'quantity')::numeric, 0)) <= 0 then
        raise exception using errcode = '22023', message = 'Menu quantity is invalid';
      end if;
      insert into pos.booking_order_items (
        booking_order_source_id, line_no, product_source_id, product_name,
        price, quantity, raw
      ) values (
        p_booking_id, v_line, nullif(v_item->>'productId', ''),
        nullif(v_item->>'name', ''), greatest(0, coalesce((v_item->>'price')::numeric, 0)),
        (v_item->>'quantity')::numeric, coalesce(v_item, '{}'::jsonb)
      );
    end loop;
  end if;

  v_event_id := 'booking_event_update_' || p_booking_id || '_' || v_now::bigint;
  insert into pos.booking_order_events(source_id, source_reference, booking_order_source_id, event_type, payload, created_at)
  values (v_event_id, v_event_id, p_booking_id, 'booking_updated', jsonb_build_object('fromDate', v_old_date, 'toDate', v_date, 'guestCount', v_guest_count), v_now)
  on conflict (source_id) do nothing;

  return jsonb_build_object('bookingId', p_booking_id, 'updated', true, 'bookingDate', v_date, 'guestCount', v_guest_count, 'tableCount', v_table_count);
end;
$$;

create or replace function pos.admin_update_booking_status(
  p_booking_id text,
  p_booking_status text default null,
  p_payment_status text default null,
  p_payment_date double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_from_booking text;
  v_from_payment text;
  v_to_booking text := nullif(trim(p_booking_status), '');
  v_to_payment text := nullif(trim(p_payment_status), '');
  v_now double precision := coalesce(p_payment_date, extract(epoch from now()) * 1000);
  v_fin_id text := 'booking_fin_' || p_booking_id;
  v_event_id text;
begin
  select * into v_booking from pos.booking_orders where source_id = trim(p_booking_id) for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found'; end if;

  v_from_booking := coalesce(v_booking.booking_status, 'pending');
  v_from_payment := coalesce(v_booking.payment_status, 'pending');

  if v_to_booking is not null and v_to_booking not in ('pending','confirmed','arrived','seated','completed','cancelled','no_show','expired') then
    raise exception using errcode = '22023', message = 'Invalid booking status';
  end if;
  if v_to_payment is not null and v_to_payment not in ('pending','paid','verified','refunded','failed') then
    raise exception using errcode = '22023', message = 'Invalid payment status';
  end if;

  if v_to_booking is not null and v_to_booking <> v_from_booking and not (
    (v_from_booking = 'pending' and v_to_booking in ('confirmed','cancelled','expired')) or
    (v_from_booking = 'confirmed' and v_to_booking in ('arrived','cancelled','no_show')) or
    (v_from_booking = 'arrived' and v_to_booking in ('seated','cancelled','no_show')) or
    (v_from_booking = 'seated' and v_to_booking in ('completed','cancelled'))
  ) then
    raise exception using errcode = '55000', message = 'Invalid booking status transition';
  end if;

  if v_to_payment = 'paid' and v_from_payment not in ('pending','failed') then
    if v_from_payment = 'paid' then
      return jsonb_build_object('bookingId', p_booking_id, 'updated', false, 'idempotent', true, 'paymentStatus', v_from_payment, 'bookingStatus', v_from_booking);
    end if;
    raise exception using errcode = '55000', message = 'Invalid payment status transition';
  end if;
  if v_to_payment = 'refunded' and v_from_payment not in ('paid','verified') then
    raise exception using errcode = '55000', message = 'Only paid booking can be refunded';
  end if;

  if v_to_payment = 'paid' then
    insert into pos.financial_transactions (
      source_id, tx_type, amount, category, description, tx_date, payment_method,
      status, booking_order_source_id, creation_time, raw
    ) values (
      v_fin_id, 'income', v_booking.total_amount, 'Booking',
      format('Booking #%s - %s (%s)', v_booking.booking_code, v_booking.customer_name, v_booking.booking_date),
      v_now, coalesce(v_booking.payment_method, 'manual'), 'completed', p_booking_id, v_now,
      jsonb_build_object('kind','booking_manual_payment_confirmation','bookingOrderId',p_booking_id,'verifiedBy','admin')
    ) on conflict (source_id) do nothing;
  end if;

  update pos.booking_orders set
    booking_status = coalesce(v_to_booking, booking_status),
    payment_status = coalesce(v_to_payment, payment_status),
    payment_paid_at = case when v_to_payment = 'paid' then v_now else payment_paid_at end,
    payment_receipt_kind = case when v_to_payment = 'paid' then 'manual_verified' else payment_receipt_kind end,
    confirmed_at = case when v_to_payment = 'paid' then coalesce(confirmed_at, v_now) else confirmed_at end,
    cancelled_at = case when v_to_booking = 'cancelled' then coalesce(cancelled_at, v_now) else cancelled_at end,
    cancellation_reason = case when v_to_booking = 'cancelled' then coalesce(cancellation_reason, 'Cancelled from Admin') else cancellation_reason end
  where source_id = p_booking_id;

  v_event_id := 'booking_event_status_' || p_booking_id || '_' || v_now::bigint;
  insert into pos.booking_order_events(source_id, source_reference, booking_order_source_id, event_type, payload, created_at)
  values (v_event_id, v_event_id, p_booking_id, 'status_changed', jsonb_build_object('fromBookingStatus', v_from_booking, 'toBookingStatus', coalesce(v_to_booking, v_from_booking), 'fromPaymentStatus', v_from_payment, 'toPaymentStatus', coalesce(v_to_payment, v_from_payment), 'manualPayment', v_to_payment = 'paid'), v_now)
  on conflict (source_id) do nothing;

  return jsonb_build_object('bookingId', p_booking_id, 'updated', true, 'idempotent', false, 'bookingStatus', coalesce(v_to_booking, v_from_booking), 'paymentStatus', coalesce(v_to_payment, v_from_payment));
end;
$$;

create or replace function pos.admin_delete_booking(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_now double precision := extract(epoch from now()) * 1000;
  v_event_id text;
begin
  select * into v_booking from pos.booking_orders where source_id = trim(p_booking_id) for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found'; end if;
  if v_booking.payment_status in ('paid', 'verified')
     or exists (select 1 from pos.financial_transactions where booking_order_source_id = p_booking_id) then
    update pos.booking_orders set booking_status='cancelled', cancelled_at=coalesce(cancelled_at, v_now), cancellation_reason=coalesce(cancellation_reason, 'Cancelled from Admin') where source_id=p_booking_id;
    v_event_id := 'booking_event_cancel_' || p_booking_id || '_' || v_now::bigint;
    insert into pos.booking_order_events(source_id, source_reference, booking_order_source_id, event_type, payload, created_at)
    values(v_event_id, v_event_id, p_booking_id, 'booking_cancelled', jsonb_build_object('reason','Cancelled from Admin','financeLinked',true), v_now)
    on conflict (source_id) do nothing;
    return jsonb_build_object('bookingId',p_booking_id,'cancelled',true,'deleted',false);
  end if;
  delete from pos.booking_order_items where booking_order_source_id=p_booking_id;
  delete from pos.booking_orders where source_id=p_booking_id;
  return jsonb_build_object('bookingId',p_booking_id,'cancelled',false,'deleted',true);
end;
$$;

revoke all on function pos.admin_update_booking(text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function pos.admin_update_booking_status(text,text,text,double precision) from public, anon, authenticated;
revoke all on function pos.admin_delete_booking(text) from public, anon, authenticated;
grant execute on function pos.admin_update_booking(text,jsonb,jsonb) to service_role;
grant execute on function pos.admin_update_booking_status(text,text,text,double precision) to service_role;
grant execute on function pos.admin_delete_booking(text) to service_role;

notify pgrst, 'reload schema';
