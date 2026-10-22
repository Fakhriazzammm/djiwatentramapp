-- Additive shipping quote snapshots for customer delivery orders.
ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS shipping_fee_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS shipping_rate_snapshot jsonb;

ALTER TABLE pos.orders
  DROP CONSTRAINT IF EXISTS pos_orders_shipping_fee_amount_nonnegative;
ALTER TABLE pos.orders
  ADD CONSTRAINT pos_orders_shipping_fee_amount_nonnegative
  CHECK (shipping_fee_amount IS NULL OR shipping_fee_amount >= 0);

CREATE OR REPLACE VIEW public.pos_orders AS
SELECT
  o.source_id AS "_id",
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
  COALESCE(oi_items.items, '[]'::jsonb) AS items,
  o.subtotal_amount AS "subtotalAmount",
  o.tax_base_amount AS "taxBaseAmount",
  o.tax_rate_snapshot AS "taxRateSnapshot",
  o.service_charge_base_amount AS "serviceChargeBaseAmount",
  o.service_charge_rate_snapshot AS "serviceChargeRateSnapshot",
  o.raw_total_amount AS "rawTotalAmount",
  o.rounding_adjustment AS "roundingAdjustment",
  o.payment_channel_canonical AS "paymentChannelCanonical",
  o.tax_exemption_reason AS "taxExemptionReason",
  o.tax_policy_version AS "taxPolicyVersion",
  o.shift_source_id AS "shiftSourceId",
  o.delivery_provider_order_id AS "deliveryProviderOrderId",
  o.delivery_tracking_id AS "deliveryTrackingId",
  o.delivery_waybill_id AS "deliveryWaybillId",
  o.shipping_fee_amount AS "shippingFeeAmount",
  o.shipping_rate_snapshot AS "shippingRateSnapshot"
FROM pos.orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    jsonb_build_object(
      'productId', oi.product_source_id,
      'productName', oi.product_name,
      'variant', oi.variant,
      'quantity', oi.quantity,
      'price', oi.price,
      'originalPrice', oi.original_price,
      'status', oi.status,
      'hppSnapshot', oi.hpp_snapshot
    ) ORDER BY oi.line_no
  ) AS items
  FROM pos.order_items oi
  WHERE oi.order_source_id = o.source_id
) oi_items ON true;

GRANT SELECT ON public.pos_orders TO anon, authenticated, service_role, authenticator;
NOTIFY pgrst, 'reload schema';
