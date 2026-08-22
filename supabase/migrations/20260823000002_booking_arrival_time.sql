-- Arrival time for public booking, normalized as local HH:MM.
alter table pos.booking_orders add column if not exists arrival_time text;
alter table pos.orders add column if not exists arrival_time text;

create index if not exists idx_pos_booking_orders_slug_date_arrival
  on pos.booking_orders (slug, booking_date, arrival_time);

create or replace function pos.sync_booking_arrival_time() returns trigger
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_time text;
begin
  v_time := nullif(trim(coalesce(NEW.arrival_time, NEW.custom_answers->>'Jam kedatangan', NEW.custom_answers->>'arrivalTime', NEW.raw->>'arrivalTime')), '');
  if v_time is not null and v_time !~ '^(00|01|02|03|04|05|06|07|08|09|10|11|12|13|14|15|16|17|18|19|20|21|22|23):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Arrival time is invalid';
  end if;
  NEW.arrival_time := v_time;
  return NEW;
end; $$;

drop trigger if exists trg_sync_booking_arrival_time on pos.booking_orders;
create trigger trg_sync_booking_arrival_time before insert or update of arrival_time, custom_answers, raw on pos.booking_orders for each row execute function pos.sync_booking_arrival_time();

create or replace function pos.sync_pos_order_arrival_time() returns trigger
language plpgsql security definer set search_path = pos, public, pg_catalog as $$
declare v_time text;
begin
  v_time := nullif(trim(coalesce(NEW.arrival_time, NEW.raw->>'arrivalTime')), '');
  if v_time is null and NEW.booking_source_id is not null then
    select arrival_time into v_time from pos.booking_orders where source_id = NEW.booking_source_id;
  end if;
  if v_time is not null and v_time !~ '^(00|01|02|03|04|05|06|07|08|09|10|11|12|13|14|15|16|17|18|19|20|21|22|23):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Arrival time is invalid';
  end if;
  NEW.arrival_time := v_time;
  return NEW;
end; $$;

drop trigger if exists trg_sync_pos_order_arrival_time on pos.orders;
create trigger trg_sync_pos_order_arrival_time before insert or update of arrival_time, raw, booking_source_id on pos.orders for each row execute function pos.sync_pos_order_arrival_time();

create or replace view public.pos_booking_orders with (security_invoker = true) as
select bo.source_id as _id, coalesce(bo.creation_time, bo.created_at) as "_creationTime", bo.slug,
  bo.booking_code as "bookingCode", bo.customer_name as "customerName", bo.customer_phone as "customerPhone",
  bo.customer_email as "customerEmail", bo.notes, bo.booking_date as "bookingDate",
  bo.total_amount as "totalAmount", bo.payment_method as "paymentMethod", bo.payment_status as "paymentStatus",
  bo.booking_status as "bookingStatus", bo.guest_count as "guestCount", bo.table_count as "tableCount",
  bo.payment_proof_image as "paymentProofImage", bo.transferred_amount as "transferredAmount", bo.custom_answers as "customAnswers", bo.created_at as "createdAt",
  coalesce((select jsonb_agg(jsonb_build_object('productId', boi.product_source_id, 'name', boi.product_name, 'price', boi.price, 'quantity', boi.quantity) order by boi.line_no) from pos.booking_order_items boi where boi.booking_order_source_id = bo.source_id), '[]'::jsonb) as items,
  bo.arrival_time as "arrivalTime"
from pos.booking_orders bo;

create or replace view public.pos_orders with (security_invoker = false) as
SELECT o.source_id AS "_id",
    COALESCE(o.creation_time, o.created_at) AS "_creationTime",
    o.order_number AS "orderNumber", o.total_amount AS "totalAmount", o.status,
    o.payment_method AS "paymentMethod", o.customer_name AS "customerName",
    o.customer_email AS "customerEmail", o.customer_description AS "customerDescription",
    o.table_number AS "tableNumber", o.order_type AS "orderType", o.source,
    o.brand_slug AS "brandSlug", o.business_unit AS "businessUnit", o.source_app AS "sourceApp",
    o.guest_count AS "guestCount", o.free_refill_selected AS "freeRefillSelected", o.dessert_later AS "dessertLater",
    o.notes, o.created_at AS "createdAt", o.voucher_source_id AS "voucherId", o.discount_amount AS "discountAmount",
    o.tax_amount AS "taxAmount", o.service_charge_amount AS "serviceChargeAmount", o.receipt_meta AS "receiptMeta",
    o.payment_receipt_kind AS "paymentReceiptKind", o.payment_gateway AS "paymentGateway", o.gateway_invoice_id AS "gatewayInvoiceId",
    o.auth_user_id AS "authUserId", o.daily_receipt_no, o.receipt_kind, o.customer_source_id AS "customerSourceId",
    o.delivery_date AS "deliveryDate", o.delivery_provider AS "deliveryProvider", o.delivery_status AS "deliveryStatus",
    o.delivery_contact_name AS "deliveryContactName", o.delivery_contact_phone AS "deliveryContactPhone", o.delivery_address AS "deliveryAddress",
    o.delivery_notes AS "deliveryNotes", o.booking_source_id AS "bookingSourceId", o.booking_code AS "bookingCode",
    o.booking_date AS "bookingDate", o.booking_type_key AS "bookingTypeKey", o.booking_type_label AS "bookingTypeLabel",
    o.event_type_key AS "eventTypeKey", o.event_type_label AS "eventTypeLabel", o.event_type_other AS "eventTypeOther",
    COALESCE(oi_items.items, '[]'::jsonb) AS items, o.arrival_time AS "arrivalTime"
FROM pos.orders o
LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('productId', oi.product_source_id, 'productName', oi.product_name, 'variant', oi.variant, 'quantity', oi.quantity, 'price', oi.price, 'originalPrice', oi.original_price, 'status', oi.status, 'hppSnapshot', oi.hpp_snapshot) ORDER BY oi.line_no) AS items FROM pos.order_items oi WHERE oi.order_source_id = o.source_id) oi_items ON true;
grant select on public.pos_booking_orders, public.pos_orders to anon, authenticated, service_role;

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
  v_arrival_time text := nullif(trim(p_payload->>'arrivalTime'), '');
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
  if v_arrival_time is not null and v_arrival_time !~ '^(00|01|02|03|04|05|06|07|08|09|10|11|12|13|14|15|16|17|18|19|20|21|22|23):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Arrival time is invalid';
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
      'arrivalTime', v_existing.arrival_time,
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
    guest_expires_at, access_token_hash, idempotency_key_hash, custom_answers, arrival_time,
    metadata, created_at, creation_time, raw
  ) values (
    v_booking_id, 'customer_booking', v_slug, v_booking_code, v_name, v_phone,
    coalesce(v_email, ''), v_notes, v_booking_date, v_total,
    nullif(trim(p_payload->>'paymentMethod'), ''), 'pending', 'pending',
    v_guest_count, v_table_count, nullif(trim(p_guest_session_id), ''),
    v_expires_at, v_token_hash, v_idempotency_hash,
    coalesce(p_payload->'customAnswers', '{}'::jsonb), v_arrival_time,
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
    'tableCount', v_table_count, 'totalAmount', v_total, 'arrivalTime', v_arrival_time, 'items', v_items,
    'guestExpiresAt', v_expires_at, 'idempotent', false
  );
exception when unique_violation then
  select * into v_existing from pos.booking_orders
    where slug = v_slug and idempotency_key_hash = v_idempotency_hash limit 1;
  if found then
    return jsonb_build_object('bookingId', v_existing.source_id, 'bookingCode', v_existing.booking_code, 'arrivalTime', v_existing.arrival_time, 'idempotent', true);
  end if;
  raise;
end;
$$;


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
    'bookingDate', v_booking.booking_date, 'arrivalTime', v_booking.arrival_time, 'customerName', v_booking.customer_name,
    'guestCount', v_booking.guest_count, 'tableCount', v_booking.table_count,
    'totalAmount', v_booking.total_amount, 'bookingStatus', v_booking.booking_status,
    'paymentStatus', v_booking.payment_status, 'paymentMethod', v_booking.payment_method,
    'items', v_items, 'createdAt', v_booking.created_at,
    'guestExpiresAt', v_booking.guest_expires_at
  );
end;
$$;


notify pgrst, 'reload schema';
