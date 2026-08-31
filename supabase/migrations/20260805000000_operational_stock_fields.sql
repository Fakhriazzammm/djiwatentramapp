-- Operational visual stock fields.
-- Additive migration: technical inventory remains the source for recipes,
-- HPP, purchasing, and order auto-deduction.

ALTER TABLE pos.inventory
  ADD COLUMN IF NOT EXISTS operational_unit text,
  ADD COLUMN IF NOT EXISTS operational_quantity numeric(18,4),
  ADD COLUMN IF NOT EXISTS operational_low_stock_threshold numeric(18,4),
  ADD COLUMN IF NOT EXISTS operational_icon_key text,
  ADD COLUMN IF NOT EXISTS operational_area text DEFAULT 'general';

CREATE INDEX IF NOT EXISTS inventory_operational_area_idx
  ON pos.inventory (operational_area);

COMMENT ON COLUMN pos.inventory.operational_unit IS
  'Human-facing intact-package unit used by barista/chef closing (box, botol, pack, etc.)';
COMMENT ON COLUMN pos.inventory.operational_quantity IS
  'Count of intact operational packages; opened packages are not counted';
COMMENT ON COLUMN pos.inventory.operational_low_stock_threshold IS
  'Human-facing low-stock threshold for operational quantity';
COMMENT ON COLUMN pos.inventory.operational_icon_key IS
  'Semantic Lucide icon key; never stores rendered JSX or emoji';
COMMENT ON COLUMN pos.inventory.operational_area IS
  'Operational area scope: bar, kitchen, warehouse, or general';

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
  pack_net_quantity AS "packNetQuantity",
  pack_net_unit AS "packNetUnit",
  content_to_base_factor AS "contentToBaseFactor",
  operational_unit AS "operationalUnit",
  operational_quantity AS "operationalQuantity",
  operational_low_stock_threshold AS "operationalLowStockThreshold",
  operational_icon_key AS "operationalIconKey",
  operational_area AS "operationalArea",
  raw
FROM pos.inventory;

GRANT SELECT ON public.pos_inventory TO anon, authenticated;

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

GRANT SELECT ON public.pos_inventory_latest_costs TO anon, authenticated;
