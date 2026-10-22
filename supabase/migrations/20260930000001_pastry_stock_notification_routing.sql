-- Route Fudgy Brownies and Banana Bread availability notifications to the pastry supplier group.
-- Additive only; existing general stock notifications remain unchanged for non-pastry categories.

alter table pos.product_availability_events
  add column if not exists category_source_id text,
  add column if not exists category_name_snapshot text;

alter table pos.shift_product_availability_snapshots
  add column if not exists category_source_id text,
  add column if not exists category_name_snapshot text;

create or replace function pos.update_product_availability_with_event(
  p_product_source_id text,
  p_new_is_available boolean,
  p_changed_by_user_id text default null,
  p_changed_by_name text default null,
  p_shift_source_id text default null,
  p_source text default 'pos_menu_stock',
  p_source_action_id text default null
)
returns table (
  product_source_id text,
  changed boolean,
  previous_is_available boolean,
  new_is_available boolean,
  event_id bigint
)
language plpgsql security definer set search_path = pos, public
as $$
declare
  product_row pos.products%rowtype;
  category_name_value text;
  event_key text;
  created_event_id bigint;
begin
  select * into product_row from pos.products where source_id = p_product_source_id for update;
  if not found then raise exception 'Produk tidak ditemukan: %', p_product_source_id; end if;

  if product_row.is_available = p_new_is_available then
    return query select product_row.source_id, false, product_row.is_available, product_row.is_available, null::bigint;
    return;
  end if;

  select c.name into category_name_value
  from pos.categories c
  where c.source_id = product_row.category_source_id;

  update pos.products
  set is_available = p_new_is_available,
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
        'lastAvailabilityChangedAt', extract(epoch from clock_timestamp()) * 1000,
        'lastAvailabilityChangedBy', p_changed_by_user_id
      )
  where source_id = product_row.source_id;

  event_key := coalesce(
    nullif(trim(p_source_action_id), '') || ':' || product_row.source_id || ':' || p_new_is_available::text,
    'availability:' || product_row.source_id || ':' || extract(epoch from clock_timestamp())::text || ':' || p_new_is_available::text
  );

  insert into pos.product_availability_events (
    dedupe_key, product_source_id, product_name_snapshot, menu_number_snapshot,
    category_source_id, category_name_snapshot, previous_is_available, new_is_available,
    quantity_snapshot, source, source_action_id, changed_by_user_id,
    changed_by_name_snapshot, shift_source_id, changed_at
  ) values (
    event_key, product_row.source_id, product_row.name, product_row.menu_number,
    product_row.category_source_id, category_name_value, product_row.is_available, p_new_is_available,
    product_row.quantity, coalesce(nullif(trim(p_source), ''), 'pos_menu_stock'),
    p_source_action_id, p_changed_by_user_id, p_changed_by_name, p_shift_source_id,
    extract(epoch from clock_timestamp()) * 1000
  ) on conflict (dedupe_key) do nothing
  returning product_availability_events.event_id into created_event_id;

  return query select product_row.source_id, true, product_row.is_available, p_new_is_available, created_event_id;
end;
$$;

drop function if exists pos.capture_shift_product_availability_snapshot(text, text, text, double precision);

create function pos.capture_shift_product_availability_snapshot(
  p_shift_source_id text,
  p_phase text,
  p_captured_by_user_id text default null,
  p_captured_at double precision default null
)
returns table (
  shift_source_id text,
  phase text,
  total_products integer,
  on_products integer,
  off_products integer,
  snapshot_id_min bigint,
  snapshot_id_max bigint
)
language plpgsql security definer set search_path = pos, public
as $$
declare
  capture_time double precision := coalesce(p_captured_at, extract(epoch from clock_timestamp()) * 1000);
  min_id bigint;
  max_id bigint;
begin
  if p_shift_source_id is null or trim(p_shift_source_id) = '' then raise exception 'shift_source_id wajib diisi'; end if;
  if p_phase not in ('opening', 'closing') then raise exception 'phase harus opening atau closing'; end if;

  insert into pos.shift_product_availability_snapshots (
    shift_source_id, phase, product_source_id, product_name_snapshot, menu_number_snapshot,
    category_source_id, category_name_snapshot, is_available, quantity_snapshot,
    captured_at, captured_by_user_id
  )
  select p_shift_source_id, p_phase, p.source_id, p.name, p.menu_number,
    p.category_source_id, c.name, p.is_available, p.quantity, capture_time, p_captured_by_user_id
  from pos.products p
  left join pos.categories c on c.source_id = p.category_source_id
  on conflict (shift_source_id, phase, product_source_id) do nothing;

  select min(snapshot_id), max(snapshot_id) into min_id, max_id
  from pos.shift_product_availability_snapshots
  where shift_source_id = p_shift_source_id and phase = p_phase;

  return query select p_shift_source_id, p_phase, count(*)::integer,
    count(*) filter (where is_available)::integer,
    count(*) filter (where not is_available)::integer, min_id, max_id
  from pos.shift_product_availability_snapshots
  where shift_source_id = p_shift_source_id and phase = p_phase;
end;
$$;

grant execute on function pos.update_product_availability_with_event(text, boolean, text, text, text, text, text) to anon, authenticated;
grant execute on function pos.capture_shift_product_availability_snapshot(text, text, text, double precision) to anon, authenticated;
