-- BI-Rate (Bank Indonesia policy rate): history lives in finance.market_prices (code 'bi_rate', one row per Board of Governors decision);
-- this table only schedules the checks and remembers what was announced to users.
create table if not exists finance.rate_state (
  code text primary key,
  checked_at timestamptz,
  last_ok_at timestamptz,
  next_check_at timestamptz not null default now(),
  last_error text,
  notified_day date
);
