-- Run with psql -v ON_ERROR_STOP=1. Fixtures and events are rolled back.
begin isolation level repeatable read;
create temporary table stock_test_inventory on commit drop as
  select source_id, quantity from pos.inventory;
select set_config('test.stock_product', source_id, true)
from pos.products order by source_id limit 1;
update pos.products set quantity = 1, is_available = true
where source_id = current_setting('test.stock_product');

set local role anon;
do $$
declare
  product_id text := current_setting('test.stock_product');
  result record;
begin
  select * into result from pos.adjust_ready_menu_stock(product_id, 1, 1);
  if result.quantity <> 2 or not result.is_available then
    raise exception 'Increment did not persist the ready-to-sell quantity';
  end if;

  begin
    perform pos.adjust_ready_menu_stock(product_id, -1, 1);
    raise exception 'Stale client quantity was accepted';
  exception when sqlstate '40001' then null;
  end;
  if (select quantity from pos.products where source_id = product_id) <> 2 then
    raise exception 'Stale request changed stock';
  end if;

  perform pos.adjust_ready_menu_stock(product_id, -1, 2);
  select * into result from pos.adjust_ready_menu_stock(product_id, -1, 1);
  if result.quantity <> 0 or result.is_available or result.event_id is null then
    raise exception 'Zero stock did not atomically mark SOLD and create a notification event';
  end if;

  begin
    perform pos.adjust_ready_menu_stock(product_id, -1, 0);
    raise exception 'Negative stock was accepted';
  exception when check_violation then null;
  end;
  begin
    perform pos.adjust_ready_menu_stock(product_id, 10, 0);
    raise exception 'Unsupported delta was accepted';
  exception when invalid_parameter_value then null;
  end;

  select * into result from pos.adjust_ready_menu_stock(product_id, 1, 0);
  if result.quantity <> 1 or result.is_available or result.event_id is not null then
    raise exception 'Adding portions unexpectedly reactivated a SOLD product';
  end if;
end $$;
reset role;
do $$
begin
  if exists (
    (select source_id, quantity from pos.inventory except select * from stock_test_inventory)
    union all
    (select * from stock_test_inventory except select source_id, quantity from pos.inventory)
  ) then
    raise exception 'Ready-to-sell adjustment modified ingredient inventory';
  end if;
end $$;
rollback;
