-- Server-authoritative Mayar preparation for public booking.
-- The claim prevents concurrent browser retries from creating duplicate invoices.

alter table pos.booking_orders
  add column if not exists payment_claim_id text,
  add column if not exists payment_claimed_at double precision;

create index if not exists idx_booking_orders_payment_claim
  on pos.booking_orders (payment_claim_id, payment_claimed_at)
  where payment_claim_id is not null;

create or replace function public.prepare_public_booking_payment(
  p_slug text,
  p_booking_code text,
  p_access_token text,
  p_claim_id text,
  p_payment_gateway jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pos, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_token_hash text := encode(extensions.digest(coalesce(p_access_token, ''), 'sha256'::text), 'hex');
  v_now double precision := extract(epoch from now()) * 1000;
  v_gateway jsonb;
  v_items jsonb;
  v_claimed boolean := false;
  v_in_progress boolean := false;
begin
  if nullif(trim(p_slug), '') is null
     or nullif(trim(p_booking_code), '') is null
     or coalesce(trim(p_access_token), '') = ''
     or nullif(trim(p_claim_id), '') is null then
    raise exception using errcode = '22023', message = 'Payment claim data is incomplete';
  end if;

  select * into v_booking
  from pos.booking_orders
  where slug = trim(p_slug)
    and booking_code = trim(p_booking_code)
    and access_token_hash = v_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;
  if v_booking.booking_status in ('cancelled', 'expired', 'no_show')
     or (v_booking.booking_status = 'pending' and v_booking.guest_expires_at is not null and v_booking.guest_expires_at <= v_now) then
    raise exception using errcode = 'P0001', message = 'Booking is no longer payable';
  end if;

  v_gateway := coalesce(v_booking.payment_gateway, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
    'productId', product_source_id,
    'name', product_name,
    'price', price,
    'quantity', quantity
  ) order by line_no), '[]'::jsonb)
  into v_items
  from pos.booking_order_items
  where booking_order_source_id = v_booking.source_id
    and quantity > 0;

  if v_booking.payment_status = 'paid' then
    return jsonb_build_object(
      'bookingId', v_booking.source_id,
      'bookingCode', v_booking.booking_code,
      'customerName', v_booking.customer_name,
      'customerEmail', v_booking.customer_email,
      'customerPhone', v_booking.customer_phone,
      'bookingDate', v_booking.booking_date,
      'guestExpiresAt', v_booking.guest_expires_at,
      'bookingStatus', v_booking.booking_status,
      'paymentStatus', v_booking.payment_status,
      'totalAmount', v_booking.total_amount,
      'items', v_items,
      'paymentGateway', v_gateway,
      'claimed', false,
      'paymentInProgress', false
    );
  end if;

  if p_payment_gateway is not null then
    if jsonb_typeof(p_payment_gateway) <> 'object'
       or coalesce(p_payment_gateway->>'provider', '') <> 'mayar'
       or coalesce(p_payment_gateway->>'invoiceId', '') = ''
       or coalesce(p_payment_gateway->>'invoiceUrl', '') = '' then
      raise exception using errcode = '22023', message = 'Payment gateway data is incomplete';
    end if;
    v_gateway := p_payment_gateway;
    update pos.booking_orders
    set payment_method = 'mayar',
        payment_status = 'pending',
        payment_receipt_kind = 'gateway_pending',
        payment_gateway = v_gateway,
        payment_claim_id = null,
        payment_claimed_at = null
    where source_id = v_booking.source_id;
  elsif coalesce(v_gateway->>'invoiceId', '') = '' or coalesce(v_gateway->>'invoiceUrl', '') = '' then
    if v_booking.payment_claim_id is not null
       and v_booking.payment_claimed_at is not null
       and v_booking.payment_claimed_at > v_now - 15 * 60 * 1000
       and v_booking.payment_claim_id <> trim(p_claim_id) then
      v_in_progress := true;
    else
      update pos.booking_orders
      set payment_claim_id = trim(p_claim_id),
          payment_claimed_at = v_now,
          payment_method = 'mayar',
          payment_status = 'pending',
          payment_receipt_kind = 'gateway_pending'
      where source_id = v_booking.source_id;
      v_claimed := true;
    end if;
  end if;

  return jsonb_build_object(
    'bookingId', v_booking.source_id,
    'bookingCode', v_booking.booking_code,
    'customerName', v_booking.customer_name,
    'customerEmail', v_booking.customer_email,
    'customerPhone', v_booking.customer_phone,
    'bookingDate', v_booking.booking_date,
    'guestExpiresAt', v_booking.guest_expires_at,
    'bookingStatus', v_booking.booking_status,
    'paymentStatus', v_booking.payment_status,
    'totalAmount', v_booking.total_amount,
    'items', v_items,
    'paymentGateway', v_gateway,
    'claimed', v_claimed,
    'paymentInProgress', v_in_progress
  );
end;
$$;

revoke all on function public.prepare_public_booking_payment(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_public_booking_payment(text, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
