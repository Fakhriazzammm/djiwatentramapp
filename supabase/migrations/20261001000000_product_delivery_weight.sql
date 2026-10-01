-- Additive delivery metadata for menu products.
-- Weights are provisional operational estimates in grams and must remain editable in Admin.
-- Event/promo-only products are explicitly excluded from delivery.

alter table pos.products
  add column if not exists delivery_weight_grams numeric(10, 2),
  add column if not exists delivery_weight_source text not null default 'unreviewed',
  add column if not exists delivery_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'pos.products'::regclass
      and conname = 'products_delivery_weight_grams_positive'
  ) then
    alter table pos.products
      add constraint products_delivery_weight_grams_positive
      check (delivery_weight_grams is null or delivery_weight_grams > 0);
  end if;
end $$;

-- Provisional weights for the current catalog. Values are grams including ordinary packaging.
update pos.products set delivery_weight_grams = 600, delivery_weight_source = 'estimated' where name in ('Bubur Ayam Chinese', 'Bubur Ayam Polos', 'Bubur Ayam Tasik', 'Bubur Ayam Western');
update pos.products set delivery_weight_grams = 500, delivery_weight_source = 'estimated' where name = 'Hamburg Sandwich';
update pos.products set delivery_weight_grams = 350, delivery_weight_source = 'estimated' where name in ('Americano Long Black', 'Lemon Americano', 'Tentrem Koffie Classic', 'Tentrem Koffie Premium', 'White / Latte / Magic', 'Dark Chocolate', 'Matcha Premium');
update pos.products set delivery_weight_grams = 1200, delivery_weight_source = 'estimated' where name = 'Tentrem Premium Literan';
update pos.products set delivery_weight_grams = 650, delivery_weight_source = 'estimated' where name in ('Nasi Ayam Charsiu', 'Nasi Ayam Kemangi', 'Nasi Ayam Mentega', 'Nasi Goreng Warman', 'Nasi Hamburg Jepang', 'Nasi Telor Pontianak');
update pos.products set delivery_weight_grams = 550, delivery_weight_source = 'estimated' where name in ('Yamin Charsiu', 'Yamin Hamburg Jepang', 'Yamin Pangsit Goreng', 'Yamin Warman');
update pos.products set delivery_weight_grams = 800, delivery_weight_source = 'estimated' where name in ('Mix Platter Hamburg', 'Mix Platter Warman');
update pos.products set delivery_weight_grams = 300, delivery_weight_source = 'estimated' where name in ('Banana Bread', 'Cinnamon Girl', 'Peach Tea', 'Lemon Tea');
update pos.products set delivery_weight_grams = 600, delivery_weight_source = 'estimated' where name = 'Air Mineral';
update pos.products set delivery_weight_grams = 1000, delivery_weight_source = 'estimated' where name = 'Mie Mentah Kiloan Djiwa Tentram';
update pos.products set delivery_weight_grams = 100, delivery_weight_source = 'estimated' where name = 'Bag Charm Large';
update pos.products set delivery_weight_grams = 70, delivery_weight_source = 'estimated' where name = 'Bag Charm Small';
update pos.products set delivery_weight_grams = 50, delivery_weight_source = 'estimated' where name in ('Gantungan Boneka', 'Gantungan Kunci');
update pos.products set delivery_weight_grams = 30, delivery_weight_source = 'estimated' where name in ('Gelang', 'Jedai', 'Stiker');
update pos.products set delivery_weight_grams = 500, delivery_weight_source = 'estimated' where name = 'Mug Pouch';
update pos.products set delivery_weight_grams = 250, delivery_weight_source = 'estimated' where name in ('Pouch', 'Pouch B');

update pos.products set delivery_weight_grams = 350, delivery_weight_source = 'estimated' where name in ('Apple Martha', 'Cold Brew', 'Peach Americano');
update pos.products set delivery_weight_grams = 300, delivery_weight_source = 'estimated' where name in ('Fudgy Brownies', 'Ubi Creme Brulle');
update pos.products set delivery_weight_grams = 650, delivery_weight_source = 'estimated' where name like 'Paket Ramadhan |%';

update pos.products set delivery_enabled = false, delivery_weight_grams = null, delivery_weight_source = 'not_deliverable' where name in ('Pre-Wedding Photoshoot', 'Promo Follow Instagram', 'Promo Story Instagram');

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
  nutrition,
  delivery_weight_grams as "deliveryWeightGrams",
  delivery_weight_source as "deliveryWeightSource",
  delivery_enabled as "deliveryEnabled"
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
  nutrition,
  delivery_weight_grams as "deliveryWeightGrams",
  delivery_weight_source as "deliveryWeightSource",
  delivery_enabled as "deliveryEnabled"
from pos.products;

grant select on public.pos_products to anon, authenticated;
grant select on public.pos_products_all to anon, authenticated;
notify pgrst, 'reload schema';
