-- Tambah grup bahan (kategori bahan, mis. "Minyak Goreng") ke view publik
-- supaya admin bisa mengelompokkan baris per merek dalam satu kategori.
--
-- CREATE OR REPLACE VIEW hanya boleh menambah kolom di akhir SELECT, jadi
-- ingredient_group ditaruh setelah raw.

CREATE OR REPLACE VIEW public.pos_inventory WITH (security_invoker = true) AS
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
  raw,
  ingredient_group AS "ingredientGroup"
FROM pos.inventory;

GRANT SELECT ON public.pos_inventory TO anon, authenticated;

COMMENT ON VIEW public.pos_inventory IS
  'Katalog inventaris publik; ingredientGroup = kategori bahan (mis. Minyak Goreng), '
  'defaultBrandName = merek, sehingga baris per merek bisa dibandingkan harganya.';
