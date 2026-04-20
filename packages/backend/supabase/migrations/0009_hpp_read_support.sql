create or replace view public.pos_hpp_calculations
with (security_invoker = true) as
select
  document_id as _id,
  nullif(document->>'productId', '') as "productId",
  coalesce(nullif(document->>'name', ''), 'HPP Calculation') as name,
  coalesce(nullif(document->>'sellingPrice', '')::numeric, 0) as "sellingPrice",
  coalesce(nullif(document->>'servingsPerBatch', '')::numeric, 1) as "servingsPerBatch",
  coalesce(document->'ingredients', '[]'::jsonb) as ingredients,
  coalesce(document->'overheadCosts', '[]'::jsonb) as "overheadCosts",
  coalesce(
    nullif(document->>'updatedAt', '')::bigint,
    nullif(document->>'createdAt', '')::bigint,
    floor(creation_time)::bigint
  ) as "updatedAt",
  document as raw
from legacy_mirror.documents
where table_name = 'hppCalculations';

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
    inventory."lastPurchasePrice"::numeric
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

grant select on public.pos_hpp_calculations to anon, authenticated;
grant select on public.pos_inventory_latest_costs to anon, authenticated;

