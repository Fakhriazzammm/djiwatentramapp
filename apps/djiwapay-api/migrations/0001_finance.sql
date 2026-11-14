-- Djiwa Pay finance (personal money records). Schema isolated from wallet/auth.
create schema if not exists finance;

create table if not exists finance.profiles (
  user_id text primary key,
  onboarded boolean not null default false,
  version bigint not null default 0,
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists finance.accounts (
  user_id text not null, id text not null,
  name text not null, type text not null default 'cash', opening numeric(18,2) not null default 0, archived boolean not null default false,
  primary key (user_id, id)
);
create table if not exists finance.categories (
  user_id text not null, id text not null,
  name text not null, icon text not null default 'tag', tone text not null default 'slate', income boolean not null default false, custom boolean not null default false,
  primary key (user_id, id)
);
create table if not exists finance.receipts (
  user_id text not null, id text not null,
  status text not null default 'ready' check (status in ('ready','failed')),
  merchant text, purchased_at timestamptz, total numeric(18,2), tax numeric(18,2),
  confidence real, items jsonb not null default '[]'::jsonb, model text,
  image_path text, image_bytes integer, created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists finance.entries (
  user_id text not null, id text not null,
  kind text not null check (kind in ('out','in','tf')),
  amount numeric(18,2) not null check (amount > 0),
  category_id text not null, account_id text not null, to_account_id text,
  at timestamptz not null, note text not null default '', tags text[] not null default '{}',
  source text not null default 'manual', receipt_id text, created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists entries_user_at on finance.entries (user_id, at desc);
create table if not exists finance.budgets (
  user_id text not null, category_id text not null, limit_amount numeric(18,2) not null check (limit_amount > 0), rollover boolean not null default false,
  primary key (user_id, category_id)
);
create table if not exists finance.goals (
  user_id text not null, id text not null,
  name text not null, target numeric(18,2) not null, deposits jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists finance.debts (
  user_id text not null, id text not null,
  person text not null, direction text not null check (direction in ('owed_to_me','i_owe')), amount numeric(18,2) not null,
  note text not null default '', due text, settled boolean not null default false, created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists finance.scan_usage (
  user_id text not null, day date not null default current_date, scans integer not null default 0,
  primary key (user_id, day)
);
