-- Add audit trail column to pos.orders
alter table pos.orders add column if not exists auth_user_id text;

-- Expose authUserId in public view
drop view if exists public.pos_orders cascade;
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
  o.auth_user_id as "authUserId",
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
