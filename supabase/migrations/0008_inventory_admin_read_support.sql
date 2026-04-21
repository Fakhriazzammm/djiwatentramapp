create table if not exists pos.inventory_stores (
  source_id text primary key,
  name text not null,
  store_type text not null default 'store',
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_inventory_stores_name
  on pos.inventory_stores (name);

create table if not exists pos.recipes (
  source_id text primary key,
  product_source_id text not null,
  variant_name text,
  ingredients jsonb not null default '[]'::jsonb,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_recipes_product_source_id
  on pos.recipes (product_source_id);

create table if not exists pos.base_recipes (
  source_id text primary key,
  name text not null,
  description text,
  category text,
  target_unit text not null,
  target_quantity numeric(18,4) not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_base_recipes_name
  on pos.base_recipes (name);

create or replace view public.pos_inventory_stores
with (security_invoker = true) as
select
  source_id as _id,
  name,
  store_type as type,
  phone,
  address,
  notes,
  is_active as "isActive",
  raw
from pos.inventory_stores
where is_active = true;

create or replace view public.pos_recipes
with (security_invoker = true) as
select
  source_id as _id,
  product_source_id as "productId",
  variant_name as "variantName",
  ingredients,
  raw
from pos.recipes;

create or replace view public.pos_base_recipes
with (security_invoker = true) as
select
  source_id as _id,
  name,
  description,
  category,
  target_unit as "targetUnit",
  target_quantity as "targetQuantity",
  ingredients,
  raw
from pos.base_recipes;

create or replace view public.pos_inventory_transactions
with (security_invoker = true) as
select
  source_id as _id,
  inventory_source_id as "inventoryId",
  quantity,
  tx_type as type,
  cost_per_unit as "costPerUnit",
  remaining_quantity as "remainingQuantity",
  tx_timestamp as timestamp,
  notes,
  expiry_date as "expiryDate",
  brand_name as "brandName",
  store_source_id as "storeId",
  purchase_unit as "purchaseUnit",
  purchase_quantity as "purchaseQuantity",
  line_total as "lineTotal",
  source_transaction_id as "sourceTransactionId",
  source_label as "sourceLabel",
  source_fingerprint as "sourceFingerprint",
  raw
from pos.inventory_transactions;

grant select on public.pos_inventory_stores to anon, authenticated;
grant select on public.pos_recipes to anon, authenticated;
grant select on public.pos_base_recipes to anon, authenticated;
grant select on public.pos_inventory_transactions to anon, authenticated;
