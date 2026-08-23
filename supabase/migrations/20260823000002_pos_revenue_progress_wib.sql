-- Revenue progress must use the business timezone explicitly.
-- Revenue definition remains operational income from settled POS and customer
-- self-service orders; Modal Awal/Setoran Akhir remain excluded.

create or replace view public.pos_current_month_progress as
with current_context as (
  select
    (now() at time zone 'Asia/Jakarta')::date as current_date_local,
    (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta') as month_start_ts,
    ((date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '1 month') at time zone 'Asia/Jakarta') as next_month_start_ts,
    to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM') as month_key,
    extract(day from (date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '1 month - 1 day'))::numeric as days_in_month,
    extract(day from (now() at time zone 'Asia/Jakarta')::date)::numeric as days_passed
),
shift_config as (
  select
    greatest(
      1,
      coalesce(
        jsonb_array_length(raw #> '{shiftSettings,predefinedShifts}'),
        2
      )
    )::numeric as shifts_per_day
  from pos.site_settings
  order by creation_time desc nulls last
  limit 1
),
target as (
  select
    ft.month,
    ft.target_revenue,
    ft.target_profit
  from pos.financial_targets ft
  join current_context c on c.month_key = ft.month
  limit 1
),
month_transactions as (
  select
    ft.*
  from pos.financial_transactions ft
  cross join current_context c
  where to_timestamp(ft.tx_date / 1000.0) >= c.month_start_ts
    and to_timestamp(ft.tx_date / 1000.0) < c.next_month_start_ts
    and coalesce(ft.status, 'completed') = 'completed'
    and ft.booking_order_source_id is null
    and (
      ft.order_source_id is null
      or exists (
        select 1 from pos.orders o
        where o.source_id = ft.order_source_id
          and o.source in ('pos', 'customer_self_service')
      )
    )
),
today_transactions as (
  select
    ft.*
  from month_transactions ft
  cross join current_context c
  where to_timestamp(ft.tx_date / 1000.0) >= (c.current_date_local::timestamp at time zone 'Asia/Jakarta')
    and to_timestamp(ft.tx_date / 1000.0) < ((c.current_date_local::timestamp + interval '1 day') at time zone 'Asia/Jakarta')
),
latest_modal_awal as (
  select
    max(ft.tx_date) as tx_date
  from today_transactions ft
  where ft.tx_type = 'income'
    and coalesce(ft.category, '') = 'Modal Awal'
)
select
  c.month_key as month,
  to_char(c.current_date_local, 'TMMonth YYYY') as month_label,
  coalesce((
    select sum(ft.amount)
    from month_transactions ft
    where ft.tx_type = 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0) as current_income,
  coalesce((
    select sum(ft.amount)
    from month_transactions ft
    where ft.tx_type <> 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0) as current_expense,
  coalesce((
    select sum(ft.amount)
    from month_transactions ft
    where ft.tx_type = 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0) - coalesce((
    select sum(ft.amount)
    from month_transactions ft
    where ft.tx_type <> 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0) as current_net,
  coalesce(t.target_revenue, 0) as target_revenue,
  t.target_profit,
  greatest(0, coalesce(t.target_revenue, 0) - coalesce((
    select sum(ft.amount)
    from month_transactions ft
    where ft.tx_type = 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0)) as remaining,
  case
    when coalesce(t.target_revenue, 0) <= 0 then 0
    else (
      coalesce((
        select sum(ft.amount)
        from month_transactions ft
        where ft.tx_type = 'income'
          and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
      ), 0) / t.target_revenue
    ) * 100
  end as progress_pct,
  (coalesce(t.target_revenue, 0) / nullif(c.days_in_month, 0)) as daily_target,
  (coalesce(t.target_revenue, 0) / nullif(c.days_in_month, 0) / coalesce((select shifts_per_day from shift_config), 2)) as shift_target,
  coalesce((
    select sum(ft.amount)
    from today_transactions ft
    where ft.tx_type = 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
  ), 0) as daily_collected,
  coalesce((
    select sum(ft.amount)
    from today_transactions ft
    where ft.tx_type = 'income'
      and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
      and ft.tx_date >= coalesce((select tx_date from latest_modal_awal), extract(epoch from (c.current_date_local::timestamp at time zone 'Asia/Jakarta')) * 1000)
  ), 0) as shift_collected,
  c.days_in_month,
  c.days_passed,
  (c.days_in_month - c.days_passed) as days_remaining,
  case
    when c.days_passed <= 0 then 0
    else coalesce((
      select sum(ft.amount)
      from month_transactions ft
      where ft.tx_type = 'income'
        and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
    ), 0) / c.days_passed
  end as daily_rate,
  case
    when c.days_passed <= 0 then 0
    else (coalesce((
      select sum(ft.amount)
      from month_transactions ft
      where ft.tx_type = 'income'
        and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
    ), 0) / c.days_passed) * c.days_in_month
  end as projected_monthly
from current_context c
left join target t on true;


grant select on public.pos_current_month_progress to anon, authenticated, service_role;
