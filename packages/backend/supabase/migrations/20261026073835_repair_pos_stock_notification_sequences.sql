-- A restored/imported identity does not automatically advance its sequence.
-- Never rewind a sequence: rolled-back calls and concurrent deliveries may
-- already have consumed values above max(id).
begin;

lock table pos.product_availability_events,
  pos.shift_product_availability_snapshots,
  pos.telegram_stock_notification_deliveries in share row exclusive mode;

do $$
declare
  table_name text;
  id_column text;
  seq_name text;
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
      perform setval(seq_name::regclass, max_id, true);
    end if;
  end loop;
end $$;

commit;
