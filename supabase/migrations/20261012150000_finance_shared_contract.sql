-- Opsi A — satu layanan finance, buku TERPISAH per app (idempotent, aman dijalankan ulang).
--
-- Tujuan:
--   * setiap app menulis lewat SATU kontrak: finance.record_transaction(...)
--   * buku F&B tetap pos.financial_transactions (dashboard & fungsi F&B tidak perlu diubah)
--   * buku Travel terpisah di finance.travel_transactions dan hanya bisa dibaca service_role
--   * tidak ada view gabungan, supaya pemasukan/pengeluaran satu brand tidak pernah muncul di brand lain
begin;

create schema if not exists finance;

-- 1) atribusi app: kolom source_app sudah ada tetapi kosong, isi mekanis dari penanda penulis.
--    Hanya baris yang masih NULL yang disentuh, jadi migrasi ini idempotent.
update pos.financial_transactions t
set source_app = case
      when t.metadata->'paymentGateway'->>'source' = 'djiwa_travel' then 'djiwa_travel'
      when coalesce(t.metadata->>'source','') in (
        'pos','pos_menu_sidebar','shift_open','shift_close','order_sync',
        'djiwa_pay','ai_receipt_scan','customer_self_service','yumi_finance_agent'
      ) then 'djiwa_app'
      else 'unknown'
    end
where t.source_app is null;

-- 2) buku Travel (klon struktur + index dedupe dari buku F&B)
create table if not exists finance.travel_transactions (like pos.financial_transactions including all);
alter table finance.travel_transactions alter column source_app set default 'djiwa_travel';

insert into finance.travel_transactions
select * from pos.financial_transactions t
where coalesce(t.source_app, '') = 'djiwa_travel'
   or t.metadata->'paymentGateway'->>'source' = 'djiwa_travel'
on conflict (source_id) do nothing;

delete from pos.financial_transactions t
where coalesce(t.source_app, '') = 'djiwa_travel'
   or t.metadata->'paymentGateway'->>'source' = 'djiwa_travel';

revoke all on finance.travel_transactions from public, anon, authenticated;
grant select, insert, update on finance.travel_transactions to service_role;

-- 3) kontrak tulis tunggal untuk semua app, merouting ke buku yang benar
create or replace function finance.record_transaction(
  p_source_app text,
  p_source_id text,
  p_tx_type text,
  p_amount numeric,
  p_category text default null,
  p_description text default null,
  p_merchant text default null,
  p_tx_date double precision default null,
  p_payment_method text default null,
  p_status text default 'completed',
  p_order_source_id text default null,
  p_transaction_kind text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_raw jsonb default '{}'::jsonb,
  p_business_unit text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'finance', 'pos', 'public'
as $fn$
declare
  v_existing text;
  v_book text;
begin
  if coalesce(btrim(p_source_app), '') = '' then raise exception 'source_app is required'; end if;
  if coalesce(btrim(p_source_id), '') = '' then raise exception 'source_id is required'; end if;
  if p_tx_type not in ('income', 'expense') then raise exception 'tx_type is invalid'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount is invalid'; end if;

  v_book := case when p_source_app = 'djiwa_travel' then 'travel' else 'fnb' end;

  if v_book = 'travel' then
    select t.source_id into v_existing from finance.travel_transactions t where t.source_id = p_source_id;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'source_id', v_existing, 'book', 'djiwa_travel');
    end if;
    if p_order_source_id is not null then
      select t.source_id into v_existing from finance.travel_transactions t
      where t.order_source_id = p_order_source_id and t.tx_type = p_tx_type limit 1;
      if v_existing is not null then
        return jsonb_build_object('ok', true, 'duplicate', true, 'source_id', v_existing, 'book', 'djiwa_travel');
      end if;
    end if;

    insert into finance.travel_transactions(
      source_id, tx_type, amount, category, merchant, description, tx_date, payment_method, status,
      order_source_id, metadata, raw, creation_time, source_app, business_unit, transaction_kind
    ) values (
      p_source_id, p_tx_type, p_amount, p_category, p_merchant, p_description,
      coalesce(p_tx_date, extract(epoch from now()) * 1000), p_payment_method, coalesce(p_status, 'completed'),
      p_order_source_id,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source_app', 'djiwa_travel'),
      coalesce(p_raw, '{}'::jsonb), extract(epoch from now()) * 1000,
      'djiwa_travel', p_business_unit, p_transaction_kind
    ) returning source_id into v_existing;

    return jsonb_build_object('ok', true, 'duplicate', false, 'source_id', v_existing, 'book', 'djiwa_travel');
  end if;

  select t.source_id into v_existing from pos.financial_transactions t where t.source_id = p_source_id;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'source_id', v_existing, 'book', 'djiwa_app');
  end if;
  if p_order_source_id is not null then
    select t.source_id into v_existing from pos.financial_transactions t
    where t.order_source_id = p_order_source_id and t.tx_type = p_tx_type limit 1;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'source_id', v_existing, 'book', 'djiwa_app');
    end if;
  end if;

  insert into pos.financial_transactions(
    source_id, tx_type, amount, category, merchant, description, tx_date, payment_method, status,
    order_source_id, metadata, raw, creation_time, source_app, business_unit, transaction_kind
  ) values (
    p_source_id, p_tx_type, p_amount, p_category, p_merchant, p_description,
    coalesce(p_tx_date, extract(epoch from now()) * 1000), p_payment_method, coalesce(p_status, 'completed'),
    p_order_source_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source_app', p_source_app),
    coalesce(p_raw, '{}'::jsonb), extract(epoch from now()) * 1000,
    p_source_app, p_business_unit, p_transaction_kind
  ) returning source_id into v_existing;

  return jsonb_build_object('ok', true, 'duplicate', false, 'source_id', v_existing, 'book', 'djiwa_app');
exception
  when unique_violation then
    -- Dua penulis bersamaan: yang kalah tetap dijawab duplikat, bukan error.
    return jsonb_build_object('ok', true, 'duplicate', true, 'source_id', p_source_id, 'book', v_book);
end;
$fn$;

revoke all on function finance.record_transaction(text,text,text,numeric,text,text,text,double precision,text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function finance.record_transaction(text,text,text,numeric,text,text,text,double precision,text,text,text,text,jsonb,jsonb,text) to service_role;

-- 4) permukaan baca terpisah (security_invoker agar RLS tabel induk tetap berlaku)
create or replace view finance.transactions with (security_invoker = true) as
  select * from pos.financial_transactions;

create or replace view finance.fnb_transactions_by_app with (security_invoker = true) as
  select coalesce(source_app, 'unknown') as source_app, tx_type,
         count(*) as transactions, sum(amount) as total_amount,
         min(tx_date) as first_tx_date, max(tx_date) as last_tx_date
  from pos.financial_transactions group by 1, 2;

drop view if exists finance.transactions_by_app;

grant usage on schema finance to service_role;
grant select on finance.transactions to service_role;
grant select on finance.fnb_transactions_by_app to service_role;
grant select on finance.travel_transactions to service_role;
revoke all on finance.transactions from authenticated;
revoke all on finance.fnb_transactions_by_app from authenticated;
revoke all on finance.travel_transactions from authenticated, anon, public;

commit;
