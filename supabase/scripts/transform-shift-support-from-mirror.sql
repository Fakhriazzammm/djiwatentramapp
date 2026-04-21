insert into pos.financial_targets (
  source_id,
  month,
  target_revenue,
  target_profit,
  created_at,
  updated_at,
  creation_time,
  raw
)
select
  document_id,
  document->>'month',
  coalesce((nullif(document->>'targetRevenue', ''))::numeric, 0),
  (nullif(document->>'targetProfit', ''))::numeric,
  (nullif(document->>'createdAt', ''))::double precision,
  (nullif(document->>'updatedAt', ''))::double precision,
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'financialTargets'
on conflict (source_id) do update
set
  month = excluded.month,
  target_revenue = excluded.target_revenue,
  target_profit = excluded.target_profit,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.shifts (
  source_id,
  shift_name,
  cashier_name,
  team_members,
  start_time,
  end_time,
  starting_cash,
  notes,
  summary,
  cash_breakdown,
  non_cash_expected,
  non_cash_confirmed,
  ending_cash_expected,
  ending_cash_physical,
  creation_time,
  raw
)
select
  document_id,
  coalesce(nullif(document->>'shiftName', ''), 'Shift'),
  nullif(document->>'cashierName', ''),
  nullif(document->>'teamMembers', ''),
  coalesce((nullif(document->>'startTime', ''))::double precision, creation_time),
  (nullif(document->>'endTime', ''))::double precision,
  coalesce((nullif(document->>'startingCash', ''))::numeric, 0),
  nullif(document->>'notes', ''),
  case
    when jsonb_typeof(document->'summary') = 'object' then document->'summary'
    else '{}'::jsonb
  end,
  case
    when jsonb_typeof(document->'cashBreakdown') = 'object' then document->'cashBreakdown'
    else '{}'::jsonb
  end,
  (nullif(document->>'nonCashExpected', ''))::numeric,
  (nullif(document->>'nonCashConfirmed', ''))::numeric,
  (nullif(document->>'endingCashExpected', ''))::numeric,
  (nullif(document->>'endingCashPhysical', ''))::numeric,
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'shifts'
on conflict (source_id) do update
set
  shift_name = excluded.shift_name,
  cashier_name = excluded.cashier_name,
  team_members = excluded.team_members,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  starting_cash = excluded.starting_cash,
  notes = excluded.notes,
  summary = excluded.summary,
  cash_breakdown = excluded.cash_breakdown,
  non_cash_expected = excluded.non_cash_expected,
  non_cash_confirmed = excluded.non_cash_confirmed,
  ending_cash_expected = excluded.ending_cash_expected,
  ending_cash_physical = excluded.ending_cash_physical,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

