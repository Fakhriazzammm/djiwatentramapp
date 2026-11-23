-- Temuan otomatis: what the person decided about each suggestion (new wallet, recurring bill, price change...).
-- The suggestions themselves are computed from the records; only the answer is stored, so nothing is asked twice and every device agrees.
create table if not exists finance.discovery_decisions (
  user_id text not null, key text not null,
  status text not null check (status in ('saved','dismissed','snoozed')),
  until timestamptz, decided_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- A wallet the person merged into another one: later mail for the old address keeps landing in the wallet they chose instead of recreating it.
create table if not exists finance.account_alias (
  user_id text not null, from_id text not null, to_id text not null, created_at timestamptz not null default now(),
  primary key (user_id, from_id)
);
