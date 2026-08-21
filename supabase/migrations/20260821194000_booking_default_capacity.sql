-- Default booking capacity with optional per-date overrides.
-- ROLLBACK: ALTER TABLE pos.booking_settings DROP COLUMN IF EXISTS booking_window_days, DROP COLUMN IF EXISTS default_max_people, DROP COLUMN IF EXISTS default_max_tables, DROP COLUMN IF EXISTS default_people_per_table; ALTER TABLE pos.booking_date_capacity DROP COLUMN IF EXISTS is_closed;

alter table pos.booking_settings
  add column if not exists booking_window_days integer not null default 90,
  add column if not exists default_max_people integer not null default 100,
  add column if not exists default_max_tables integer not null default 25,
  add column if not exists default_people_per_table integer not null default 4;

alter table pos.booking_date_capacity
  add column if not exists is_closed boolean not null default false;

create index if not exists idx_pos_booking_date_capacity_slug_date_closed
  on pos.booking_date_capacity (slug, booking_date, is_closed);

create or replace view public.pos_booking_settings
with (security_invoker = false) as
select
  source_id as _id, slug, title, description,
  logo_url as "logoUrl", banner_url as "bannerUrl", theme_color as "themeColor",
  social_links as "socialLinks", featured_product_ids as "featuredProductIds",
  payment_methods as "paymentMethods", bank_details as "bankDetails",
  qris_image as "qrisImage", is_active as "isActive", custom_fields as "customFields", raw,
  booking_window_days as "bookingWindowDays",
  default_max_people as "defaultMaxPeople",
  default_max_tables as "defaultMaxTables",
  default_people_per_table as "defaultPeoplePerTable"
from pos.booking_settings;

create or replace view public.pos_booking_date_capacity
with (security_invoker = false) as
select
  source_id as _id, slug, booking_date as date,
  max_people as "maxPeople", max_tables as "maxTables",
  people_per_table as "peoplePerTable", notes, is_closed as "isClosed"
from pos.booking_date_capacity;

drop function if exists public.create_public_booking(jsonb, text, text, text);
create or replace function public.create_public_booking(
  p_payload jsonb,
  p_guest_session_id text,
  p_access_token text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pos, pg_catalog
as $$
declare
  v_slug text := nullif(trim(p_payload->>'slug'), '');
  v_booking_date text := nullif(trim(p_payload->>'bookingDate'), '');
  v_name text := nullif(trim(p_payload->>'customerName'), '');
  v_phone text := nullif(trim(p_payload->>'customerPhone'), '');
  v_email text := nullif(trim(p_payload->>'customerEmail'), '');
  v_notes text := nullif(trim(p_payload->>'notes'), '');
  v_guest_count integer := (p_payload->>'guestCount')::integer;
  v_table_count integer;
  v_max_people integer;
  v_max_tables integer;
  v_people_per_table integer;
  v_is_closed boolean := false;
  v_default_max_people integer;
  v_default_max_tables integer;
  v_default_people_per_table integer;
  v_booking_window_days integer;
  v_booked_people integer;
  v_booked_tables integer;
  v_expires_at double precision := extract(epoch from now() + interval '30 minutes') * 1000;
  v_now double precision := extract(epoch from now()) * 1000;
  v_booking_id text := 'booking_' || replace(gen_random_uuid()::text, '-', '');
  v_booking_code text := 'BK' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_token_hash text := encode(extensions.digest(coalesce(p_access_token, ''), 'sha256'::text), 'hex');
  v_idempotency_hash text := encode(extensions.digest(coalesce(p_idempotency_key, ''), 'sha256'::text), 'hex');
  v_existing pos.booking_orders%rowtype;
  v_item jsonb;
  v_product pos.products%rowtype;
  v_line integer := 0;
  v_quantity numeric;
  v_price numeric;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_slug is null or v_booking_date is null or v_name is null or v_phone is null
     or coalesce(p_access_token, '') = '' or coalesce(p_idempotency_key, '') = '' then
    raise exception using errcode = '22023', message = 'Required booking fields are missing';
  end if;
  if v_booking_date !~ '^\d{4}-\d{2}-\d{2}$' or v_booking_date::date < current_date then
    raise exception using errcode = '22023', message = 'Booking date is invalid or in the past';
  end if;
  if v_guest_count is null or v_guest_count < 1 or v_guest_count > 100 then
    raise exception using errcode = '22023', message = 'Guest count must be between 1 and 100';
  end if;

  select * into v_existing
  from pos.booking_orders
  where slug = v_slug and idempotency_key_hash = v_idempotency_hash
  limit 1;
  if found then
    return jsonb_build_object(
      'bookingId', v_existing.source_id, 'bookingCode', v_existing.booking_code,
      'bookingStatus', v_existing.booking_status, 'paymentStatus', v_existing.payment_status,
      'bookingDate', v_existing.booking_date, 'guestCount', v_existing.guest_count,
      'tableCount', v_existing.table_count, 'totalAmount', v_existing.total_amount,
      'idempotent', true
    );
  end if;

  -- Lock the settings row so default-capacity checks serialize atomically.
  -- A date row is an optional override; missing override uses the defaults.
  select default_max_people, default_max_tables, greatest(default_people_per_table, 1), booking_window_days
    into v_default_max_people, v_default_max_tables, v_default_people_per_table, v_booking_window_days
  from pos.booking_settings
  where slug = v_slug
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Booking date is unavailable';
  end if;
  if v_booking_date::date > current_date + greatest(coalesce(v_booking_window_days, 1) - 1, 0) then
    raise exception using errcode = 'P0001', message = 'Booking date is outside the booking window';
  end if;

  select max_people, max_tables, greatest(people_per_table, 1), coalesce(is_closed, false)
    into v_max_people, v_max_tables, v_people_per_table, v_is_closed
  from pos.booking_date_capacity
  where slug = v_slug and booking_date = v_booking_date
  for update;
  if not found then
    v_max_people := v_default_max_people;
    v_max_tables := v_default_max_tables;
    v_people_per_table := v_default_people_per_table;
  end if;
  if v_is_closed then
    raise exception using errcode = 'P0001', message = 'Booking date is unavailable';
  end if;
  v_table_count := ceil(v_guest_count::numeric / greatest(v_people_per_table, 1))::integer;

  select coalesce(sum(guest_count), 0), coalesce(sum(table_count), 0)
    into v_booked_people, v_booked_tables
  from pos.booking_orders
  where slug = v_slug and booking_date = v_booking_date
    and booking_status not in ('cancelled', 'expired', 'no_show')
    and (booking_status <> 'pending' or guest_expires_at is null or guest_expires_at > v_now);
  if v_max_people > 0 and v_booked_people + v_guest_count > v_max_people then
    raise exception using errcode = 'P0001', message = 'People capacity is full';
  end if;
  if v_max_tables > 0 and v_booked_tables + v_table_count > v_max_tables then
    raise exception using errcode = 'P0001', message = 'Table capacity is full';
  end if;

  -- Re-read every requested product under the same transaction and snapshot
  -- the authoritative current selling price; client prices/names are ignored.
  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_line := v_line + 1;
    select * into v_product from pos.products
      where source_id = nullif(v_item->>'productId', '') and is_available = true;
    if not found then
      raise exception using errcode = 'P0001', message = 'One or more menu items are unavailable';
    end if;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 100 then
      raise exception using errcode = '22023', message = 'Menu quantity is invalid';
    end if;
    v_price := coalesce(v_product.promo_price, v_product.price);
    v_total := v_total + (v_price * v_quantity);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'lineNo', v_line, 'productId', v_product.source_id, 'name', v_product.name,
      'price', v_price, 'quantity', v_quantity
    ));
  end loop;

  insert into pos.booking_orders (
    source_id, source, slug, booking_code, customer_name, customer_phone,
    customer_email, notes, booking_date, total_amount, payment_method,
    payment_status, booking_status, guest_count, table_count, guest_session_id,
    guest_expires_at, access_token_hash, idempotency_key_hash, custom_answers,
    metadata, created_at, creation_time, raw
  ) values (
    v_booking_id, 'customer_booking', v_slug, v_booking_code, v_name, v_phone,
    coalesce(v_email, ''), v_notes, v_booking_date, v_total,
    nullif(trim(p_payload->>'paymentMethod'), ''), 'pending', 'pending',
    v_guest_count, v_table_count, nullif(trim(p_guest_session_id), ''),
    v_expires_at, v_token_hash, v_idempotency_hash,
    coalesce(p_payload->'customAnswers', '{}'::jsonb),
    jsonb_build_object('contract', 'public-booking-v1'), v_now, v_now, '{}'::jsonb
  );

  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into pos.booking_order_items (
      booking_order_source_id, line_no, product_source_id, product_name,
      price, quantity, raw
    ) values (
      v_booking_id, (v_item->>'lineNo')::integer, v_item->>'productId',
      v_item->>'name', (v_item->>'price')::numeric, (v_item->>'quantity')::numeric,
      v_item
    );
  end loop;

  return jsonb_build_object(
    'bookingId', v_booking_id, 'bookingCode', v_booking_code,
    'bookingStatus', 'pending', 'paymentStatus', 'pending',
    'bookingDate', v_booking_date, 'guestCount', v_guest_count,
    'tableCount', v_table_count, 'totalAmount', v_total, 'items', v_items,
    'guestExpiresAt', v_expires_at, 'idempotent', false
  );
exception when unique_violation then
  select * into v_existing from pos.booking_orders
    where slug = v_slug and idempotency_key_hash = v_idempotency_hash limit 1;
  if found then
    return jsonb_build_object('bookingId', v_existing.source_id, 'bookingCode', v_existing.booking_code, 'idempotent', true);
  end if;
  raise;
end;
$$;

-- Add line numbers to the item snapshot returned by the RPC without changing
-- the existing item table contract.
-- (The JSON array is rebuilt here so insertion above remains deterministic.)

create or replace function public.get_public_booking_status(
  p_slug text,
  p_booking_code text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pos, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_token_hash text := encode(extensions.digest(coalesce(p_access_token, ''), 'sha256'::text), 'hex');
  v_items jsonb;
begin
  select * into v_booking from pos.booking_orders
  where slug = nullif(trim(p_slug), '')
    and booking_code = nullif(trim(p_booking_code), '')
    and access_token_hash = v_token_hash
  limit 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', product_source_id, 'name', product_name,
    'price', price, 'quantity', quantity
  ) order by line_no), '[]'::jsonb) into v_items
  from pos.booking_order_items where booking_order_source_id = v_booking.source_id;
  return jsonb_build_object(
    'bookingId', v_booking.source_id, 'bookingCode', v_booking.booking_code,
    'bookingDate', v_booking.booking_date, 'customerName', v_booking.customer_name,
    'guestCount', v_booking.guest_count, 'tableCount', v_booking.table_count,
    'totalAmount', v_booking.total_amount, 'bookingStatus', v_booking.booking_status,
    'paymentStatus', v_booking.payment_status, 'paymentMethod', v_booking.payment_method,
    'items', v_items, 'createdAt', v_booking.created_at,
    'guestExpiresAt', v_booking.guest_expires_at
  );
end;
$$;

revoke all on function public.create_public_booking(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.get_public_booking_status(text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_booking(jsonb, text, text, text) to service_role;
grant execute on function public.get_public_booking_status(text, text, text) to service_role;

-- Ensure PostgREST sees the newly-added RPCs after migration.
notify pgrst, 'reload schema';
