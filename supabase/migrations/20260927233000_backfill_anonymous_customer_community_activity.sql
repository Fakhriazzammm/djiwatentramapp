-- Publish existing settled purchases anonymously so Community is not empty.
-- This does not alter orders, payments, or customer consent/name fields.
BEGIN;

INSERT INTO public.customer_community_activity_events (
  customer_source_id,
  order_source_id,
  product_source_id,
  activity_type,
  display_name_snapshot,
  display_mode,
  product_name_snapshot,
  product_image_snapshot,
  price_snapshot,
  nutrition_snapshot,
  order_settled_at,
  visible_at,
  expires_at,
  visibility,
  status,
  source_payment_method
)
SELECT
  o.customer_source_id,
  o.source_id,
  oi.product_source_id,
  'order_completed',
  'Teman Djiwa',
  'anonymous',
  coalesce(nullif(btrim(oi.product_name), ''), nullif(btrim(p.name), ''), 'Menu Djiwa'),
  p.image,
  oi.price,
  CASE
    WHEN jsonb_typeof(p.nutrition) = 'object'
      AND coalesce(p.nutrition ->> 'status', 'verified') <> 'draft'
    THEN p.nutrition
    ELSE NULL
  END,
  to_timestamp(coalesce(o.created_at, o.creation_time, extract(epoch FROM now()))),
  now(),
  now() + interval '48 hours',
  'public',
  'active',
  NULL
FROM pos.orders o
JOIN pos.order_items oi ON oi.order_source_id = o.source_id
LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
JOIN pos.customers c ON c.source_id = o.customer_source_id AND c.is_active = true
WHERE coalesce(o.customer_source_id, '') <> ''
  AND coalesce(oi.quantity, 0) > 0
  AND coalesce(lower(oi.status), '') <> 'cancelled'
  AND p.source_id IS NOT NULL
  AND (
    (
      o.payment_receipt_kind = 'gateway_paid'
      AND o.status IN ('paid', 'completed')
      AND lower(coalesce(o.payment_gateway ->> 'status', '')) = 'paid'
      AND EXISTS (
        SELECT 1 FROM pos.financial_transactions ft
        WHERE ft.order_source_id = o.source_id
          AND ft.tx_type = 'income'
          AND ft.status = 'completed'
      )
    ) OR (
      o.payment_receipt_kind = 'wallet_paid'
      AND o.status = 'paid'
      AND EXISTS (
        SELECT 1 FROM pos.customer_wallet_ledger ledger
        JOIN pos.customer_wallet_holds hold
          ON hold.order_id = o.source_id
         AND hold.customer_id = ledger.customer_id
        WHERE ledger.customer_id = o.customer_source_id
          AND ledger.reference_id = o.source_id
          AND ledger.transaction_type = 'order_debit'
          AND ledger.status = 'completed'
          AND ledger.direction = 'debit'
          AND hold.status = 'captured'
      )
      AND EXISTS (
        SELECT 1 FROM pos.financial_transactions ft
        WHERE ft.order_source_id = o.source_id
          AND ft.tx_type = 'income'
          AND ft.status = 'completed'
      )
    ) OR (
      o.payment_receipt_kind = 'cashier'
      AND o.status = 'paid'
      AND lower(coalesce(o.payment_method, '')) IN ('cash', 'tunai', 'cashier')
      AND EXISTS (
        SELECT 1 FROM pos.financial_transactions ft
        WHERE ft.order_source_id = o.source_id
          AND ft.tx_type = 'income'
          AND ft.status = 'completed'
      )
    )
  )
ON CONFLICT (order_source_id, product_source_id, activity_type) DO NOTHING;

COMMIT;
