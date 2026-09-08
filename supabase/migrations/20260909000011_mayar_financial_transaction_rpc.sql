-- Idempotent Mayar order settlement ledger write.
-- Additive only; existing financial rows are never rewritten.
create or replace function pos.record_mayar_financial_transaction(
  p_order_id text,
  p_order_number text,
  p_amount numeric,
  p_customer_name text,
  p_paid_at double precision,
  p_payment_gateway jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public, pg_catalog
as $$
declare
  v_existing pos.financial_transactions%rowtype;
  v_source_id text;
  v_now double precision := extract(epoch from now()) * 1000;
begin
  if nullif(btrim(p_order_id), '') is null then
    raise exception using errcode = '22023', message = 'Mayar order id is required';
  end if;
  if coalesce(p_amount, 0) < 0 then
    raise exception using errcode = '22023', message = 'Mayar amount is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtext('mayar-fin:' || btrim(p_order_id)));

  select * into v_existing
  from pos.financial_transactions
  where order_source_id = btrim(p_order_id)
     or metadata->>'orderId' = btrim(p_order_id)
  order by creation_time asc nulls last
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'sourceId', v_existing.source_id);
  end if;

  v_source_id := 'fin_mayar_' || md5(btrim(p_order_id));
  insert into pos.financial_transactions (
    source_id, tx_type, amount, category, description, tx_date,
    payment_method, status, order_source_id, metadata, creation_time, raw
  ) values (
    v_source_id,
    'income',
    coalesce(p_amount, 0),
    'Penjualan',
    'Penjualan Pesanan #' || coalesce(nullif(btrim(p_order_number), ''), btrim(p_order_id)),
    coalesce(p_paid_at, v_now),
    'mayar',
    'completed',
    btrim(p_order_id),
    coalesce(p_payment_gateway, '{}'::jsonb) || jsonb_build_object(
      'orderId', btrim(p_order_id),
      'customerName', nullif(btrim(coalesce(p_customer_name, '')), '')
    ),
    v_now,
    jsonb_build_object(
      'kind', 'mayar_order_settlement',
      'orderId', btrim(p_order_id),
      'orderNumber', nullif(btrim(coalesce(p_order_number, '')), '')
    )
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'sourceId', v_source_id);
end;
$$;

revoke all on function pos.record_mayar_financial_transaction(text, text, numeric, text, double precision, jsonb)
  from public, anon, authenticated;
grant execute on function pos.record_mayar_financial_transaction(text, text, numeric, text, double precision, jsonb)
  to service_role;

notify pgrst, 'reload schema';
