-- Enforce the public booking toggle at the database boundary.
-- Admin/manual bookings are intentionally excluded; they use a separate workflow.
create or replace function pos.enforce_public_booking_active()
returns trigger
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
begin
  if new.source = 'customer_booking'
     and not exists (
       select 1
       from pos.booking_settings
       where slug = new.slug
         and coalesce(is_active, false) = true
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'Public booking is currently inactive';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_orders_public_active
  on pos.booking_orders;

create trigger trg_booking_orders_public_active
before insert on pos.booking_orders
for each row
execute function pos.enforce_public_booking_active();

revoke all on function pos.enforce_public_booking_active() from public;
