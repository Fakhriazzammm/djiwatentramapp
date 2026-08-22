-- Prevent repeated POS payment submits from creating multiple orders.
-- Also backfill receipt metadata already assigned by order-sync.

ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of_source_id TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_orders_idempotency_key
  ON pos.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pos_orders_duplicate_of
  ON pos.orders (duplicate_of_source_id)
  WHERE duplicate_of_source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_financial_transactions_order_income
  ON pos.financial_transactions (order_source_id)
  WHERE order_source_id IS NOT NULL AND tx_type = 'income';

-- A finance sync may have assigned a receipt number while the original order
-- row remained null. Copy only when the order itself has no receipt number.
UPDATE pos.orders o
SET daily_receipt_no = (ft.metadata ->> 'dailyReceiptNo')::INTEGER,
    receipt_kind = COALESCE(o.receipt_kind, ft.metadata ->> 'receiptKind')
FROM pos.financial_transactions ft
WHERE ft.order_source_id = o.source_id
  AND o.daily_receipt_no IS NULL
  AND COALESCE(ft.metadata ->> 'dailyReceiptNo', '') ~ '^[0-9]+$';

-- Preserve an audit trail for the known repeated Ami test submissions.
WITH target AS (
  SELECT source_id, order_number,
         first_value(source_id) OVER (ORDER BY created_at, source_id) AS keeper
  FROM pos.orders
  WHERE order_number IN (
    'ORD001-D-AMI220826', 'ORD002-D-AMI220826', 'ORD003-D-AMI220826',
    'ORD004-D-AMI220826', 'ORD005-D-AMI220826'
  )
  AND customer_name = 'Ami'
  AND total_amount = 15000
  AND status IN ('paid', 'completed')
), duplicates AS (
  SELECT source_id, keeper
  FROM target
  WHERE source_id <> keeper
)
UPDATE pos.orders o
SET duplicate_of_source_id = d.keeper,
    duplicate_reason = 'Repeated POS submit: same customer, item, amount, payment method, and short time window',
    status = 'cancelled',
    raw = COALESCE(o.raw, '{}'::jsonb) || jsonb_build_object(
      'duplicateOfSourceId', d.keeper,
      'duplicateReason', 'Repeated POS submit; cancelled without deleting audit record'
    )
FROM duplicates d
WHERE o.source_id = d.source_id;

UPDATE pos.financial_transactions ft
SET status = 'cancelled',
    metadata = COALESCE(ft.metadata, '{}'::jsonb) || jsonb_build_object(
      'duplicateOfSourceId', d.keeper,
      'duplicateReason', 'Repeated POS submit; cancelled without deleting audit record'
    )
FROM duplicates d
WHERE ft.order_source_id = d.source_id;
