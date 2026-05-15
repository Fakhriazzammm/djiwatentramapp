-- Fix pos_inventory_latest_costs: fallback lastPurchasePrice harus dibagi preferredPurchaseQuantity
-- agar harga/unit konsisten dengan logika di halaman /admin/inventory
-- (row.lastPurchasePrice || 0) / (row.preferredPurchaseQuantity || 1)

-- Drop dulu karena security_invoker=true mencegah alter column di view
drop view if exists public.pos_inventory_latest_costs cascade;

create or replace view public.pos_inventory_latest_costs
with (security_invoker = true) as
with priced_transactions as (
  select
    "inventoryId",
    type,
    "costPerUnit"::numeric as cost_per_unit,
    quantity::numeric as quantity,
    timestamp
  from public.pos_inventory_transactions
  where "costPerUnit" is not null
),
latest_price_reference as (
  select distinct on ("inventoryId")
    "inventoryId",
    cost_per_unit as "latestCostPerUnit",
    timestamp as "latestRestockDate"
  from priced_transactions
  where type in ('restock', 'costing_reference')
  order by "inventoryId", timestamp desc
),
restock_average as (
  select
    "inventoryId",
    case
      when sum(quantity) > 0 then sum(cost_per_unit * quantity) / sum(quantity)
      else null
    end as "avgCostPerUnit"
  from priced_transactions
  where type = 'restock'
  group by "inventoryId"
)
select
  inventory._id as "inventoryId",
  inventory."ingredientName",
  inventory.unit,
  inventory."displayUnit",
  inventory."conversionFactor",
  coalesce(
    latest_price_reference."latestCostPerUnit",
    case
      when inventory."preferredPurchaseQuantity" is not null
           and inventory."preferredPurchaseQuantity" > 0
      then inventory."lastPurchasePrice"::numeric / inventory."preferredPurchaseQuantity"::numeric
      else inventory."lastPurchasePrice"::numeric
    end
  ) as "latestCostPerUnit",
  coalesce(
    latest_price_reference."latestRestockDate",
    inventory."lastPurchaseAt"
  ) as "latestRestockDate",
  restock_average."avgCostPerUnit"
from public.pos_inventory as inventory
left join latest_price_reference
  on latest_price_reference."inventoryId" = inventory._id
left join restock_average
  on restock_average."inventoryId" = inventory._id;
