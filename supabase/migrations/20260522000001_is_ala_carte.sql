-- ============================================================================
-- 20260522000001_is_ala_carte.sql
-- Add is_ala_carte column to pos.products and update pos_products_all view
-- ============================================================================
-- To deploy:   supabase db query --linked --file supabase/migrations/20260522000001_is_ala_carte.sql
-- Or via:      psql "$SUPABASE_DATABASE_URL" -f supabase/migrations/20260522000001_is_ala_carte.sql
-- ============================================================================

-- 1. Add is_ala_carte column to pos.products (boolean, default false)
alter table pos.products
  add column if not exists is_ala_carte boolean not null default false;

-- 2. Update pos_products_all view to include is_ala_carte
-- Note: security_invoker was already set to false in migration 0015,
-- so CREATE OR REPLACE VIEW works without needing ALTER VIEW.
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
  is_ala_carte as "isAlaCarte"
from pos.products;

-- 3. Re-grant permissions (preserve existing access)
grant select on public.pos_products_all to anon, authenticated;

-- 4. Force PostgREST schema cache refresh
notify pgrst, 'reload schema';
