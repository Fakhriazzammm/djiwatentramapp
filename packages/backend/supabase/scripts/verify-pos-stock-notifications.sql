-- Run with psql -v ON_ERROR_STOP=1. All business-data changes are rolled back.
-- Identity values consumed by the RPCs are intentionally not reused.
begin;

do $$
declare
  seq_name text;
  table_name text;
  id_column text;
  seq_value bigint;
  seq_called boolean;
  max_id bigint;
begin
  for table_name, id_column in values
    ('product_availability_events', 'event_id'),
    ('shift_product_availability_snapshots', 'snapshot_id'),
    ('telegram_stock_notification_deliveries', 'delivery_id')
  loop
    seq_name := pg_get_serial_sequence('pos.' || table_name, id_column);
    execute format('select last_value, is_called from %s', seq_name) into seq_value, seq_called;
    execute format('select coalesce(max(%I), 0) from pos.%I', id_column, table_name) into max_id;
    if seq_value < max_id or (seq_value = max_id and not seq_called) then
      raise exception '% sequence is behind existing rows: % < %', table_name, seq_value, max_id;
    end if;
  end loop;
end $$;

set local role anon;
do $$
declare
  product_id text;
  original_state boolean;
  change_result record;
  bulk_result record;
begin
  select source_id, is_available into strict product_id, original_state
  from pos.products order by source_id limit 1;

  select * into change_result from pos.update_product_availability_with_event(
    product_id, not original_state, p_source_action_id => 'regression-stock-single-' || txid_current()
  );
  if not change_result.changed or change_result.event_id is null then
    raise exception 'Single availability change did not produce an event';
  end if;
  if (select is_available from pos.products where source_id = product_id) is distinct from not original_state then
    raise exception 'Single availability change did not persist';
  end if;

  select * into bulk_result from pos.update_products_availability_with_events(
    array[product_id], original_state, p_source_action_id => 'regression-stock-bulk-' || txid_current()
  );
  if bulk_result.updated_count <> 1 or bulk_result.changed_count <> 1 or bulk_result.event_count <> 1 then
    raise exception 'Bulk availability change did not produce one event: %', bulk_result;
  end if;

  select * into change_result from pos.update_product_availability_with_event(
    product_id, original_state, p_source_action_id => 'regression-stock-noop-' || txid_current()
  );
  if change_result.changed or change_result.event_id is not null then
    raise exception 'Unchanged availability produced a duplicate event';
  end if;
end $$;
reset role;

-- No committed events or Telegram messages are produced by this check.
do $$
declare
  delivery_key text := 'regression-stock-delivery-' || txid_current();
begin
  if not pos.claim_stock_notification(delivery_key, 'regression', 'rollback-only', '0') then
    raise exception 'Could not claim notification delivery';
  end if;
  if not pos.mark_stock_notification(delivery_key, 'sent', 'rollback-only') then
    raise exception 'Could not acknowledge notification delivery';
  end if;
  if pos.claim_stock_notification(delivery_key, 'regression', 'rollback-only', '0') then
    raise exception 'Sent notification was claimed twice';
  end if;
end $$;

rollback;
