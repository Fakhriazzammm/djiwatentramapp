-- Canonical server-side booking mutations for Admin/POS.
-- Browser clients must call the booking-admin Edge Function; these RPCs are
-- intentionally executable only by service_role.

create or replace function pos.admin_create_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_slug text := nullif(trim(p_payload->>'slug'), '');
  v_date text := nullif(trim(coalesce(p_payload->>'bookingDate', p_payload->>'booking_date')), '');
  v_id text := coalesce(nullif(trim(p_payload->>'sourceId'), ''), 'booking_' || replace(gen_random_uuid()::text, '-', ''));
  v_code text := coalesce(nullif(trim(p_payload->>'bookingCode'), ''), 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
  v_guest_count integer := greatest(1, coalesce((p_payload->>'guestCount')::integer, 1));
  v_people_per_table integer;
  v_max_people integer;
  v_max_tables integer;
  v_table_count integer;
  v_booked_people integer;
  v_booked_tables integer;
  v_now double precision := extract(epoch from now()) * 1000;
  v_item jsonb;
  v_line integer := 0;
begin
  if v_slug is null or v_date is null then
    raise exception using errcode = '22023', message = 'slug and bookingDate are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_slug || ':' || v_date, 0));

  select greatest(1, coalesce(c.people_per_table, s.default_people_per_table)),
         coalesce(c.max_people, s.default_max_people),
         coalesce(c.max_tables, s.default_max_tables)
    into v_people_per_table, v_max_people, v_max_tables
  from pos.booking_settings s
  left join pos.booking_date_capacity c
    on c.slug = s.slug and c.booking_date = v_date
  where s.slug = v_slug;

  if not found then
    raise exception using errcode = 'P0002', message = 'Booking settings not found';
  end if;

  v_table_count := ceil(v_guest_count::numeric / v_people_per_table)::integer;
  select coalesce(sum(guest_count), 0), coalesce(sum(table_count), 0)
    into v_booked_people, v_booked_tables
  from pos.booking_orders
  where slug = v_slug and booking_date = v_date
    and booking_status not in ('cancelled', 'expired', 'no_show');

  if v_max_people > 0 and v_booked_people + v_guest_count > v_max_people then
    raise exception using errcode = 'P0001', message = 'People capacity is full';
  end if;
  if v_max_tables > 0 and v_booked_tables + v_table_count > v_max_tables then
    raise exception using errcode = 'P0001', message = 'Table capacity is full';
  end if;

  insert into pos.booking_orders (
    source_id, slug, booking_code, customer_name, customer_phone, customer_email,
    notes, booking_date, total_amount, payment_method, payment_status,
    booking_status, guest_count, table_count, custom_answers, created_at,
    creation_time, raw, source, metadata
  ) values (
    v_id, v_slug, v_code, coalesce(p_payload->>'customerName', ''),
    coalesce(p_payload->>'customerPhone', ''), coalesce(p_payload->>'customerEmail', ''),
    nullif(p_payload->>'notes', ''), v_date, coalesce((p_payload->>'totalAmount')::numeric, 0),
    p_payload->>'paymentMethod', coalesce(p_payload->>'paymentStatus', 'pending'),
    coalesce(p_payload->>'bookingStatus', 'pending'), v_guest_count, v_table_count,
    p_payload->'customAnswers', v_now, v_now, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_payload->>'source', 'admin_booking'), coalesce(p_payload->'metadata', '{}'::jsonb)
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    v_line := v_line + 1;
    insert into pos.booking_order_items (
      booking_order_source_id, line_no, product_source_id, product_name,
      price, quantity, raw
    ) values (
      v_id, v_line, nullif(v_item->>'productId', ''), v_item->>'name',
      coalesce((v_item->>'price')::numeric, 0), coalesce((v_item->>'quantity')::numeric, 0),
      coalesce(v_item, '{}'::jsonb)
    );
  end loop;

  return jsonb_build_object('bookingId', v_id, 'bookingCode', v_code,
    'bookingStatus', coalesce(p_payload->>'bookingStatus', 'pending'),
    'paymentStatus', coalesce(p_payload->>'paymentStatus', 'pending'),
    'tableCount', v_table_count);
end;
$$;

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
  v_updates jsonb := '{}'::jsonb;
  v_item jsonb;
  v_line integer := 0;
  v_date text;
  v_people_per_table integer;
begin
  if nullif(trim(p_booking_id), '') is null then
    raise exception using errcode = '22023', message = 'Booking id is required';
  end if;
  select * into v_booking from pos.booking_orders where source_id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_booking.slug || ':' || coalesce(p_payload->>'bookingDate', v_booking.booking_date), 0));
  v_date := coalesce(nullif(p_payload->>'bookingDate', ''), v_booking.booking_date);
  select greatest(1, coalesce(c.people_per_table, s.default_people_per_table))
    into v_people_per_table
  from pos.booking_settings s left join pos.booking_date_capacity c
    on c.slug = s.slug and c.booking_date = v_date
  where s.slug = v_booking.slug;

  if p_payload ? 'customerName' then v_updates := v_updates || jsonb_build_object('customer_name', p_payload->>'customerName'); end if;
  if p_payload ? 'customerPhone' then v_updates := v_updates || jsonb_build_object('customer_phone', p_payload->>'customerPhone'); end if;
  if p_payload ? 'customerEmail' then v_updates := v_updates || jsonb_build_object('customer_email', p_payload->>'customerEmail'); end if;
  if p_payload ? 'notes' then v_updates := v_updates || jsonb_build_object('notes', p_payload->>'notes'); end if;
  if p_payload ? 'bookingDate' then v_updates := v_updates || jsonb_build_object('booking_date', v_date); end if;
  if p_payload ? 'guestCount' then
    v_updates := v_updates || jsonb_build_object('guest_count', greatest(1, (p_payload->>'guestCount')::integer));
    v_updates := v_updates || jsonb_build_object('table_count', ceil(greatest(1, (p_payload->>'guestCount')::integer)::numeric / greatest(1, v_people_per_table))::integer);
  end if;
  if p_payload ? 'totalAmount' then v_updates := v_updates || jsonb_build_object('total_amount', greatest(0, (p_payload->>'totalAmount')::numeric)); end if;
  if p_payload ? 'paymentMethod' then v_updates := v_updates || jsonb_build_object('payment_method', p_payload->>'paymentMethod'); end if;
  if v_updates <> '{}'::jsonb then
    update pos.booking_orders set
      customer_name = coalesce(v_updates->>'customer_name', customer_name),
      customer_phone = coalesce(v_updates->>'customer_phone', customer_phone),
      customer_email = coalesce(v_updates->>'customer_email', customer_email),
      notes = case when v_updates ? 'notes' then v_updates->>'notes' else notes end,
      booking_date = coalesce(v_updates->>'booking_date', booking_date),
      guest_count = coalesce((v_updates->>'guest_count')::integer, guest_count),
      table_count = coalesce((v_updates->>'table_count')::integer, table_count),
      total_amount = coalesce((v_updates->>'total_amount')::numeric, total_amount),
      payment_method = case when v_updates ? 'payment_method' then v_updates->>'payment_method' else payment_method end,
      raw = coalesce(raw, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb)
    where source_id = p_booking_id;
  end if;

  if p_items is not null then
    delete from pos.booking_order_items where booking_order_source_id = p_booking_id;
    for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      v_line := v_line + 1;
      insert into pos.booking_order_items (booking_order_source_id,line_no,product_source_id,product_name,price,quantity,raw)
      values (p_booking_id,v_line,nullif(v_item->>'productId',''),v_item->>'name',coalesce((v_item->>'price')::numeric,0),coalesce((v_item->>'quantity')::numeric,0),coalesce(v_item,'{}'::jsonb));
    end loop;
  end if;

  update pos.financial_transactions set
    amount = case when p_payload ? 'totalAmount' then greatest(0, (p_payload->>'totalAmount')::numeric) else amount end,
    description = case when p_payload ? 'customerName' or p_payload ? 'bookingDate'
      then format('Booking #%s - %s (%s)', v_booking.booking_code, coalesce(p_payload->>'customerName', v_booking.customer_name), coalesce(p_payload->>'bookingDate', v_booking.booking_date))
      else description end
  where booking_order_source_id = p_booking_id;

  return jsonb_build_object('bookingId', p_booking_id, 'updated', true);
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
  v_now double precision := coalesce(p_payment_date, extract(epoch from now()) * 1000);
  v_fin_id text := 'booking_fin_' || p_booking_id;
begin
  select * into v_booking from pos.booking_orders where source_id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Booking not found'; end if;

  if p_payment_status = 'paid' then
    insert into pos.financial_transactions (
      source_id, tx_type, amount, category, description, tx_date, payment_method,
      status, booking_order_source_id, creation_time, raw
    ) values (
      v_fin_id, 'income', v_booking.total_amount, 'Booking',
      format('Booking #%s - %s (%s)', v_booking.booking_code, v_booking.customer_name, v_booking.booking_date),
      v_now, v_booking.payment_method, 'completed', p_booking_id, v_now,
      jsonb_build_object('kind','booking_payment_confirmation','bookingOrderId',p_booking_id)
    ) on conflict (source_id) do nothing;
    update pos.booking_orders set payment_status='paid', booking_status=coalesce(p_booking_status,'confirmed'), payment_paid_at=v_now, confirmed_at=coalesce(confirmed_at,v_now) where source_id=p_booking_id;
  else
    update pos.booking_orders set booking_status=coalesce(p_booking_status, booking_status), payment_status=coalesce(p_payment_status, payment_status) where source_id=p_booking_id;
  end if;
  return jsonb_build_object('bookingId',p_booking_id,'updated',true);
end;
$$;

create or replace function pos.admin_delete_booking(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
begin
  if not exists (select 1 from pos.booking_orders where source_id = p_booking_id) then
    raise exception using errcode='P0002',message='Booking not found';
  end if;
  if exists (select 1 from pos.financial_transactions where booking_order_source_id = p_booking_id) then
    update pos.booking_orders set booking_status='cancelled', cancelled_at=extract(epoch from now())*1000, cancellation_reason='Cancelled from Admin' where source_id=p_booking_id;
    return jsonb_build_object('bookingId',p_booking_id,'cancelled',true,'deleted',false);
  end if;
  delete from pos.booking_order_items where booking_order_source_id=p_booking_id;
  delete from pos.booking_orders where source_id=p_booking_id;
  return jsonb_build_object('bookingId',p_booking_id,'cancelled',false,'deleted',true);
end;
$$;

create or replace function pos.admin_upsert_booking_settings(p_payload jsonb)
returns text
language plpgsql security definer set search_path=pos,public,pg_catalog
as $$
declare v_id text; v_slug text := nullif(trim(p_payload->>'slug'),'');
begin
  if v_slug is null then raise exception using errcode='22023',message='slug is required'; end if;
  select source_id into v_id from pos.booking_settings where slug=v_slug for update;
  if v_id is null then v_id := 'booking_settings_' || replace(gen_random_uuid()::text,'-',''); end if;
  insert into pos.booking_settings(source_id,slug,title,description,logo_url,banner_url,theme_color,social_links,featured_product_ids,payment_methods,bank_details,qris_image,is_active,booking_window_days,default_max_people,default_max_tables,default_people_per_table,custom_fields,creation_time,raw)
  values(v_id,v_slug,coalesce(p_payload->>'title',''),p_payload->>'description',p_payload->>'logoUrl',p_payload->>'bannerUrl',p_payload->>'themeColor',p_payload->'socialLinks',p_payload->'featuredProductIds',p_payload->'paymentMethods',p_payload->>'bankDetails',p_payload->>'qrisImage',coalesce((p_payload->>'isActive')::boolean,false),greatest(1,coalesce((p_payload->>'bookingWindowDays')::integer,90)),greatest(0,coalesce((p_payload->>'defaultMaxPeople')::integer,100)),greatest(0,coalesce((p_payload->>'defaultMaxTables')::integer,25)),greatest(1,coalesce((p_payload->>'defaultPeoplePerTable')::integer,4)),p_payload->'customFields',extract(epoch from now())*1000,coalesce(p_payload,'{}'::jsonb))
  on conflict(source_id) do update set title=excluded.title,description=excluded.description,logo_url=excluded.logo_url,banner_url=excluded.banner_url,theme_color=excluded.theme_color,social_links=excluded.social_links,featured_product_ids=excluded.featured_product_ids,payment_methods=excluded.payment_methods,bank_details=excluded.bank_details,qris_image=excluded.qris_image,is_active=excluded.is_active,booking_window_days=excluded.booking_window_days,default_max_people=excluded.default_max_people,default_max_tables=excluded.default_max_tables,default_people_per_table=excluded.default_people_per_table,custom_fields=excluded.custom_fields,raw=excluded.raw;
  return v_id;
end; $$;

create or replace function pos.admin_upsert_booking_capacity(p_payload jsonb)
returns text
language plpgsql security definer set search_path=pos,public,pg_catalog
as $$
declare v_id text := 'booking_cap_' || replace(gen_random_uuid()::text,'-',''); v_slug text := nullif(trim(p_payload->>'slug'),''); v_date text := nullif(trim(coalesce(p_payload->>'date',p_payload->>'bookingDate')),'');
begin
  if v_slug is null or v_date is null then raise exception using errcode='22023',message='slug and date are required'; end if;
  insert into pos.booking_date_capacity(source_id,slug,booking_date,max_people,max_tables,people_per_table,is_closed,notes,creation_time,raw)
  values(v_id,v_slug,v_date,greatest(0,coalesce((p_payload->>'maxPeople')::integer,0)),greatest(0,coalesce((p_payload->>'maxTables')::integer,0)),greatest(1,coalesce((p_payload->>'peoplePerTable')::integer,4)),coalesce((p_payload->>'isClosed')::boolean,false),p_payload->>'notes',extract(epoch from now())*1000,coalesce(p_payload,'{}'::jsonb))
  on conflict(slug,booking_date) do update set max_people=excluded.max_people,max_tables=excluded.max_tables,people_per_table=excluded.people_per_table,is_closed=excluded.is_closed,notes=excluded.notes,raw=excluded.raw;
  select source_id into v_id from pos.booking_date_capacity where slug=v_slug and booking_date=v_date;
  return v_id;
end; $$;

create or replace function pos.admin_upsert_booking_bulk_capacity(p_payload jsonb)
returns integer
language plpgsql security definer set search_path=pos,public,pg_catalog
as $$
declare
  v_date date := (p_payload->>'startDate')::date;
  v_end date := (p_payload->>'endDate')::date;
  v_count integer := 0;
  v_row jsonb := p_payload;
begin
  if nullif(trim(p_payload->>'slug'),'') is null or v_date is null or v_end is null or v_end < v_date then
    raise exception using errcode='22023',message='Invalid booking capacity date range';
  end if;
  if v_end - v_date > 366 then raise exception using errcode='22023',message='Date range cannot exceed 1 year'; end if;
  while v_date <= v_end loop
    v_row := p_payload || jsonb_build_object('date', v_date::text);
    perform pos.admin_upsert_booking_capacity(v_row);
    v_count := v_count + 1;
    v_date := v_date + 1;
  end loop;
  return v_count;
end; $$;

revoke all on function pos.admin_upsert_booking_bulk_capacity(jsonb) from public, anon, authenticated;
grant execute on function pos.admin_upsert_booking_bulk_capacity(jsonb) to service_role;

revoke all on function pos.admin_create_booking(jsonb) from public, anon, authenticated;
revoke all on function pos.admin_update_booking(text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function pos.admin_update_booking_status(text,text,text,double precision) from public, anon, authenticated;
revoke all on function pos.admin_delete_booking(text) from public, anon, authenticated;
revoke all on function pos.admin_upsert_booking_settings(jsonb) from public, anon, authenticated;
revoke all on function pos.admin_upsert_booking_capacity(jsonb) from public, anon, authenticated;
grant execute on function pos.admin_create_booking(jsonb) to service_role;
grant execute on function pos.admin_update_booking(text,jsonb,jsonb) to service_role;
grant execute on function pos.admin_update_booking_status(text,text,text,double precision) to service_role;
grant execute on function pos.admin_delete_booking(text) to service_role;
grant execute on function pos.admin_upsert_booking_settings(jsonb) to service_role;
grant execute on function pos.admin_upsert_booking_capacity(jsonb) to service_role;

-- Direct browser writes are no longer part of the booking contract.
revoke all on pos.booking_settings from anon;
revoke all on pos.booking_date_capacity from anon;
revoke all on pos.booking_orders from anon;
revoke all on pos.booking_order_items from anon;
revoke all on pos.financial_transactions from anon;

drop policy if exists anon_all_booking_date_capacity on pos.booking_date_capacity;
drop policy if exists anon_all_booking_settings on pos.booking_settings;
drop policy if exists anon_all_financial_transactions on pos.financial_transactions;
