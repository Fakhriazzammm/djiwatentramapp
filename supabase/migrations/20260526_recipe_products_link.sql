-- ============================================================================
-- 20260526_recipe_products_link.sql
-- Linking recipe ↔ products via N:N mapping table + sub_category column
-- ============================================================================
-- To deploy:   supabase db query --linked --file supabase/migrations/20260526_recipe_products_link.sql
-- Or via:      psql "$SUPABASE_DATABASE_URL" -f supabase/migrations/20260526_recipe_products_link.sql
-- ============================================================================

-- 1. Add sub_category column to pos.products (idempotent)
alter table pos.products
  add column if not exists sub_category text;

-- 2. Create N:N linking table between recipes and products
--    Uses source_id (actual PK column) for both foreign keys.
--    NOTE: The public views alias source_id as _id, but the underlying
--    table column is source_id.
--    Table name is pos.recipes (plural), not pos.recipe (singular).
create table if not exists pos.recipe_products (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references pos.recipes(source_id) on delete cascade,
  product_id text not null references pos.products(source_id) on delete cascade,
  created_at timestamptz default now(),
  unique(recipe_id, product_id)
);

-- 3. Create view for easy querying with joined product info
create or replace view pos.recipe_products_view as
select
  rp.recipe_id,
  rp.product_id,
  p.name as product_name,
  p.price as product_price,
  p.category_source_id as product_category
from pos.recipe_products rp
join pos.products p on rp.product_id = p.source_id;

-- 4. Grant access for frontend (Supabase anon/authenticated roles)
grant all on table pos.recipe_products to authenticated, anon, service_role;

-- 5. Force PostgREST schema cache refresh
notify pgrst, 'reload schema';
