-- Atomic creator visit booking request.
create or replace function pos.kol_request_visit_booking(
  p_kol_id text,
  p_booking_date date,
  p_visit_note text default null
)
returns table(id bigint, booking_date date, status text)
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
begin
  if p_booking_date < (now() at time zone 'Asia/Jakarta')::date then
    raise exception using errcode = '22023', message = 'booking date is in the past';
  end if;

  if exists (
    select 1 from pos.kol_visit_bookings
    where kol_id = p_kol_id and status in ('requested','confirmed')
  ) then
    raise exception using errcode = '23505', message = 'creator already has an active visit booking';
  end if;

  return query
  insert into pos.kol_visit_bookings(kol_id, booking_date, status, visit_note)
  values (p_kol_id, p_booking_date, 'requested', nullif(btrim(p_visit_note), ''))
  returning pos.kol_visit_bookings.id, pos.kol_visit_bookings.booking_date, pos.kol_visit_bookings.status;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'visit date is already booked';
end;
$$;

revoke all on function pos.kol_request_visit_booking(text, date, text) from public, anon, authenticated;
grant execute on function pos.kol_request_visit_booking(text, date, text) to service_role;
notify pgrst, 'reload schema';
