-- Order Mie Yamin B2B: additive delivery and transaction isolation fields.
-- Existing POS/customer orders remain nullable and unchanged.
BEGIN;

ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS business_unit text,
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS delivery_date timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_provider text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_contact_name text,
  ADD COLUMN IF NOT EXISTS delivery_contact_phone text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_notes text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE pos.financial_transactions
  ADD COLUMN IF NOT EXISTS business_unit text,
  ADD COLUMN IF NOT EXISTS source_app text;

CREATE INDEX IF NOT EXISTS idx_pos_orders_business_delivery
  ON pos.orders (business_unit, delivery_date)
  WHERE delivery_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_financial_transactions_business_unit
  ON pos.financial_transactions (business_unit, tx_date);

ALTER TABLE pos.orders
  DROP CONSTRAINT IF EXISTS pos_orders_delivery_status_check;
ALTER TABLE pos.orders
  ADD CONSTRAINT pos_orders_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN (
    'pending_payment', 'paid', 'preparing', 'packing',
    'ready_to_ship', 'out_for_delivery', 'delivered', 'failed', 'cancelled'
  ));

ALTER TABLE pos.orders
  DROP CONSTRAINT IF EXISTS pos_orders_delivery_provider_check;
ALTER TABLE pos.orders
  ADD CONSTRAINT pos_orders_delivery_provider_check
  CHECK (delivery_provider IS NULL OR delivery_provider IN ('gojek', 'maxim'));

DROP VIEW IF EXISTS public.pos_orders CASCADE;
CREATE OR REPLACE VIEW public.pos_orders AS
SELECT
  o.source_id AS _id,
  COALESCE(o.creation_time, o.created_at) AS "_creationTime",
  o.order_number AS "orderNumber",
  o.total_amount AS "totalAmount",
  o.status,
  o.payment_method AS "paymentMethod",
  o.customer_name AS "customerName",
  o.table_number AS "tableNumber",
  o.order_type AS "orderType",
  o.source,
  o.brand_slug AS "brandSlug",
  o.business_unit AS "businessUnit",
  o.source_app AS "sourceApp",
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
  o.delivered_at AS "deliveredAt",
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

CREATE OR REPLACE VIEW public.pos_financial_transactions
WITH (security_invoker = true) AS
SELECT
  source_id AS _id,
  tx_type AS type,
  amount,
  category,
  merchant,
  description,
  tx_date AS date,
  payment_method AS "paymentMethod",
  status,
  order_source_id AS "orderId",
  booking_order_source_id AS "bookingOrderId",
  attachment_url AS "attachmentUrl",
  source_fingerprint AS "sourceFingerprint",
  is_recurring AS "isRecurring",
  recurring_interval AS "recurringInterval",
  tags,
  metadata,
  business_unit AS "businessUnit",
  source_app AS "sourceApp"
FROM pos.financial_transactions;

GRANT SELECT ON public.pos_orders, public.pos_financial_transactions TO anon, authenticated;
COMMIT;
