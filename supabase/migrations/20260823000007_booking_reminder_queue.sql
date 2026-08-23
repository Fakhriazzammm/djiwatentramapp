-- Queue-only booking reminders. External delivery remains owned by a future provider worker.
create or replace function pos.enqueue_due_booking_reminders(
  p_now double precision default extract(epoch from now()) * 1000,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_count integer := 0;
  v_booking record;
  v_arrival_ms double precision;
  v_payload jsonb;
begin
  for v_booking in
    select * from pos.booking_orders
    where coalesce(booking_status, 'pending') in ('pending','confirmed','arrived')
      and coalesce(payment_status, 'pending') <> 'paid'
    order by creation_time asc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    v_payload := jsonb_build_object('bookingId', v_booking.source_id, 'bookingCode', v_booking.booking_code, 'customerName', v_booking.customer_name, 'customerPhone', v_booking.customer_phone, 'bookingDate', v_booking.booking_date, 'arrivalTime', v_booking.arrival_time, 'paymentStatus', v_booking.payment_status, 'bookingStatus', v_booking.booking_status);

    if v_booking.booking_date is not null then
      if to_date(v_booking.booking_date, 'YYYY-MM-DD') = ((to_timestamp(p_now / 1000.0) at time zone 'Asia/Jakarta')::date + 1) then
        perform pos.enqueue_booking_notification(v_booking.source_id, 'reminder_h1', 'internal', v_booking.booking_date, v_payload);
        if v_booking.customer_phone is not null and btrim(v_booking.customer_phone) <> '' then
          perform pos.enqueue_booking_notification(v_booking.source_id, 'reminder_h1', 'whatsapp', v_booking.booking_date, v_payload);
        end if;
      end if;
    end if;

    if v_booking.arrival_time is not null and v_booking.booking_date is not null then
      v_arrival_ms := extract(epoch from ((v_booking.booking_date || ' ' || v_booking.arrival_time)::timestamp at time zone 'Asia/Jakarta')) * 1000;
      if v_arrival_ms between p_now + (2.5 * 3600000) and p_now + (3.5 * 3600000) then
        perform pos.enqueue_booking_notification(v_booking.source_id, 'reminder_pre_arrival', 'internal', v_booking.booking_date || ':' || v_booking.arrival_time, v_payload);
        if v_booking.customer_phone is not null and btrim(v_booking.customer_phone) <> '' then
          perform pos.enqueue_booking_notification(v_booking.source_id, 'reminder_pre_arrival', 'whatsapp', v_booking.booking_date || ':' || v_booking.arrival_time, v_payload);
        end if;
      end if;
      if coalesce(v_booking.booking_status, 'pending') = 'confirmed' and v_arrival_ms < p_now - 30 * 60000 then
        perform pos.enqueue_booking_notification(v_booking.source_id, 'late_arrival_flag', 'internal', v_booking.booking_date || ':' || v_booking.arrival_time, v_payload || jsonb_build_object('lateByMinutes', floor((p_now - v_arrival_ms) / 60000)));
      end if;
    end if;

    if coalesce(v_booking.payment_status, 'pending') in ('pending','failed') then
      perform pos.enqueue_booking_notification(v_booking.source_id, 'pending_payment_reminder', 'internal', to_char(to_timestamp(p_now / 1000.0), 'YYYY-MM-DD-HH24'), v_payload);
    end if;
  end loop;

  select count(*) into v_count from pos.booking_notification_deliveries where created_at >= p_now - 1000;
  return jsonb_build_object('ok', true, 'queuedOrExisting', v_count);
end;
$$;

revoke all on function pos.enqueue_due_booking_reminders(double precision, integer) from public, anon, authenticated;
grant execute on function pos.enqueue_due_booking_reminders(double precision, integer) to service_role;
notify pgrst, 'reload schema';
