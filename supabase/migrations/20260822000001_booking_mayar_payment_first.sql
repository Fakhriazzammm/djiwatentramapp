-- Payment-first booking contract.
-- A booking remains pending until the verified Mayar webhook settles it.
-- The pending row holds capacity for a short window; no booking is confirmed
-- from a browser redirect or an unverified provider payload.

alter table pos.booking_orders
  add column if not exists payment_gateway jsonb not null default '{}'::jsonb,
  add column if not exists payment_receipt_kind text,
  add column if not exists payment_paid_at double precision;

create index if not exists idx_booking_orders_gateway_invoice_id
  on pos.booking_orders ((payment_gateway->>'invoiceId'))
  where payment_gateway->>'invoiceId' is not null;

create or replace function public.attach_public_booking_payment(
  p_slug text,
  p_booking_code text,
  p_access_token text,
  p_payment_gateway jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pos, pg_catalog
as $$
declare
  v_booking pos.booking_orders%rowtype;
  v_token_hash text := encode(extensions.digest(coalesce(p_access_token, ''), 'sha256'::text), 'hex');
  v_gateway jsonb := coalesce(p_payment_gateway, '{}'::jsonb);
begin
  if nullif(trim(p_slug), '') is null
     or nullif(trim(p_booking_code), '') is null
     or coalesce(trim(p_access_token), '') = ''
     or coalesce(v_gateway->>'provider', '') <> 'mayar'
     or coalesce(v_gateway->>'invoiceId', '') = ''
     or coalesce(v_gateway->>'invoiceUrl', '') = '' then
    raise exception using errcode = '22023', message = 'Payment gateway data is incomplete';
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
  if v_booking.booking_status in ('cancelled', 'expired', 'no_show') then
    raise exception using errcode = 'P0001', message = 'Booking is no longer payable';
  end if;
  if v_booking.payment_status = 'paid' then
    return jsonb_build_object(
      'bookingId', v_booking.source_id,
      'bookingCode', v_booking.booking_code,
      'bookingStatus', v_booking.booking_status,
      'paymentStatus', v_booking.payment_status,
      'paymentGateway', v_booking.payment_gateway,
      'idempotent', true
    );
  end if;

  update pos.booking_orders
  set payment_method = 'mayar',
      payment_status = 'pending',
      payment_receipt_kind = 'gateway_pending',
      payment_gateway = v_gateway,
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('paymentFirst', true)
  where source_id = v_booking.source_id;

  return jsonb_build_object(
    'bookingId', v_booking.source_id,
    'bookingCode', v_booking.booking_code,
    'bookingStatus', 'pending',
    'paymentStatus', 'pending',
    'paymentGateway', v_gateway,
    'idempotent', false
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
begin
  if nullif(trim(p_booking_id), '') is null
     or nullif(trim(p_transaction_id), '') is null then
    raise exception using errcode = '22023', message = 'Payment settlement data is incomplete';
  end if;

  select * into v_booking
  from pos.booking_orders
  where source_id = trim(p_booking_id)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found';
  end if;

  v_gateway := coalesce(v_booking.payment_gateway, '{}'::jsonb)
    || jsonb_build_object(
      'provider', 'mayar',
      'invoiceId', coalesce(nullif(trim(p_invoice_id), ''), v_booking.payment_gateway->>'invoiceId'),
      'transactionId', trim(p_transaction_id),
      'status', 'paid',
      'paidAt', v_paid_at
    );

  update pos.booking_orders
  set payment_method = 'mayar',
      payment_status = 'paid',
      booking_status = 'confirmed',
      payment_receipt_kind = 'gateway_paid',
      payment_gateway = v_gateway,
      payment_paid_at = v_paid_at,
      confirmed_at = coalesce(confirmed_at, v_paid_at)
  where source_id = v_booking.source_id;

  return jsonb_build_object(
    'bookingId', v_booking.source_id,
    'bookingCode', v_booking.booking_code,
    'bookingStatus', 'confirmed',
    'paymentStatus', 'paid',
    'paymentGateway', v_gateway,
    'idempotent', v_booking.payment_status = 'paid'
  );
end;
$$;

revoke all on function public.attach_public_booking_payment(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.settle_public_booking_payment(text, text, text, double precision) from public, anon, authenticated;
grant execute on function public.attach_public_booking_payment(text, text, text, jsonb) to service_role;
grant execute on function public.settle_public_booking_payment(text, text, text, double precision) to service_role;

notify pgrst, 'reload schema';
