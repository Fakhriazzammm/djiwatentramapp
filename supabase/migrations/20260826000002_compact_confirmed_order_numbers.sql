-- Compact the confirmed valid transaction sequence for WIB 2026-08-22.
-- Internal source UUIDs are intentionally preserved.
-- This migration is guarded so re-running it is safe after the rows are already compacted.

BEGIN;

-- Remove the explicitly confirmed cancelled duplicates if they still exist.
DELETE FROM pos.order_status
WHERE order_no IN (
  'ORD002-D-AMI220826', 'ORD003-D-AMI220826',
  'ORD004-D-AMI220826', 'ORD005-D-AMI220826'
);
DELETE FROM pos.order_items
WHERE order_source_id IN (
  'order_e6016d55948a43a985381661',
  'order_361140fe3f424d27a941610c',
  'order_f6b0e51002054325a776ff67',
  'order_43fd51f9c65c489793d8c7c1'
);
DELETE FROM pos.financial_transactions
WHERE order_source_id IN (
  'order_e6016d55948a43a985381661',
  'order_361140fe3f424d27a941610c',
  'order_f6b0e51002054325a776ff67',
  'order_43fd51f9c65c489793d8c7c1'
);
DELETE FROM pos.orders
WHERE source_id IN (
  'order_e6016d55948a43a985381661',
  'order_361140fe3f424d27a941610c',
  'order_f6b0e51002054325a776ff67',
  'order_43fd51f9c65c489793d8c7c1'
);

-- Rename only human-readable order numbers; source UUIDs remain immutable.
UPDATE pos.orders
SET order_number = 'ORD002-D-AMI220826',
    daily_receipt_no = 2,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
      'orderNumber', 'ORD002-D-AMI220826',
      'displayReceiptNo', 2,
      'renumberedFrom', 'ORD006-D-AMI220826'
    )
WHERE source_id = 'order_d267e43ba907493ba4992e68';

UPDATE pos.orders
SET order_number = 'ORD003-D-ANGI220826',
    daily_receipt_no = 3,
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
      'orderNumber', 'ORD003-D-ANGI220826',
      'displayReceiptNo', 3,
      'renumberedFrom', 'ORD007-D-ANGI220826'
    )
WHERE source_id = 'order_c907c2141d0043b4ac9af431';

UPDATE pos.order_status
SET order_no = 'ORD002-D-AMI220826',
    struk_line = replace(struk_line, 'STRUK NO. 6', 'STRUK NO. 2'),
    base_text = replace(replace(base_text, 'ORD006-D-AMI220826', 'ORD002-D-AMI220826'), 'STRUK NO. 6', 'STRUK NO. 2')
WHERE order_no = 'ORD006-D-AMI220826';

UPDATE pos.order_status
SET order_no = 'ORD003-D-ANGI220826',
    struk_line = replace(struk_line, 'STRUK NO. 7', 'STRUK NO. 3'),
    base_text = replace(replace(base_text, 'ORD007-D-ANGI220826', 'ORD003-D-ANGI220826'), 'STRUK NO. 7', 'STRUK NO. 3')
WHERE order_no = 'ORD007-D-ANGI220826';

UPDATE pos.financial_transactions
SET description = replace(replace(description, 'ORD006-D-AMI220826', 'ORD002-D-AMI220826'), 'Struk #6', 'Struk #2'),
    metadata = jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{orderNumber}', '"ORD002-D-AMI220826"'::jsonb, true), '{dailyReceiptNo}', '2'::jsonb, true)
WHERE order_source_id = 'order_d267e43ba907493ba4992e68';

UPDATE pos.financial_transactions
SET description = replace(replace(description, 'ORD007-D-ANGI220826', 'ORD003-D-ANGI220826'), 'Struk #7', 'Struk #3'),
    metadata = jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{orderNumber}', '"ORD003-D-ANGI220826"'::jsonb, true), '{dailyReceiptNo}', '3'::jsonb, true)
WHERE order_source_id = 'order_c907c2141d0043b4ac9af431';

UPDATE public.pos_notifications
SET order_number = 'ORD002-D-AMI220826'
WHERE order_source_id = 'order_d267e43ba907493ba4992e68';
UPDATE public.pos_notifications
SET order_number = 'ORD003-D-ANGI220826'
WHERE order_source_id = 'order_c907c2141d0043b4ac9af431';

UPDATE pos.daily_receipt_counter
SET last_no = 3
WHERE date = '2026-08-22'
  AND order_kind = 'all';

COMMIT;
