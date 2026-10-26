-- Ready-to-sell portions are separate from recipe ingredient purchasing/usage.
-- Keep catalog writes restricted; expose only a validated +/- one operation.
begin;
create schema if not exists pos_private;
revoke all on schema pos_private from public;
grant usage on schema pos_private to anon, authenticated;

create or replace function pos_private.adjust_ready_menu_stock(
  p_product_source_id text,
  p_delta integer,
  p_expected_quantity numeric
)
returns table (quantity numeric, is_available boolean, event_id bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  product_row pos.products%rowtype;
  next_quantity numeric;
  availability_event_id bigint;
begin
  if p_delta is null or p_delta not in (-1, 1) or p_expected_quantity is null
    or p_expected_quantity < 0 or p_expected_quantity = 'NaN'::numeric then
    raise exception using errcode = '22023', message = 'Perubahan stok tidak valid';
  end if;

  select * into product_row from pos.products p
  where p.source_id = p_product_source_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;
  if coalesce(product_row.quantity, 0) <> p_expected_quantity then
    raise exception using errcode = '40001', message = 'Stok sudah berubah. Muat ulang dan coba lagi.';
  end if;
  next_quantity := coalesce(product_row.quantity, 0) + p_delta;
  if next_quantity < 0 then
    raise exception using errcode = '23514', message = 'Stok menu tidak mencukupi';
  end if;

  update pos.products p set quantity = next_quantity,
    raw = coalesce(p.raw, '{}'::jsonb) || jsonb_build_object(
      'lastMenuStockChangedAt', extract(epoch from clock_timestamp()) * 1000,
      'lastMenuStockSource', 'pos_menu_stock',
      'previousMenuQuantity', product_row.quantity
    )
  where p.source_id = p_product_source_id;

  if next_quantity = 0 and product_row.is_available then
    select e.event_id into availability_event_id
    from pos.update_product_availability_with_event(
      p_product_source_id, false, p_source => 'pos_menu_stock'
    ) e;
  end if;
  return query select next_quantity,
    case when next_quantity = 0 then false else product_row.is_available end,
    availability_event_id;
end $$;
revoke all on function pos_private.adjust_ready_menu_stock(text, integer, numeric) from public;
grant execute on function pos_private.adjust_ready_menu_stock(text, integer, numeric) to anon, authenticated;

create or replace function pos.adjust_ready_menu_stock(
  p_product_source_id text,
  p_delta integer,
  p_expected_quantity numeric
)
returns table (quantity numeric, is_available boolean, event_id bigint)
language sql security invoker set search_path = ''
as $$
  select * from pos_private.adjust_ready_menu_stock(p_product_source_id, p_delta, p_expected_quantity);
$$;
revoke all on function pos.adjust_ready_menu_stock(text, integer, numeric) from public;
grant execute on function pos.adjust_ready_menu_stock(text, integer, numeric) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
