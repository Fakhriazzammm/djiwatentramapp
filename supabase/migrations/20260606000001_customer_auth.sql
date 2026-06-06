-- Customer Auth — Email/Password dengan Supabase Auth
-- Migration: pos.customers, pos.customer_point_ledger, pos_customers_view, pos.orders.customer_source_id
-- 
-- Dijalankan via: supabase migration up

-- ============================================================
-- 1. Tabel Customer
-- ============================================================
create table if not exists pos.customers (
  source_id       text primary key,          -- auth.users.id
  email           text,
  name            text,
  phone           text,
  photo_url       text,
  total_points    bigint default 0,
  lifetime_points bigint default 0,          -- total earned (never decreases)
  total_orders    int default 0,
  total_spent     numeric(12,0) default 0,
  last_order_at   timestamptz,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  raw             jsonb
);

-- ============================================================
-- 2. Tabel Point Ledger
-- ============================================================
create table if not exists pos.customer_point_ledger (
  id              bigserial primary key,
  customer_id     text not null references pos.customers(source_id),
  points          int not null,              -- + earn, - redeem
  balance_after   int not null,              -- snapshot after tx
  reason          text not null,             -- 'order', 'signup_bonus', 'redeem'
  reference_id    text,                      -- order_id
  note            text,
  created_at      timestamptz default now()
);

-- ============================================================
-- 3. Public View (customer read own data / admin read all)
-- ============================================================
create or replace view public.pos_customers_view as
select
  c.source_id,
  c.email,
  c.name,
  c.phone,
  c.photo_url,
  c.total_points,
  c.lifetime_points,
  c.total_orders,
  c.total_spent,
  c.last_order_at,
  c.created_at
from pos.customers c
where c.is_active = true;

-- ============================================================
-- 4. Tambah kolom di pos.orders
-- ============================================================
alter table pos.orders add column if not exists customer_source_id text;

-- ============================================================
-- 5. Grants
-- ============================================================
grant usage on schema pos to anon, authenticated;
grant select on public.pos_customers_view to anon, authenticated;
grant insert, update on pos.customers to authenticated;
grant select on pos.customer_point_ledger to authenticated;
grant insert on pos.customer_point_ledger to authenticated;
