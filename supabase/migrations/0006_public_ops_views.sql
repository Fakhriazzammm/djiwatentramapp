create or replace view public.pos_orders
with (security_invoker = true) as
select
  o.source_id as _id,
  coalesce(o.creation_time, o.created_at) as "_creationTime",
  o.order_number as "orderNumber",
  o.total_amount as "totalAmount",
  o.status,
  o.payment_method as "paymentMethod",
  o.customer_name as "customerName",
  o.table_number as "tableNumber",
  o.order_type as "orderType",
  o.source,
  o.brand_slug as "brandSlug",
  o.guest_count as "guestCount",
  o.free_refill_selected as "freeRefillSelected",
  o.dessert_later as "dessertLater",
  o.notes,
  o.created_at as "createdAt",
  o.voucher_source_id as "voucherId",
  o.discount_amount as "discountAmount",
  o.tax_amount as "taxAmount",
  o.service_charge_amount as "serviceChargeAmount",
  o.receipt_meta as "receiptMeta",
  o.payment_receipt_kind as "paymentReceiptKind",
  o.payment_gateway as "paymentGateway",
  o.gateway_invoice_id as "gatewayInvoiceId",
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'productId', oi.product_source_id,
          'productName', oi.product_name,
          'variant', oi.variant,
          'quantity', oi.quantity,
          'price', oi.price,
          'originalPrice', oi.original_price,
          'status', oi.status,
          'hppSnapshot', oi.hpp_snapshot
        )
        order by oi.line_no
      )
      from pos.order_items oi
      where oi.order_source_id = o.source_id
    ),
    '[]'::jsonb
  ) as items
from pos.orders o;

create or replace view public.pos_inventory
with (security_invoker = true) as
select
  source_id as _id,
  ingredient_name as "ingredientName",
  unit,
  quantity,
  low_stock_threshold as "lowStockThreshold",
  display_unit as "displayUnit",
  conversion_factor as "conversionFactor",
  unit_conversions as "unitConversions",
  base_recipe_source_id as "baseRecipeId",
  default_brand_name as "defaultBrandName",
  preferred_store_source_id as "preferredStoreId",
  preferred_purchase_quantity as "preferredPurchaseQuantity",
  preferred_purchase_unit as "preferredPurchaseUnit",
  last_purchase_price as "lastPurchasePrice",
  last_purchase_at as "lastPurchaseAt",
  last_purchase_store_source_id as "lastPurchaseStoreId",
  raw
from pos.inventory;

grant select on public.pos_orders to anon, authenticated;
grant select on public.pos_inventory to anon, authenticated;
