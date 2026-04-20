create table if not exists pos.shifts (
  source_id text primary key,
  shift_name text not null,
  cashier_name text,
  team_members text,
  start_time double precision not null,
  end_time double precision,
  starting_cash numeric(18,2) not null default 0,
  notes text,
  summary jsonb,
  cash_breakdown jsonb,
  non_cash_expected numeric(18,2),
  non_cash_confirmed numeric(18,2),
  ending_cash_expected numeric(18,2),
  ending_cash_physical numeric(18,2),
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_shifts_start_time
  on pos.shifts (start_time desc);

create index if not exists idx_pos_shifts_end_time
  on pos.shifts (end_time);

create table if not exists pos.financial_targets (
  source_id text primary key,
  month text not null,
  target_revenue numeric(18,2) not null default 0,
  target_profit numeric(18,2),
  created_at double precision,
  updated_at double precision,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_pos_financial_targets_month
  on pos.financial_targets (month);

create or replace view public.pos_shift_reports as
with shift_config as (
  select
    greatest(
      1,
      coalesce(
        jsonb_array_length(raw #> '{shiftSettings,predefinedShifts}'),
        2
      )
    ) as shifts_per_day
  from pos.site_settings
  order by creation_time desc nulls last
  limit 1
),
base_shifts as (
  select
    s.source_id as shift_id,
    s.shift_name,
    s.cashier_name,
    coalesce(s.team_members, '') as team_members,
    s.start_time,
    s.end_time,
    case when s.end_time is null then 'AKTIF' else 'SELESAI' end as status,
    s.starting_cash,
    coalesce((s.summary ->> 'cashRevenue')::numeric, 0) as cash_revenue,
    coalesce((s.summary ->> 'qrisRevenue')::numeric, 0) as qris_revenue,
    0::numeric as other_revenue,
    coalesce((s.summary ->> 'totalRevenue')::numeric, 0) as total_revenue,
    coalesce((s.summary ->> 'totalDiscount')::numeric, 0) as total_discount,
    coalesce((s.summary ->> 'totalExpenses')::numeric, 0) as total_expenses,
    coalesce((s.summary ->> 'totalItemsSold')::numeric, 0) as total_items_sold,
    to_char(to_timestamp(s.start_time / 1000.0), 'YYYY-MM') as month_key,
    date_trunc('day', to_timestamp(s.start_time / 1000.0)) as day_start_ts
  from pos.shifts s
),
targets as (
  select
    t.month,
    t.target_revenue,
    t.target_profit
  from pos.financial_targets t
),
orders_per_shift as (
  select
    s.shift_id,
    (
      select count(*)::int
      from pos.orders o
      where coalesce(o.created_at, o.creation_time) >= s.start_time
        and coalesce(o.created_at, o.creation_time) <= coalesce(s.end_time, extract(epoch from now()) * 1000)
    ) as order_count,
    (
      select count(*)::int
      from pos.orders o
      where coalesce(o.created_at, o.creation_time) >= s.start_time
        and coalesce(o.created_at, o.creation_time) <= coalesce(s.end_time, extract(epoch from now()) * 1000)
        and lower(coalesce(o.order_type, '')) = 'booking'
    ) as booking_count
  from base_shifts s
),
daily_income as (
  select
    s.shift_id,
    coalesce((
      select sum(ft.amount)
      from pos.financial_transactions ft
      where ft.tx_type = 'income'
        and coalesce(ft.status, 'completed') = 'completed'
        and coalesce(ft.category, '') not in ('Modal Awal', 'Setoran Akhir')
        and to_timestamp(ft.tx_date / 1000.0) >= s.day_start_ts
        and to_timestamp(ft.tx_date / 1000.0) < s.day_start_ts + interval '1 day'
    ), 0) as daily_collected
  from base_shifts s
)
select
  s.shift_id,
  s.shift_name,
  s.cashier_name,
  s.team_members,
  s.start_time,
  s.end_time,
  s.status,
  s.starting_cash,
  s.cash_revenue,
  s.qris_revenue,
  s.other_revenue,
  (s.total_revenue + s.total_discount) as total_gross_sales,
  s.total_discount,
  s.total_revenue,
  s.total_expenses,
  s.total_items_sold,
  coalesce(o.order_count, 0) as order_count,
  coalesce(o.booking_count, 0) as booking_count,
  t.target_revenue,
  case
    when t.target_revenue is null or t.target_revenue <= 0 then false
    else true
  end as has_target,
  case
    when t.target_revenue is null or t.target_revenue <= 0 then 0::numeric
    else t.target_revenue / extract(day from (date_trunc('month', to_timestamp(s.start_time / 1000.0)) + interval '1 month - 1 day'))
  end as daily_target,
  case
    when t.target_revenue is null or t.target_revenue <= 0 then 0::numeric
    else (
      t.target_revenue
      / extract(day from (date_trunc('month', to_timestamp(s.start_time / 1000.0)) + interval '1 month - 1 day'))
      / coalesce((select shifts_per_day from shift_config), 2)
    )
  end as shift_target,
  d.daily_collected,
  s.total_revenue as shift_collected,
  case
    when t.target_revenue is null or t.target_revenue <= 0 then false
    else s.total_revenue >= (
      t.target_revenue
      / extract(day from (date_trunc('month', to_timestamp(s.start_time / 1000.0)) + interval '1 month - 1 day'))
      / coalesce((select shifts_per_day from shift_config), 2)
    )
  end as is_shift_target_met,
  case
    when t.target_revenue is null or t.target_revenue <= 0 then false
    else d.daily_collected >= (
      t.target_revenue
      / extract(day from (date_trunc('month', to_timestamp(s.start_time / 1000.0)) + interval '1 month - 1 day'))
    )
  end as is_daily_target_met
from base_shifts s
left join targets t on t.month = s.month_key
left join orders_per_shift o on o.shift_id = s.shift_id
left join daily_income d on d.shift_id = s.shift_id;

grant select on public.pos_shift_reports to anon, authenticated, service_role;

create or replace view public.pos_current_month_progress as
with current_context as (
  select
    current_date::date as current_date_local,
    date_trunc('month', current_date::timestamp) as month_start_ts,
    (date_trunc('month', current_date::timestamp) + interval '1 month') as next_month_start_ts,
    to_char(current_date::date, 'YYYY-MM') as month_key,
    extract(day from (date_trunc('month', current_date::timestamp) + interval '1 month - 1 day'))::numeric as days_in_month,
    extract(day from current_date::date)::numeric as days_passed
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
),
today_transactions as (
  select
    ft.*
  from month_transactions ft
  cross join current_context c
  where to_timestamp(ft.tx_date / 1000.0) >= c.current_date_local::timestamp
    and to_timestamp(ft.tx_date / 1000.0) < c.current_date_local::timestamp + interval '1 day'
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
      and ft.tx_date >= coalesce((select tx_date from latest_modal_awal), extract(epoch from c.current_date_local::timestamp) * 1000)
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

create or replace view public.pos_discounts as
select
  d.source_id as _id,
  d.name,
  d.code,
  d.discount_type as type,
  d.value,
  d.target_type as "targetType",
  d.target_id as "targetId",
  d.target_ids as "targetIds",
  d.formatted_id as "formattedId",
  d.is_active as "isActive",
  d.min_order_value as "minOrderValue",
  d.start_date as "startDate",
  d.end_date as "endDate",
  d.start_time as "startTime",
  d.end_time as "endTime",
  d.days,
  d.is_happy_hour as "isHappyHour",
  d.product_prices as "productPrices",
  d.is_free_refill as "isFreeRefill",
  d.refill_price as "refillPrice",
  d.refill_availability as "refillAvailability",
  d.raw
from pos.discounts d;

grant select on public.pos_discounts to anon, authenticated, service_role;

create or replace view public.pos_staff_roles as
select
  r.source_id as _id,
  trim(r.name) as name,
  r.permissions,
  r.raw -> 'bonusTargetConfig' as "bonusTargetConfig",
  r.raw
from public.yumi_roles r;

grant select on public.pos_staff_roles to anon, authenticated, service_role;

create or replace view public.pos_staff_users as
select
  u.source_id as _id,
  u.username,
  u.name,
  u.role_source_id as "roleId",
  trim(r.name) as "roleName",
  u.slug,
  u.is_active as "isActive",
  u.receive_report_emails as "receiveReportEmails"
from public.yumi_users u
left join public.yumi_roles r on r.source_id = u.role_source_id;

grant select on public.pos_staff_users to anon, authenticated, service_role;
