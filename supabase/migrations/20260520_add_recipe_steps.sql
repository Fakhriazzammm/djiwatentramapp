-- Add steps JSONB column to pos.recipes
alter table if exists pos.recipes
  add column if not exists steps jsonb not null default '[]'::jsonb;

-- Add steps JSONB column to pos.base_recipes
alter table if exists pos.base_recipes
  add column if not exists steps jsonb not null default '[]'::jsonb;

-- Recreate public view for pos_recipes with steps column
create or replace view public.pos_recipes
with (security_invoker = true) as
select
  source_id as _id,
  product_source_id as "productId",
  variant_name as "variantName",
  ingredients,
  steps,
  raw
from pos.recipes;

-- Recreate public view for pos_base_recipes with steps column
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
  steps,
  raw
from pos.base_recipes;
