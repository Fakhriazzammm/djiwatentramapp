-- Saham (Indonesian stocks) tracking. Trades live here; prices come from the user's own Google Sheet (GOOGLEFINANCE).
create table if not exists finance.stock_settings (
  user_id text primary key,
  activated_at timestamptz not null default now(),
  fee_buy numeric(6,4) not null default 0.15 check (fee_buy >= 0 and fee_buy <= 5),     -- percent
  fee_sell numeric(6,4) not null default 0.35 check (fee_sell >= 0 and fee_sell <= 5),  -- percent, income tax included
  dirty boolean not null default true,            -- trades changed: rewrite the Saham tabs
  recalc boolean not null default false,          -- "Segarkan": re-enter the price formulas so Sheets recalculates
  settle integer not null default 0,              -- quick re-reads left after a write, while formulas finish loading
  sheet_id text,                                  -- spreadsheet the tabs were last written to
  sheet_ready boolean not null default false,
  last_error text,
  last_synced_at timestamptz,
  refresh_requested_at timestamptz,
  next_sync_at timestamptz not null default now()
);
create index if not exists stock_settings_due on finance.stock_settings (next_sync_at);

create table if not exists finance.stock_trades (
  user_id text not null,
  id text not null,
  ticker text not null check (ticker ~ '^[A-Z]{4}$'),
  side text not null check (side in ('buy','sell')),
  lots integer not null check (lots > 0 and lots <= 1000000),
  price numeric(14,2) not null check (price > 0),
  fee numeric(16,2) not null default 0,
  at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists stock_trades_user_at on finance.stock_trades (user_id, at, created_at);

create table if not exists finance.stock_prices (
  user_id text not null,
  ticker text not null check (ticker ~ '^[A-Z]{4}$'),
  price numeric(14,2),            -- last value read from the sheet
  as_of timestamptz,              -- GOOGLEFINANCE tradetime
  checked_at timestamptz,         -- when the app last read the sheet
  manual_price numeric(14,2),     -- the user's own price when Google has no data
  primary key (user_id, ticker)
);
