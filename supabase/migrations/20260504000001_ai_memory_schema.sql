-- AI Memory System: item→category learning, merchant profiles, price history, feedback log
-- Part of Yumi Finance Agent continuous learning

-- 1. Item Category Memory
create table if not exists pos.item_category_memory (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  category_key text not null,
  confidence float not null default 0,
  source text not null default 'ai',
  occurrence_count int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create unique index if not exists item_category_memory_unique_idx
  on pos.item_category_memory (item_name_normalized, category_key);
create index if not exists item_category_memory_name_idx
  on pos.item_category_memory (item_name_normalized);
create index if not exists item_category_memory_conf_idx
  on pos.item_category_memory (confidence desc);

-- 2. Merchant Profiles
create table if not exists pos.merchant_profiles (
  id bigint primary key generated always as identity,
  merchant_name text not null,
  merchant_name_normalized text not null,
  typical_categories jsonb not null default '{}',
  typical_items jsonb not null default '[]',
  total_receipts int not null default 0,
  avg_receipt_amount float not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create unique index if not exists merchant_profiles_name_idx
  on pos.merchant_profiles (merchant_name_normalized);
create index if not exists merchant_profiles_cat_idx
  on pos.merchant_profiles using gin (typical_categories);

-- 3. Price History
create table if not exists pos.price_history (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  merchant_name text,
  price float not null,
  quantity float not null default 1,
  unit text,
  receipt_date date,
  receipt_id text,
  category_key text,
  created_at timestamptz not null default now()
);
create index if not exists price_history_item_idx
  on pos.price_history (item_name_normalized, receipt_date desc);
create index if not exists price_history_merchant_idx
  on pos.price_history (merchant_name);

-- 4. Category Feedback Log
create table if not exists pos.category_feedback_log (
  id bigint primary key generated always as identity,
  item_name text not null,
  item_name_normalized text not null,
  original_category text,
  corrected_category text,
  merchant_name text,
  receipt_date date,
  feedback_type text not null default 'correction',
  created_at timestamptz not null default now()
);
create index if not exists feedback_log_item_idx
  on pos.category_feedback_log (item_name_normalized);
create index if not exists feedback_log_date_idx
  on pos.category_feedback_log (created_at desc);

-- RLS: allow anon insert + select (bot uses anon key via service role for writes)
alter table pos.item_category_memory enable row level security;
alter table pos.merchant_profiles enable row level security;
alter table pos.price_history enable row level security;
alter table pos.category_feedback_log enable row level security;

create policy "memory_public_all" on pos.item_category_memory for all to anon, authenticated using (true) with check (true);
create policy "merchant_public_all" on pos.merchant_profiles for all to anon, authenticated using (true) with check (true);
create policy "price_public_all" on pos.price_history for all to anon, authenticated using (true) with check (true);
create policy "feedback_public_all" on pos.category_feedback_log for all to anon, authenticated using (true) with check (true);

grant all on pos.item_category_memory to anon, authenticated;
grant all on pos.merchant_profiles to anon, authenticated;
grant all on pos.price_history to anon, authenticated;
grant all on pos.category_feedback_log to anon, authenticated;

-- Grant usage on sequences for insert
grant usage on sequence pos.item_category_memory_id_seq to anon, authenticated;
grant usage on sequence pos.merchant_profiles_id_seq to anon, authenticated;
grant usage on sequence pos.price_history_id_seq to anon, authenticated;
grant usage on sequence pos.category_feedback_log_id_seq to anon, authenticated;
