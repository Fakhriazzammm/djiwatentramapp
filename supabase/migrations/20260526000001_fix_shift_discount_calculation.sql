-- ── Fix Shift Discount Calculation ──────────────────────────────────────
-- Masalah: shift yang ditutup manual (dari POS UI) tidak menghitung diskon
-- dari orders. Akibatnya summary.totalDiscount selalu 0 di database.
--
-- Fix: 
-- 1. Buat function untuk recalculate shift summary dari orders
-- 2. Backfill semua shift yang sudah closed dengan data diskon yang benar
-- 3. View pos_shift_reports otomatis menampilkan data yang sudah diperbaiki
-- ─────────────────────────────────────────────────────────────────────────

-- Function: recalculate summary untuk 1 shift
create or replace function pos.recalculate_shift_summary(
  p_shift_id text
) returns jsonb as $$
declare
  v_shift record;
  v_total_revenue numeric := 0;
  v_total_discount numeric := 0;
  v_total_gross_sales numeric := 0;
  v_total_items_sold int := 0;
  v_summary jsonb;
  v_cash_revenue numeric := 0;
  v_qris_revenue numeric := 0;
begin
  -- Get shift data
  select source_id, start_time, end_time, summary, starting_cash
  into v_shift
  from pos.shifts
  where source_id = p_shift_id;
  
  if not found then
    return null;
  end if;

  -- If shift is still active, skip
  if v_shift.end_time is null then
    return v_shift.summary;
  end if;

  -- Query orders in shift time range
  select 
    coalesce(sum(o.total_amount), 0),
    coalesce(sum(o.discount_amount), 0),
    count(*)::int
  into v_total_revenue, v_total_discount, v_total_items_sold
  from pos.orders o
  where o.creation_time >= v_shift.start_time
    and o.creation_time < v_shift.end_time
    and o.status in ('completed', 'paid');

  -- Calculate gross sales
  v_total_gross_sales := v_total_revenue + v_total_discount;

  -- Preserve existing cash/qris breakdown if available
  v_cash_revenue := coalesce((v_shift.summary ->> 'cashRevenue')::numeric, 0);
  v_qris_revenue := coalesce((v_shift.summary ->> 'qrisRevenue')::numeric, 0);

  -- Build new summary
  v_summary := jsonb_build_object(
    'totalRevenue', v_total_revenue,
    'totalGrossSales', v_total_gross_sales,
    'totalDiscount', v_total_discount,
    'totalExpenses', coalesce((v_shift.summary ->> 'totalExpenses')::numeric, 0),
    'totalItemsSold', v_total_items_sold,
    'cashRevenue', v_cash_revenue,
    'qrisRevenue', v_qris_revenue
  );

  -- Update shift
  update pos.shifts
  set summary = v_summary
  where source_id = p_shift_id;

  return v_summary;
end;
$$ language plpgsql;

-- Function: recalculate ALL closed shifts (backfill)
create or replace function pos.recalculate_all_shift_summaries()
returns table (
  shift_id text,
  shift_name text,
  old_discount numeric,
  new_discount numeric,
  old_revenue numeric,
  new_revenue numeric,
  status text
) as $$
declare
  v_shift record;
begin
  for v_shift in
    select source_id, shift_name, start_time, end_time, summary
    from pos.shifts
    where end_time is not null
      and start_time is not null
    order by start_time desc
  loop
    -- Save old values
    old_discount := coalesce((v_shift.summary ->> 'totalDiscount')::numeric, 0);
    old_revenue := coalesce((v_shift.summary ->> 'totalRevenue')::numeric, 0);
    shift_id := v_shift.source_id;
    shift_name := v_shift.shift_name;

    -- Recalculate
    perform pos.recalculate_shift_summary(v_shift.source_id);
    
    -- Read back new values
    select 
      coalesce((summary ->> 'totalDiscount')::numeric, 0),
      coalesce((summary ->> 'totalRevenue')::numeric, 0)
    into new_discount, new_revenue
    from pos.shifts
    where source_id = v_shift.source_id;

    if old_discount = new_discount and old_revenue = new_revenue then
      status := 'unchanged';
    else
      status := 'updated';
    end if;

    return next;
  end loop;
end;
$$ language plpgsql;

-- ── JALANKAN BACKFILL ──────────────────────────────────────────────────
-- Recalculate semua shift yang sudah closed
do $$
declare
  r record;
  updated_count int := 0;
  unchanged_count int := 0;
begin
  for r in
    select * from pos.recalculate_all_shift_summaries()
  loop
    if r.status = 'updated' then
      updated_count := updated_count + 1;
    else
      unchanged_count := unchanged_count + 1;
    end if;
  end loop;
  
  raise notice 'Backfill selesai: % shift diperbarui, % shift tidak berubah.', updated_count, unchanged_count;
end;
$$;

-- ── VERIFIKASI ─────────────────────────────────────────────────────────
-- Cek beberapa shift untuk memastikan data sudah benar
-- select shift_name, cashier_name, 
--   to_char(to_timestamp(start_time / 1000.0), 'YYYY-MM-DD HH24:MI') as tgl,
--   summary ->> 'totalRevenue' as revenue,
--   summary ->> 'totalDiscount' as discount,
--   summary ->> 'totalGrossSales' as gross
-- from pos.shifts
-- where end_time is not null
--   and (summary ->> 'totalDiscount')::numeric > 0
-- order by start_time desc
-- limit 10;
