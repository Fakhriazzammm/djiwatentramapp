-- Booking -> POS atomic settlement.
-- Additive: preserves booking history and creates exactly one operational POS order
-- after verified payment settlement.

alter table pos.orders
  add column if not exists booking_source_id text,
  add column if not exists booking_code text,
  add column if not exists booking_date text,
  add column if not exists booking_type_key text,
  add column if not exists booking_type_label text,
  add column if not exists event_type_key text,
  add column if not exists event_type_label text,
  add column if not exists event_type_other text;

create unique index if not exists ux_pos_orders_booking_source_id
  on pos.orders (booking_source_id)
  where source = 'booking' and booking_source_id is not null;

create or replace view public.pos_orders as
  select o.source_id as "_id",
    coalesce(o.creation_time, o.created_at) as "_creationTime",
    o.order_number as "orderNumber",
    o.total_amount as "totalAmount",
    o.status,
    o.payment_method as "paymentMethod",
    o.customer_name as "customerName",
    o.customer_email as "customerEmail",
    o.table_number as "tableNumber",
    o.order_type as "orderType",
    o.source,
    o.brand_slug as "brandSlug",
    o.business_unit as "businessUnit",
    o.source_app as "sourceApp",
    o.guest_count as "guestCount",
    o.free_refill_selected as "freeRefillSelected",
    o.dessert_later as "dessertLater",
    o.notes,
    o.created_at as "createdAt",
    o.voucher_source_id as "voucherId",
    o.discount_amount as "discountAmount",
    o.tax_amount as "taxAmount",
    o.service_charge_amount as "serviceChargeAmount",
    o.receipt_meta as "receiptMeta",
    o.payment_receipt_kind as "paymentReceiptKind",
    o.payment_gateway as "paymentGateway",
    o.gateway_invoice_id as "gatewayInvoiceId",
    o.auth_user_id as "authUserId",
    o.daily_receipt_no,
    o.receipt_kind,
    o.customer_source_id as "customerSourceId",
    o.delivery_date as "deliveryDate",
    o.delivery_provider as "deliveryProvider",
    o.delivery_status as "deliveryStatus",
    o.delivery_contact_name as "deliveryContactName",
    o.delivery_contact_phone as "deliveryContactPhone",
    o.delivery_address as "deliveryAddress",
    o.delivery_notes as "deliveryNotes",
    coalesce(oi_items.items, '[]'::jsonb) as items,
    o.booking_source_id as "bookingSourceId",
    o.booking_code as "bookingCode",
    o.booking_date as "bookingDate",
    o.booking_type_key as "bookingTypeKey",
    o.booking_type_label as "bookingTypeLabel",
    o.event_type_key as "eventTypeKey",
    o.event_type_label as "eventTypeLabel",
    o.event_type_other as "eventTypeOther"
  from pos.orders o
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'productId', oi.product_source_id,
      'productName', oi.product_name,
      'variant', oi.variant,
      'quantity', oi.quantity,
      'price', oi.price,
      'originalPrice', oi.original_price,
      'status', oi.status,
      'hppSnapshot', oi.hpp_snapshot
    ) order by oi.line_no) as items
    from pos.order_items oi
    where oi.order_source_id = o.source_id
  ) oi_items on true;

grant select on public.pos_orders to anon, authenticated, service_role;

grant usage on schema pos to service_role;
grant select, insert, update on pos.orders to service_role;
grant select, insert, update on pos.order_items to service_role;
grant select, insert, update on pos.order_status to service_role;
grant select, insert, update on pos.financial_transactions to service_role;

create or replace function pos.settle_booking_to_pos(
  p_booking_id text,
  p_paid_at double precision,
  p_payment_gateway jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_existing pos.orders%rowtype;
  v_pos_id text := 'booking_pos_' || trim(p_booking_id);
  v_order_number text;
  v_gateway jsonb := coalesce(p_payment_gateway, '{}'::jsonb);
  v_now double precision := extract(epoch from now()) * 1000;
  v_paid_at double precision := coalesce(p_paid_at, v_now);
  v_booking_type_key text;
  v_booking_type_label text;
  v_event_type_key text;
  v_event_type_label text;
  v_event_type_other text;
  v_item record;
  v_line integer := 0;
  v_bar_items jsonb := '[]'::jsonb;
  v_kitchen_items jsonb := '[]'::jsonb;
  v_track text;
  v_item_json jsonb;
begin
  if nullif(trim(p_booking_id), '') is null then
    raise exception using errcode = '22023', message = 'Booking ID is required';
  end if;

  select * into v_booking
  from pos.booking_orders
  where source_id = trim(p_booking_id)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  select * into v_existing
  from pos.orders
  where source = 'booking' and booking_source_id = v_booking.source_id
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'idempotent', true,
      'posOrderId', v_existing.source_id,
      'orderNumber', v_existing.order_number,
      'bookingId', v_booking.source_id,
      'bookingCode', v_booking.booking_code
    );
  end if;

  if v_booking.payment_status <> 'paid'
     or v_booking.booking_status in ('cancelled', 'expired', 'no_show') then
    raise exception using errcode = 'P0001', message = 'Booking is not eligible for POS settlement';
  end if;

  v_booking_type_key := nullif(trim(coalesce(v_booking.custom_answers->>'Tipe booking', v_booking.custom_answers->>'bookingType')), '');
  v_booking_type_label := nullif(trim(coalesce(v_booking.custom_answers->>'Tipe booking label', v_booking.custom_answers->>'bookingTypeLabel')), '');
  v_event_type_key := nullif(trim(coalesce(v_booking.custom_answers->>'Jenis acara', v_booking.custom_answers->>'eventType')), '');
  v_event_type_label := nullif(trim(coalesce(v_booking.custom_answers->>'Jenis acara label', v_booking.custom_answers->>'eventTypeLabel')), '');
  v_event_type_other := nullif(trim(coalesce(v_booking.custom_answers->>'Jenis acara lainnya', v_booking.custom_answers->>'eventTypeOther')), '');
  v_order_number := 'BKO-' || upper(v_booking.booking_code);

  insert into pos.orders (
    source_id, order_number, total_amount, status, payment_method,
    customer_name, customer_email, order_type, source, brand_slug,
    guest_count, notes, payment_receipt_kind, payment_gateway,
    gateway_invoice_id, creation_time, created_at, raw,
    booking_source_id, booking_code, booking_date,
    booking_type_key, booking_type_label, event_type_key,
    event_type_label, event_type_other, receipt_kind
  ) values (
    v_pos_id, v_order_number, v_booking.total_amount, 'paid', 'mayar',
    v_booking.customer_name, v_booking.customer_email, 'booking', 'booking', v_booking.slug,
    v_booking.guest_count,
    concat_ws(E'\n',
      nullif(v_booking.notes, ''),
      'Booking: ' || v_booking.booking_code,
      'Tanggal: ' || v_booking.booking_date,
      'Tamu: ' || coalesce(v_booking.guest_count::text, '-'),
      'Meja: ' || coalesce(v_booking.table_count::text, '-'),
      case when v_event_type_label is not null then 'Event: ' || v_event_type_label else null end,
      case when v_event_type_other is not null then 'Detail event: ' || v_event_type_other else null end
    ),
    'gateway_paid',
    v_gateway || jsonb_build_object('provider', 'mayar', 'status', 'paid', 'paidAt', v_paid_at),
    nullif(v_gateway->>'invoiceId', ''), v_paid_at, v_paid_at,
    jsonb_build_object(
      'source', 'booking',
      'bookingSourceId', v_booking.source_id,
      'bookingCode', v_booking.booking_code,
      'bookingDate', v_booking.booking_date,
      'guestCount', v_booking.guest_count,
      'tableCount', v_booking.table_count,
      'bookingType', jsonb_build_object('key', v_booking_type_key, 'label', v_booking_type_label),
      'eventType', jsonb_build_object('key', v_event_type_key, 'label', v_event_type_label, 'other', v_event_type_other),
      'customAnswers', coalesce(v_booking.custom_answers, '{}'::jsonb),
      'paymentGateway', v_gateway
    ),
    v_booking.source_id, v_booking.booking_code, v_booking.booking_date,
    v_booking_type_key, v_booking_type_label, v_event_type_key,
    v_event_type_label, v_event_type_other, 'online'
  );

  for v_item in
    select boi.*, p.category_source_id, c.track
    from pos.booking_order_items boi
    left join pos.products p on p.source_id = boi.product_source_id
    left join pos.categories c on c.source_id = p.category_source_id
    where boi.booking_order_source_id = v_booking.source_id
    order by boi.line_no
  loop
    v_line := v_line + 1;
    v_track := lower(coalesce(v_item.track, ''));
    v_item_json := jsonb_build_object(
      'productId', v_item.product_source_id,
      'productName', v_item.product_name,
      'quantity', v_item.quantity,
      'price', v_item.price,
      'track', case when v_track ~ '(bar|beverage|drink|minum)' then 'barista' else 'kitchen' end
    );

    insert into pos.order_items (
      order_source_id, line_no, product_source_id, product_name,
      quantity, price, original_price, status, raw
    ) values (
      v_pos_id, v_line, v_item.product_source_id, v_item.product_name,
      v_item.quantity, v_item.price, v_item.price, 'new',
      coalesce(v_item.raw, '{}'::jsonb) || v_item_json
    );

    if v_track ~ '(bar|beverage|drink|minum)' then
      v_bar_items := v_bar_items || jsonb_build_array(v_item_json);
    else
      v_kitchen_items := v_kitchen_items || jsonb_build_array(v_item_json);
    end if;
  end loop;

  if v_line = 0 then
    raise exception using errcode = 'P0001', message = 'Booking has no menu items';
  end if;

  if jsonb_array_length(v_bar_items) > 0 then
    insert into pos.order_status (order_no, group_type, status, order_type, customer_name, items, struk_line, created_at, updated_at)
    values (v_order_number, 'barista', 'dibuat', 'booking', v_booking.customer_name, v_bar_items, 'BOOKING ' || v_booking.booking_code, now(), now());
  end if;
  if jsonb_array_length(v_kitchen_items) > 0 then
    insert into pos.order_status (order_no, group_type, status, order_type, customer_name, items, struk_line, created_at, updated_at)
    values (v_order_number, 'kitchen', 'dibuat', 'booking', v_booking.customer_name, v_kitchen_items, 'BOOKING ' || v_booking.booking_code, now(), now());
  end if;

  if not exists (select 1 from pos.financial_transactions where order_source_id = v_pos_id) then
    insert into pos.financial_transactions (
      source_id, tx_type, amount, category, description, merchant,
      tx_date, payment_method, status, order_source_id,
      booking_order_source_id, business_unit, source_app, metadata, raw, creation_time
    ) values (
      'fin_booking_' || v_booking.source_id, 'income', v_booking.total_amount,
      'Penjualan', 'Penjualan Booking #' || v_booking.booking_code,
      v_booking.customer_name, v_paid_at, 'mayar', 'completed', v_pos_id,
      v_booking.source_id, 'booking', 'booking',
      jsonb_build_object('source', 'booking', 'bookingCode', v_booking.booking_code, 'paymentGateway', v_gateway),
      jsonb_build_object('kind', 'booking_settlement', 'bookingId', v_booking.source_id, 'posOrderId', v_pos_id), v_now
    );
  end if;

  return jsonb_build_object(
    'created', true,
    'idempotent', false,
    'posOrderId', v_pos_id,
    'orderNumber', v_order_number,
    'bookingId', v_booking.source_id,
    'bookingCode', v_booking.booking_code,
    'barItems', jsonb_array_length(v_bar_items),
    'kitchenItems', jsonb_array_length(v_kitchen_items)
  );
end;
$$;

create or replace function public.settle_public_booking_payment(
  p_booking_id text,
  p_invoice_id text,
  p_transaction_id text,
  p_paid_at double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pos, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_paid_at double precision := coalesce(p_paid_at, extract(epoch from now()) * 1000);
  v_gateway jsonb;
  v_pos jsonb;
begin
  if nullif(trim(p_booking_id), '') is null or nullif(trim(p_transaction_id), '') is null then
    raise exception using errcode = '22023', message = 'Payment settlement data is incomplete';
  end if;

  select * into v_booking from pos.booking_orders where source_id = trim(p_booking_id) for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found'; end if;

  v_gateway := coalesce(v_booking.payment_gateway, '{}'::jsonb) || jsonb_build_object(
    'provider', 'mayar',
    'invoiceId', coalesce(nullif(trim(p_invoice_id), ''), v_booking.payment_gateway->>'invoiceId'),
    'transactionId', trim(p_transaction_id),
    'status', 'paid',
    'paidAt', v_paid_at
  );

  update pos.booking_orders set
    payment_method = 'mayar', payment_status = 'paid', booking_status = 'confirmed',
    payment_receipt_kind = 'gateway_paid', payment_gateway = v_gateway,
    payment_paid_at = v_paid_at, confirmed_at = coalesce(confirmed_at, v_paid_at)
  where source_id = v_booking.source_id;

  v_pos := pos.settle_booking_to_pos(v_booking.source_id, v_paid_at, v_gateway);

  return jsonb_build_object(
    'bookingId', v_booking.source_id, 'bookingCode', v_booking.booking_code,
    'bookingStatus', 'confirmed', 'paymentStatus', 'paid',
    'paymentGateway', v_gateway, 'pos', v_pos,
    'idempotent', v_booking.payment_status = 'paid'
  );
end;
$$;

revoke all on function pos.settle_booking_to_pos(text, double precision, jsonb) from public, anon, authenticated;
revoke all on function public.settle_public_booking_payment(text, text, text, double precision) from public, anon, authenticated;
grant execute on function pos.settle_booking_to_pos(text, double precision, jsonb) to service_role;
grant execute on function public.settle_public_booking_payment(text, text, text, double precision) to service_role;

notify pgrst, 'reload schema';
