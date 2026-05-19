-- Add pack_net_quantity, pack_net_unit, and content_to_base_factor columns to pos.inventory
-- pack_net_quantity = isi bersih per kemasan beli (contoh: 12 botol per dus)
-- pack_net_unit = satuan isi bersih (contoh: botol)
-- content_to_base_factor = konversi dari 1 pack_net_unit ke unit stok dasar (contoh: 500 ml/botol)

-- 1. Add 3 new columns
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS pack_net_quantity numeric;
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS pack_net_unit text;
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS content_to_base_factor numeric;

COMMENT ON COLUMN pos.inventory.pack_net_quantity IS 'Isi bersih per kemasan beli (contoh: 12 botol per dus)';
COMMENT ON COLUMN pos.inventory.pack_net_unit IS 'Satuan isi bersih (contoh: botol)';
COMMENT ON COLUMN pos.inventory.content_to_base_factor IS 'Faktor konversi dari 1 pack_net_unit ke unit stok dasar (contoh: 500 ml/botol)';

-- 2. Recreate public view with new columns appended at end
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
  raw
FROM pos.inventory;

GRANT SELECT ON public.pos_inventory TO anon, authenticated;

-- 3. Recreate dependent view that was dropped by CASCADE
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
