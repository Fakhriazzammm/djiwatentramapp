-- Canonical channel provenance for new orders.
-- Existing source/order_number values remain unchanged for audit compatibility.
ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS order_channel text;

UPDATE pos.orders
SET order_channel = CASE
  WHEN lower(coalesce(source, '')) = 'booking' THEN 'booking'
  WHEN lower(coalesce(business_unit, '')) IN ('ordermieyamin', 'mieyamin') THEN 'app'
  WHEN lower(coalesce(source, '')) IN ('customer_self_service', 'djiwaapp') THEN 'app'
  WHEN lower(coalesce(source, '')) IN ('gofood', 'go_food') OR lower(coalesce(source_app, '')) LIKE '%gofood%' THEN 'gofood'
  WHEN lower(coalesce(source, '')) IN ('grabfood', 'grab_food') OR lower(coalesce(source_app, '')) LIKE '%grabfood%' THEN 'grabfood'
  WHEN lower(coalesce(source, '')) IN ('shopeefood', 'shopee_food') OR lower(coalesce(source_app, '')) LIKE '%shopeefood%' THEN 'shopeefood'
  WHEN lower(coalesce(source, '')) LIKE '%telegram%' OR lower(coalesce(source_app, '')) LIKE '%telegram%' THEN 'telegram'
  WHEN source IS NULL OR lower(source) IN ('', 'pos', 'kasir', 'internal') THEN 'pos'
  ELSE 'unknown'
END
WHERE order_channel IS NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_order_channel
  ON pos.orders (order_channel);

-- The public read view is recreated to expose the canonical field to all apps.
DROP VIEW IF EXISTS public.pos_orders CASCADE;
CREATE VIEW public.pos_orders AS
SELECT
  o.source_id AS _id,
  COALESCE(o.creation_time, o.created_at) AS "_creationTime",
  o.order_number AS "orderNumber",
  o.total_amount AS "totalAmount",
  o.status,
  o.payment_method AS "paymentMethod",
  o.customer_name AS "customerName",
  o.customer_email AS "customerEmail",
  o.table_number AS "tableNumber",
  o.order_type AS "orderType",
  o.source,
  o.brand_slug AS "brandSlug",
  o.business_unit AS "businessUnit",
  o.source_app AS "sourceApp",
  o.order_channel AS "orderChannel",
  o.guest_count AS "guestCount",
  o.free_refill_selected AS "freeRefillSelected",
  o.dessert_later AS "dessertLater",
  o.notes,
  o.created_at AS "createdAt",
  o.voucher_source_id AS "voucherId",
  o.discount_amount AS "discountAmount",
  o.tax_amount AS "taxAmount",
  o.service_charge_amount AS "serviceChargeAmount",
  o.receipt_meta AS "receiptMeta",
  o.payment_receipt_kind AS "paymentReceiptKind",
  o.payment_gateway AS "paymentGateway",
  o.gateway_invoice_id AS "gatewayInvoiceId",
  o.auth_user_id AS "authUserId",
  o.daily_receipt_no,
  o.receipt_kind,
  o.customer_source_id AS "customerSourceId",
  o.delivery_date AS "deliveryDate",
  o.delivery_provider AS "deliveryProvider",
  o.delivery_status AS "deliveryStatus",
  o.delivery_contact_name AS "deliveryContactName",
  o.delivery_contact_phone AS "deliveryContactPhone",
  o.delivery_address AS "deliveryAddress",
  o.delivery_notes AS "deliveryNotes",
  COALESCE(oi_items.items, '[]'::jsonb) AS items
FROM pos.orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'productId', oi.product_source_id,
    'productName', oi.product_name,
    'variant', oi.variant,
    'quantity', oi.quantity,
    'price', oi.price,
    'originalPrice', oi.original_price,
    'status', oi.status,
    'hppSnapshot', oi.hpp_snapshot
  ) ORDER BY oi.line_no) AS items
  FROM pos.order_items oi
  WHERE oi.order_source_id = o.source_id
) oi_items ON true;

GRANT SELECT ON public.pos_orders TO anon, authenticated;
