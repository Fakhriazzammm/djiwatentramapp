-- Narrow SECURITY DEFINER RPCs for the custom-auth POS stock controls.

create or replace function pos.update_product_quantity(p_product_source_id text, p_quantity numeric)
returns void language plpgsql security definer set search_path = pos, public as $$
begin
  if nullif(trim(p_product_source_id), '') is null or p_quantity is null or p_quantity < 0 then
    raise exception 'product id dan quantity wajib valid';
  end if;
  update pos.products set quantity = p_quantity where source_id = p_product_source_id;
  if not found then raise exception 'Produk tidak ditemukan: %', p_product_source_id; end if;
end; $$;

create or replace function pos.apply_inventory_stock_action(p_args jsonb)
returns void language plpgsql security definer set search_path = pos, public as $$
declare
  inventory_id text := nullif(trim(p_args->>'inventoryId'), '');
  action_name text := p_args->>'action';
  change_quantity numeric := (p_args->>'quantity')::numeric;
  current_quantity numeric; next_quantity numeric; tx_quantity numeric;
  now_value double precision := coalesce((p_args->>'timestamp')::double precision, extract(epoch from clock_timestamp()) * 1000);
begin
  if p_args is null or jsonb_typeof(p_args) <> 'object' then raise exception 'Payload aksi stok tidak valid'; end if;
  if inventory_id is null or action_name not in ('add', 'usage', 'adjust') or change_quantity is null or change_quantity <= 0 then
    raise exception 'Aksi stok tidak valid';
  end if;
  select quantity into current_quantity from pos.inventory where source_id = inventory_id for update;
  if not found then raise exception 'Inventory item tidak ditemukan'; end if;
  next_quantity := case action_name when 'add' then current_quantity + change_quantity when 'usage' then greatest(0, current_quantity - change_quantity) else change_quantity end;
  tx_quantity := case action_name when 'usage' then -change_quantity when 'add' then change_quantity else next_quantity - current_quantity end;
  update pos.inventory set quantity = next_quantity,
    last_purchase_price = case when p_args ? 'costPerUnit' then (p_args->>'costPerUnit')::numeric else last_purchase_price end,
    last_purchase_at = case when action_name = 'add' then now_value else last_purchase_at end,
    last_purchase_store_source_id = coalesce(nullif(p_args->>'storeId', ''), last_purchase_store_source_id)
    where source_id = inventory_id;
  insert into pos.inventory_transactions (source_id, inventory_source_id, quantity, tx_type, cost_per_unit, remaining_quantity, tx_timestamp, notes, expiry_date, brand_name, store_source_id, purchase_unit, purchase_quantity, line_total, creation_time, raw)
  values (md5(random()::text || clock_timestamp()::text || inventory_id), inventory_id, tx_quantity, action_name,
    case when p_args ? 'costPerUnit' then (p_args->>'costPerUnit')::numeric else null end,
    case when action_name = 'add' then change_quantity else null end, now_value, p_args->>'notes',
    case when p_args ? 'expiryDate' then (p_args->>'expiryDate')::double precision else null end, p_args->>'brandName', p_args->>'storeId', p_args->>'purchaseUnit',
    case when p_args ? 'purchaseQuantity' then (p_args->>'purchaseQuantity')::numeric else null end,
    case when p_args ? 'lineTotal' then (p_args->>'lineTotal')::numeric else null end, extract(epoch from clock_timestamp()) * 1000, p_args);
end; $$;

revoke execute on function pos.update_product_quantity(text, numeric) from public;
grant execute on function pos.update_product_quantity(text, numeric) to anon, authenticated;
revoke execute on function pos.apply_inventory_stock_action(jsonb) from public;
grant execute on function pos.apply_inventory_stock_action(jsonb) to anon, authenticated;
