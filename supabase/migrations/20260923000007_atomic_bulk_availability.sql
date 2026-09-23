-- Make bulk availability updates all-or-nothing while preserving per-product events.

create or replace function pos.update_products_availability_with_events(
  p_product_source_ids text[],
  p_new_is_available boolean,
  p_changed_by_user_id text default null,
  p_changed_by_name text default null,
  p_shift_source_id text default null,
  p_source text default 'pos_menu_stock_bulk',
  p_source_action_id text default null
)
returns table (
  updated_count integer,
  changed_count integer,
  event_count integer
)
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  product_id text;
  product_row pos.products%rowtype;
  event_key text;
  changed_total integer := 0;
  event_total integer := 0;
  requested_ids text[];
begin
  select array_agg(distinct trim(value))
    into requested_ids
  from unnest(coalesce(p_product_source_ids, '{}'::text[])) as value
  where trim(value) <> '';

  if requested_ids is null or cardinality(requested_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  -- Validate every requested product before changing any row.
  if exists (
    select 1
    from unnest(requested_ids) as requested(product_source_id)
    where not exists (
      select 1 from pos.products p where p.source_id = requested.product_source_id
    )
  ) then
    raise exception 'Salah satu produk bulk tidak ditemukan';
  end if;

  -- Lock in stable order so concurrent bulk calls cannot partially interleave.
  for product_id in select value from unnest(requested_ids) as value order by value loop
    select * into product_row
    from pos.products
    where source_id = product_id
    for update;

    if product_row.is_available is distinct from p_new_is_available then
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
        previous_is_available, new_is_available, quantity_snapshot, source,
        source_action_id, changed_by_user_id, changed_by_name_snapshot,
        shift_source_id, changed_at
      ) values (
        event_key, product_row.source_id, product_row.name, product_row.menu_number,
        product_row.is_available, p_new_is_available, product_row.quantity,
        coalesce(nullif(trim(p_source), ''), 'pos_menu_stock_bulk'),
        p_source_action_id, p_changed_by_user_id, p_changed_by_name,
        p_shift_source_id, extract(epoch from clock_timestamp()) * 1000
      )
      on conflict (dedupe_key) do nothing;

      changed_total := changed_total + 1;
      if found then
        event_total := event_total + 1;
      end if;
    end if;
  end loop;

  return query select cardinality(requested_ids), changed_total, event_total;
end;
$$;

grant execute on function pos.update_products_availability_with_events(text[], boolean, text, text, text, text, text) to anon, authenticated;
