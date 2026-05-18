-- Add image_path column to pos.inventory
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Recreate view with new columns appended at end (preserves existing column order)
DROP VIEW IF EXISTS public.pos_inventory CASCADE;

CREATE VIEW public.pos_inventory WITH (security_invoker = true) AS
SELECT
  source_id AS _id,
  ingredient_name AS "ingredientName",
  unit,
  quantity,
  low_stock_threshold AS "lowStockThreshold",
  display_unit AS "displayUnit",
  conversion_factor AS "conversionFactor",
  unit_conversions AS "unitConversions",
  base_recipe_source_id AS "baseRecipeId",
  default_brand_name AS "defaultBrandName",
  preferred_store_source_id AS "preferredStoreId",
  preferred_purchase_quantity AS "preferredPurchaseQuantity",
  preferred_purchase_unit AS "preferredPurchaseUnit",
  last_purchase_price AS "lastPurchasePrice",
  last_purchase_at AS "lastPurchaseAt",
  last_purchase_store_source_id AS "lastPurchaseStoreId",
  net_weight AS "netWeight",
  category,
  image_path AS "imagePath",
  raw
FROM pos.inventory;

GRANT SELECT ON public.pos_inventory TO anon, authenticated;

-- Recreate dependent views that were dropped by CASCADE
CREATE OR REPLACE VIEW public.pos_inventory_latest_costs
WITH (security_invoker = true) AS
SELECT
  inventory._id AS "inventoryId",
  inventory."ingredientName",
  inventory.unit,
  inventory."displayUnit",
  inventory."conversionFactor",
  CASE
    WHEN inventory."preferredPurchaseQuantity" IS NOT NULL
         AND inventory."preferredPurchaseQuantity" > 0
    THEN inventory."lastPurchasePrice"::numeric / inventory."preferredPurchaseQuantity"::numeric
    ELSE inventory."lastPurchasePrice"::numeric
  END AS "latestCostPerUnit",
  inventory."lastPurchaseAt" AS "latestRestockDate",
  NULL::numeric AS "avgCostPerUnit"
FROM public.pos_inventory AS inventory;
