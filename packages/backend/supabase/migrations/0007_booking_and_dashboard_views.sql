create table if not exists pos.booking_settings (
  source_id text primary key,
  slug text not null,
  title text not null,
  description text,
  logo_url text,
  banner_url text,
  theme_color text,
  social_links jsonb,
  featured_product_ids jsonb,
  payment_methods jsonb,
  bank_details text,
  qris_image text,
  is_active boolean not null default false,
  custom_fields jsonb,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_booking_settings_slug
  on pos.booking_settings (slug);

create table if not exists pos.booking_date_capacity (
  source_id text primary key,
  slug text not null,
  booking_date text not null,
  max_people integer not null default 0,
  max_tables integer not null default 0,
  people_per_table integer not null default 4,
  notes text,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_pos_booking_date_capacity_slug_and_booking_date
  on pos.booking_date_capacity (slug, booking_date);

create table if not exists pos.booking_orders (
  source_id text primary key,
  slug text not null,
  booking_code text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  notes text,
  booking_date text not null,
  total_amount numeric(18,2) not null default 0,
  payment_method text,
  payment_status text,
  booking_status text,
  guest_count integer,
  table_count integer,
  payment_proof_image text,
  transferred_amount numeric(18,2),
  custom_answers jsonb,
  created_at double precision,
  creation_time double precision,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_pos_booking_orders_slug
  on pos.booking_orders (slug);

create index if not exists idx_pos_booking_orders_slug_and_booking_date
  on pos.booking_orders (slug, booking_date);

create index if not exists idx_pos_booking_orders_created_at
  on pos.booking_orders (created_at desc);

create table if not exists pos.booking_order_items (
  id bigserial primary key,
  booking_order_source_id text not null,
  line_no integer not null,
  product_source_id text,
  product_name text,
  price numeric(18,2) not null default 0,
  quantity numeric(18,4) not null default 0,
  raw jsonb not null,
  unique (booking_order_source_id, line_no)
);

create index if not exists idx_pos_booking_order_items_booking_order_source_id
  on pos.booking_order_items (booking_order_source_id);

create or replace view public.pos_products_all
with (security_invoker = true) as
select
  source_id as _id,
  category_source_id as "categoryId",
  name,
  description,
  price,
  promo_price as "promoPrice",
  image,
  is_available as "isAvailable",
  quantity,
  menu_number as "menuNumber",
  variations
from pos.products;

create or replace view public.pos_financial_transactions
with (security_invoker = true) as
select
  source_id as _id,
  tx_type as type,
  amount,
  category,
  merchant,
  description,
  tx_date as date,
  payment_method as "paymentMethod",
  status,
  order_source_id as "orderId",
  booking_order_source_id as "bookingOrderId",
  attachment_url as "attachmentUrl",
  source_fingerprint as "sourceFingerprint",
  is_recurring as "isRecurring",
  recurring_interval as "recurringInterval",
  tags,
  metadata
from pos.financial_transactions;

create or replace view public.pos_booking_orders
with (security_invoker = true) as
select
  bo.source_id as _id,
  coalesce(bo.creation_time, bo.created_at) as "_creationTime",
  bo.slug,
  bo.booking_code as "bookingCode",
  bo.customer_name as "customerName",
  bo.customer_phone as "customerPhone",
  bo.customer_email as "customerEmail",
  bo.notes,
  bo.booking_date as "bookingDate",
  bo.total_amount as "totalAmount",
  bo.payment_method as "paymentMethod",
  bo.payment_status as "paymentStatus",
  bo.booking_status as "bookingStatus",
  bo.guest_count as "guestCount",
  bo.table_count as "tableCount",
  bo.payment_proof_image as "paymentProofImage",
  bo.transferred_amount as "transferredAmount",
  bo.custom_answers as "customAnswers",
  bo.created_at as "createdAt",
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'productId', boi.product_source_id,
          'name', boi.product_name,
          'price', boi.price,
          'quantity', boi.quantity
        )
        order by boi.line_no
      )
      from pos.booking_order_items boi
      where boi.booking_order_source_id = bo.source_id
    ),
    '[]'::jsonb
  ) as items
from pos.booking_orders bo;

create or replace view public.pos_booking_settings
with (security_invoker = true) as
select
  source_id as _id,
  slug,
  title,
  description,
  logo_url as "logoUrl",
  banner_url as "bannerUrl",
  theme_color as "themeColor",
  social_links as "socialLinks",
  featured_product_ids as "featuredProductIds",
  payment_methods as "paymentMethods",
  bank_details as "bankDetails",
  qris_image as "qrisImage",
  is_active as "isActive",
  custom_fields as "customFields",
  raw
from pos.booking_settings;

create or replace view public.pos_booking_date_capacity
with (security_invoker = true) as
select
  source_id as _id,
  slug,
  booking_date as date,
  max_people as "maxPeople",
  max_tables as "maxTables",
  people_per_table as "peoplePerTable",
  notes
from pos.booking_date_capacity;

create or replace view public.pos_shifts
with (security_invoker = true) as
select
  source_id as _id,
  shift_name as "shiftName",
  cashier_name as "cashierName",
  team_members as "teamMembers",
  start_time as "startTime",
  end_time as "endTime",
  starting_cash as "startingCash",
  notes,
  summary,
  cash_breakdown as "cashBreakdown",
  non_cash_expected as "nonCashExpected",
  non_cash_confirmed as "nonCashConfirmed",
  ending_cash_expected as "endingCashExpected",
  ending_cash_physical as "endingCashPhysical",
  raw
from pos.shifts;

grant select on public.pos_products_all to anon, authenticated;
grant select on public.pos_financial_transactions to anon, authenticated;
grant select on public.pos_booking_orders to anon, authenticated;
grant select on public.pos_booking_settings to anon, authenticated;
grant select on public.pos_booking_date_capacity to anon, authenticated;
grant select on public.pos_shifts to anon, authenticated;
