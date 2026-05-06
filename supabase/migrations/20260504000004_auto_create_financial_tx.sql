-- Migration: Auto-create financial transactions when orders are paid/completed
-- Hermes Agent: FIX bug order tanpa financial transaction

-- 1. Function trigger untuk auto-create financial tx
create or replace function pos.auto_create_financial_tx()
returns trigger
language plpgsql
security definer
as $$
declare
    v_fin_id text;
begin
    if (tg_op = 'insert' and new.status in ('paid', 'completed')) or
       (tg_op = 'update' and new.status in ('paid', 'completed') and
        (old.status is distinct from new.status) and
        old.status not in ('paid', 'completed')) then

        if not exists (
            select 1 from pos.financial_transactions
            where order_source_id = new.source_id and tx_type = 'income'
        ) then
            v_fin_id := 'fin_' || replace(gen_random_uuid()::text, '-', '');

            insert into pos.financial_transactions (
                source_id, tx_type, amount, category, description,
                tx_date, payment_method, status, order_source_id, creation_time, raw
            ) values (
                v_fin_id,
                'income',
                new.total_amount,
                'Penjualan',
                'Penjualan Pesanan #' || new.order_number,
                new.created_at,
                new.payment_method,
                'completed',
                new.source_id,
                extract(epoch from now())::bigint * 1000,
                jsonb_build_object(
                    'kind', 'order_settlement_trigger',
                    'orderId', new.source_id,
                    'orderNumber', new.order_number
                )
            );
        end if;
    end if;
    return new;
end;
$$;

-- 2. Trigger untuk INSERT
drop trigger if exists trg_auto_create_financial_tx_insert on pos.orders;
create trigger trg_auto_create_financial_tx_insert
    after insert on pos.orders
    for each row
    execute function pos.auto_create_financial_tx();

-- 3. Trigger untuk UPDATE status
drop trigger if exists trg_auto_create_financial_tx_update on pos.orders;
create trigger trg_auto_create_financial_tx_update
    after update of status on pos.orders
    for each row
    when (new.status in ('paid', 'completed'))
    execute function pos.auto_create_financial_tx();

-- 4. Grant permission (jika belum ada)
grant usage on schema pos to anon, authenticated;
grant insert on pos.financial_transactions to anon, authenticated;

-- 5. Backfill: semua order paid/completed yang belum punya financial transaction
do $$
declare
    v_order record;
    v_fin_id text;
    v_count int := 0;
    v_total numeric := 0;
begin
    for v_order in
        select source_id, order_number, total_amount, created_at, payment_method, status
        from pos.orders o
        where o.status in ('paid', 'completed')
          and not exists (
            select 1 from pos.financial_transactions ft
            where ft.order_source_id = o.source_id and ft.tx_type = 'income'
          )
        order by o.created_at asc
    loop
        v_fin_id := 'fin_' || replace(gen_random_uuid()::text, '-', '');

        begin
            insert into pos.financial_transactions (
                source_id, tx_type, amount, category, description,
                tx_date, payment_method, status, order_source_id, creation_time, raw
            ) values (
                v_fin_id,
                'income',
                v_order.total_amount,
                'Penjualan',
                'Penjualan Pesanan #' || v_order.order_number || ' (BACKFILL)',
                v_order.created_at,
                v_order.payment_method,
                'completed',
                v_order.source_id,
                extract(epoch from now())::bigint * 1000,
                jsonb_build_object(
                    'kind', 'order_settlement_backfill',
                    'orderId', v_order.source_id,
                    'orderNumber', v_order.order_number
                )
            );
            v_count := v_count + 1;
            v_total := v_total + coalesce(v_order.total_amount, 0);
        exception when others then
            null;
        end;
    end loop;

    raise notice 'BACKFILL: % orders, total Rp %', v_count, v_total;
end;
$$;
