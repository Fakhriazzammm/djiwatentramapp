-- Djiwa Pay Kelola: recurring bills, manual assets, and the pocket split.
create table if not exists finance.bills (
  user_id text not null, id text not null,
  name text not null, amount numeric(18,2) not null check (amount > 0), day smallint not null check (day between 1 and 31),
  icon text not null default 'receipt', tone text not null default 'amber', paid jsonb not null default '[]'::jsonb,
  primary key (user_id, id)
);
create table if not exists finance.assets (
  user_id text not null, id text not null,
  name text not null, kind text not null default 'other', value numeric(18,2) not null default 0 check (value >= 0),
  primary key (user_id, id)
);
alter table finance.profiles add column if not exists pockets jsonb not null default '[]'::jsonb;
