-- Fix pos_inventory_latest_costs: hapus prioritas transaksi
-- Hanya pakai lastPurchasePrice / preferredPurchaseQuantity dari inventory
-- Biar konsisten dengan kolom Harga/Unit di /admin/inventory

drop view if exists public.pos_inventory_latest_costs cascade;

create or replace view public.pos_inventory_latest_costs
with (security_invoker = true) as
select
  inventory._id as "inventoryId",
  inventory."ingredientName",
  inventory.unit,
  inventory."displayUnit",
  inventory."conversionFactor",
  case
    when inventory."preferredPurchaseQuantity" is not null
         and inventory."preferredPurchaseQuantity" > 0
    then inventory."lastPurchasePrice"::numeric / inventory."preferredPurchaseQuantity"::numeric
    else inventory."lastPurchasePrice"::numeric
  end as "latestCostPerUnit",
  inventory."lastPurchaseAt" as "latestRestockDate",
  null::numeric as "avgCostPerUnit"
from public.pos_inventory as inventory;
