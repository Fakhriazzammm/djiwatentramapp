-- Foreign receipts: the entry keeps the rupiah amount (everything else is computed from it) and remembers what was actually paid.
alter table finance.entries add column if not exists foreign_currency text;
alter table finance.entries add column if not exists foreign_amount numeric(18,2);
alter table finance.entries add column if not exists fx_rate numeric(18,6);
-- A wallet can be held in another currency (yen cash, a transit card, a travel debit card). Entries still count in rupiah.
alter table finance.accounts add column if not exists currency text;
-- Same photo twice: found by its fingerprint.
alter table finance.receipts add column if not exists image_sha text;
create index if not exists receipts_image_sha_idx on finance.receipts (user_id, image_sha);
-- Daily reference rates, kept so an old entry never changes when the rate does.
create table if not exists finance.fx_rates (
  day date not null, currency text not null, rate numeric(18,6) not null check (rate > 0), source text not null default 'frankfurter',
  fetched_at timestamptz not null default now(), primary key (day, currency)
);
