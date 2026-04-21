create schema if not exists pos;

create table if not exists pos.categories (
  source_id text primary key,
  name text not null,
  display_order integer not null default 0,
  parent_source_id text,
  track text,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_categories_parent_source_id
  on pos.categories (parent_source_id);

create table if not exists pos.products (
  source_id text primary key,
  category_source_id text,
  name text not null,
  description text,
  price numeric(18,2) not null default 0,
  promo_price numeric(18,2),
  image text,
  is_available boolean not null default true,
  quantity numeric(18,4),
  menu_number integer,
  variations jsonb,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_products_category_source_id
  on pos.products (category_source_id);

create index if not exists idx_pos_products_is_available
  on pos.products (is_available);

create table if not exists pos.inventory (
  source_id text primary key,
  ingredient_name text not null,
  unit text not null,
  quantity numeric(18,4) not null default 0,
  low_stock_threshold numeric(18,4) not null default 0,
  display_unit text,
  conversion_factor numeric(18,6),
  unit_conversions jsonb,
  base_recipe_source_id text,
  default_brand_name text,
  preferred_store_source_id text,
  preferred_purchase_quantity numeric(18,4),
  preferred_purchase_unit text,
  aliases jsonb,
  last_purchase_price numeric(18,2),
  last_purchase_at double precision,
  last_purchase_store_source_id text,
  creation_time double precision,
  raw jsonb not null
);

create table if not exists pos.inventory_transactions (
  source_id text primary key,
  inventory_source_id text not null,
  quantity numeric(18,4) not null default 0,
  tx_type text not null,
  cost_per_unit numeric(18,4),
  remaining_quantity numeric(18,4),
  tx_timestamp double precision,
  notes text,
  expiry_date double precision,
  brand_name text,
  store_source_id text,
  purchase_unit text,
  purchase_quantity numeric(18,4),
  line_total numeric(18,2),
  source_transaction_id text,
  source_label text,
  source_fingerprint text,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_inventory_transactions_inventory_source_id
  on pos.inventory_transactions (inventory_source_id);

create index if not exists idx_pos_inventory_transactions_tx_timestamp
  on pos.inventory_transactions (tx_timestamp);

create table if not exists pos.orders (
  source_id text primary key,
  order_number text,
  total_amount numeric(18,2) not null default 0,
  status text,
  payment_method text,
  customer_name text,
  table_number text,
  order_type text,
  source text,
  brand_slug text,
  guest_count integer,
  free_refill_selected boolean,
  dessert_later boolean,
  notes text,
  created_at double precision,
  voucher_source_id text,
  discount_amount numeric(18,2),
  tax_amount numeric(18,2),
  service_charge_amount numeric(18,2),
  receipt_meta jsonb,
  payment_receipt_kind text,
  payment_gateway jsonb,
  gateway_invoice_id text,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_orders_created_at
  on pos.orders (created_at);

create index if not exists idx_pos_orders_status
  on pos.orders (status);

create table if not exists pos.order_items (
  id bigserial primary key,
  order_source_id text not null,
  line_no integer not null,
  product_source_id text,
  product_name text,
  variant text,
  quantity numeric(18,4) not null default 0,
  price numeric(18,2) not null default 0,
  original_price numeric(18,2),
  status text,
  hpp_snapshot jsonb,
  raw jsonb not null,
  unique (order_source_id, line_no)
);

create index if not exists idx_pos_order_items_order_source_id
  on pos.order_items (order_source_id);

create table if not exists pos.financial_transactions (
  source_id text primary key,
  tx_type text not null,
  amount numeric(18,2) not null default 0,
  category text,
  merchant text,
  description text,
  tx_date double precision,
  payment_method text,
  status text,
  order_source_id text,
  booking_order_source_id text,
  attachment_url text,
  source_fingerprint text,
  is_recurring boolean,
  recurring_interval text,
  tags jsonb,
  metadata jsonb,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_financial_transactions_tx_date
  on pos.financial_transactions (tx_date);

create index if not exists idx_pos_financial_transactions_tx_type
  on pos.financial_transactions (tx_type);

create table if not exists pos.discounts (
  source_id text primary key,
  name text not null,
  code text,
  discount_type text,
  value numeric(18,4) not null default 0,
  target_type text,
  target_id text,
  target_ids jsonb,
  formatted_id text,
  is_active boolean not null default false,
  min_order_value numeric(18,2),
  start_date double precision,
  end_date double precision,
  start_time text,
  end_time text,
  days jsonb,
  is_happy_hour boolean,
  product_prices jsonb,
  is_free_refill boolean,
  refill_price numeric(18,2),
  refill_availability text,
  creation_time double precision,
  raw jsonb not null
);

create index if not exists idx_pos_discounts_is_active
  on pos.discounts (is_active);

create table if not exists pos.site_settings (
  source_id text primary key,
  store_name text,
  store_address text,
  store_phone text,
  app_name text,
  app_version text,
  tax_rate numeric(10,4),
  service_charge_rate numeric(10,4),
  creation_time double precision,
  raw jsonb not null
);

create table if not exists pos.migration_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source text not null,
  upserted_count integer not null default 0,
  failed_count integer not null default 0,
  notes text
);
