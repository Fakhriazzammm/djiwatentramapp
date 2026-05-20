-- ──────────────────────────────────────────────────────────────
-- Migration: Backfill accounting_entries + auto-create trigger
-- Fase 2: Populate accounting_entries dari financial_transactions
-- ──────────────────────────────────────────────────────────────

-- 1) Function: Map category/description to expense COA code
create or replace function public.fn_map_expense_coa(p_category text, p_description text)
returns text
language sql
stable
as $$
  select case
    when coalesce(p_category || ' ' || p_description, '') ~* '(gaji|upah|salary|honor)'     then '5-1000'
    when coalesce(p_category || ' ' || p_description, '') ~* '(bahan baku|bahan dasar)'      then '5-2000'
    when coalesce(p_category || ' ' || p_description, '') ~* '(kopi|susu|creamer|latte)'     then '5-2100'
    when coalesce(p_category || ' ' || p_description, '') ~* '(tepung|roti|croissant|pasta)'  then '5-2200'
    when coalesce(p_category || ' ' || p_description, '') ~* '(sirup|soda|mineral|air minum)' then '5-2300'
    when coalesce(p_category || ' ' || p_description, '') ~* '(pack|gelas|cup|lid|kemasan)'  then '5-2400'
    when coalesce(p_category || ' ' || p_description, '') ~* '(listrik|air|pdam|pln|wifi|internet)' then '5-3100'
    when coalesce(p_category || ' ' || p_description, '') ~* '(sewa|rent)'                   then '5-3200'
    when coalesce(p_category || ' ' || p_description, '') ~* '(bensin|transport|grab|gojek|ojol)' then '5-3300'
    when coalesce(p_category || ' ' || p_description, '') ~* '(promosi|iklan|ads|sponsor)'    then '5-4000'
    when coalesce(p_category || ' ' || p_description, '') ~* '(penyusutan|depresiasi)'        then '5-5000'
    else '5-3000' -- Default: Beban Operasional
  end;
$$;

-- 2) Function: Map payment_method to cash COA code
create or replace function public.fn_map_cash_coa(p_payment_method text)
returns text
language sql
stable
as $$
  select case
    when lower(coalesce(p_payment_method, '')) in ('qris', 'gopay', 'ovo', 'dana', 'linkaja', 'shopeepay') then '1-1100'
    else '1-1000' -- Default: Kas Tunai
  end;
$$;

-- 3) Function: Create accounting entries for a single financial transaction
create or replace function public.fn_create_accounting_entries(
  p_source_id text,
  p_tx_type text,
  p_amount numeric,
  p_category text default null,
  p_description text default null,
  p_payment_method text default null
)
returns void
language plpgsql
as $$
declare
  v_coa_debit text;
  v_coa_kredit text;
  v_coa_id_debit uuid;
  v_coa_id_kredit uuid;
  v_desc text;
begin
  if p_amount <= 0 then return; end if;

  v_desc := coalesce(p_description, p_category, 'Transaksi');

  if p_tx_type = 'income' then
    -- Income: Debit Kas, Kredit Pendapatan
    v_coa_debit  := public.fn_map_cash_coa(p_payment_method);
    v_coa_kredit := '4-1000'; -- Pendapatan Penjualan
  elsif p_tx_type = 'expense' then
    -- Expense: Debit Beban, Kredit Kas
    v_coa_debit  := public.fn_map_expense_coa(p_category, p_description);
    v_coa_kredit := public.fn_map_cash_coa(p_payment_method);
  else
    return; -- unknown type
  end if;

  -- Resolve COA UUIDs
  select id into v_coa_id_debit from public.accounting_chart_of_accounts where code = v_coa_debit;
  select id into v_coa_id_kredit from public.accounting_chart_of_accounts where code = v_coa_kredit;

  if v_coa_id_debit is null or v_coa_id_kredit is null then
    raise warning 'COA not found: debit=%, kredit=%', v_coa_debit, v_coa_kredit;
    return;
  end if;

  -- Insert debit entry
  insert into public.accounting_entries (transaction_source_id, coa_id, entry_type, amount, description, item_index)
  values (p_source_id, v_coa_id_debit, 'debit', p_amount, v_desc, 0)
  on conflict do nothing;

  -- Insert kredit entry
  insert into public.accounting_entries (transaction_source_id, coa_id, entry_type, amount, description, item_index)
  values (p_source_id, v_coa_id_kredit, 'kredit', p_amount, v_desc, 1)
  on conflict do nothing;
end;
$$;

-- 4) Trigger function: auto-create accounting entries on insert
create or replace function public.fn_trg_auto_accounting_entries()
returns trigger
language plpgsql
as $$
begin
  perform public.fn_create_accounting_entries(
    NEW.source_id,
    NEW.tx_type,
    NEW.amount,
    NEW.category,
    NEW.description,
    NEW.payment_method
  );
  return NEW;
end;
$$;

-- 5) Apply trigger to pos.financial_transactions
drop trigger if exists trg_auto_accounting_entries on pos.financial_transactions;
create trigger trg_auto_accounting_entries
  after insert on pos.financial_transactions
  for each row
  execute function public.fn_trg_auto_accounting_entries();

-- 6) Backfill: create accounting entries for ALL existing financial transactions
do $$
declare
  v_count int := 0;
  v_errors int := 0;
  r record;
begin
  for r in
    select source_id, tx_type, amount, category, description, payment_method
    from pos.financial_transactions
    where amount > 0
      and tx_type in ('income', 'expense')
      and source_id is not null
      and not exists (
        select 1 from public.accounting_entries ae
        where ae.transaction_source_id = pos.financial_transactions.source_id
        limit 1
      )
    order by tx_date asc
  loop
    begin
      perform public.fn_create_accounting_entries(
        r.source_id, r.tx_type, r.amount, r.category, r.description, r.payment_method
      );
      v_count := v_count + 1;
    exception when others then
      v_errors := v_errors + 1;
      raise warning 'Backfill error for source_id=%: %', r.source_id, SQLERRM;
    end;
  end loop;

  raise notice 'Accounting backfill complete: % entries created (errors: %)', v_count, v_errors;
end;
$$;

-- 7) Also backfill from the public view (for any records that were inserted via the view)
do $$
declare
  r record;
  v_count int := 0;
begin
  -- Check if there are source_ids in public view that weren't caught above
  for r in
    select _id as source_id, type as tx_type, amount, category, description, "paymentMethod" as payment_method
    from public.pos_financial_transactions
    where amount > 0
      and type in ('income', 'expense')
      and _id is not null
      and not exists (
        select 1 from public.accounting_entries ae
        where ae.transaction_source_id = pos_financial_transactions._id
        limit 1
      )
    order by date asc
  loop
    begin
      perform public.fn_create_accounting_entries(
        r.source_id, r.tx_type, r.amount, r.category, r.description, r.payment_method
      );
      v_count := v_count + 1;
    exception when others then
      null;
    end;
  end loop;

  raise notice 'Public view backfill complete: % additional entries', v_count;
end;
$$;

-- 8) Refresh PostgREST schema cache
notify pgrst, 'reload schema';
