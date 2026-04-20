insert into pos.inventory_stores (
  source_id,
  name,
  store_type,
  phone,
  address,
  notes,
  is_active,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'name', ''),
  coalesce(nullif(document->>'type', ''), 'store'),
  nullif(document->>'phone', ''),
  nullif(document->>'address', ''),
  nullif(document->>'notes', ''),
  coalesce((nullif(document->>'isActive', ''))::boolean, true),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'inventoryStores'
on conflict (source_id) do update
set
  name = excluded.name,
  store_type = excluded.store_type,
  phone = excluded.phone,
  address = excluded.address,
  notes = excluded.notes,
  is_active = excluded.is_active,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.recipes (
  source_id,
  product_source_id,
  variant_name,
  ingredients,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'productId', ''),
  nullif(document->>'variantName', ''),
  coalesce(document->'ingredients', '[]'::jsonb),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'recipes'
on conflict (source_id) do update
set
  product_source_id = excluded.product_source_id,
  variant_name = excluded.variant_name,
  ingredients = excluded.ingredients,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

insert into pos.base_recipes (
  source_id,
  name,
  description,
  category,
  target_unit,
  target_quantity,
  ingredients,
  creation_time,
  raw
)
select
  document_id,
  coalesce(document->>'name', ''),
  nullif(document->>'description', ''),
  nullif(document->>'category', ''),
  coalesce(nullif(document->>'targetUnit', ''), 'unit'),
  coalesce((nullif(document->>'targetQuantity', ''))::numeric, 0),
  coalesce(document->'ingredients', '[]'::jsonb),
  creation_time,
  document
from legacy_mirror.documents
where table_name = 'baseRecipes'
on conflict (source_id) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  target_unit = excluded.target_unit,
  target_quantity = excluded.target_quantity,
  ingredients = excluded.ingredients,
  creation_time = excluded.creation_time,
  raw = excluded.raw;

