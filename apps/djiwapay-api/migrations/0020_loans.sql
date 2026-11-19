-- Loans and instalment credit (KPR, vehicle, multi-purpose...). The balance is the running principal still owed; payments keep the history.
create table if not exists finance.loans (
  user_id text not null, id text not null,
  name text not null, kind text not null default 'lainnya', lender text not null default '',
  model text not null default 'anuitas' check (model in ('anuitas','flat','syariah')),
  principal numeric(18,2) not null check (principal > 0), months integer not null check (months between 1 and 600),
  start_date text, due_day smallint not null default 1 check (due_day between 1 and 31),
  fixed_rate numeric(7,3) not null default 0, fixed_months integer not null default 0, float_rate numeric(7,3) not null default 0,
  balance numeric(18,2) not null default 0, paid integer not null default 0, installment numeric(18,2),
  payments jsonb not null default '[]'::jsonb, bill_id text, note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
