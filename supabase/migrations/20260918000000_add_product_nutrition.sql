-- Additive nutrition contract for customer product details.
-- Values remain nullable until reviewed recipe/grammage data is available.

alter table pos.products
  add column if not exists nutrition jsonb;

create or replace view public.pos_products as
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
  variations,
  nutrition
from pos.products
where is_available = true;

create or replace view public.pos_products_all as
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
  variations,
  is_ala_carte as "isAlaCarte",
  nutrition
from pos.products;

grant select on public.pos_products to anon, authenticated;
grant select on public.pos_products_all to anon, authenticated;

notify pgrst, 'reload schema';
