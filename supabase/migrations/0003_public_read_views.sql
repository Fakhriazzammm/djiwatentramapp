create or replace view public.pos_site_settings
with (security_invoker = true) as
select
  source_id as _id,
  raw
from pos.site_settings;

create or replace view public.pos_categories
with (security_invoker = true) as
select
  source_id as _id,
  name,
  display_order as "displayOrder",
  parent_source_id as "parentId",
  track
from pos.categories;

create or replace view public.pos_products
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
from pos.products
where is_available = true;

create or replace view public.pos_active_discounts
with (security_invoker = true) as
select
  source_id as _id,
  name,
  code,
  discount_type as "type",
  value,
  target_type as "targetType",
  target_id as "targetId",
  target_ids as "targetIds",
  formatted_id as "formattedId",
  is_active as "isActive",
  min_order_value as "minOrderValue",
  start_date as "startDate",
  end_date as "endDate",
  start_time as "startTime",
  end_time as "endTime",
  days,
  is_happy_hour as "isHappyHour",
  product_prices as "productPrices",
  is_free_refill as "isFreeRefill",
  refill_price as "refillPrice",
  refill_availability as "refillAvailability"
from pos.discounts
where is_active = true;

grant select on public.pos_site_settings to anon, authenticated;
grant select on public.pos_categories to anon, authenticated;
grant select on public.pos_products to anon, authenticated;
grant select on public.pos_active_discounts to anon, authenticated;
