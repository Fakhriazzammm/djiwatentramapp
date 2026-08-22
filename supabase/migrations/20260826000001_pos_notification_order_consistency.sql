-- Keep POS notification feed aligned with order status and chronological order time.

UPDATE public.pos_notifications n
SET is_active = false
FROM pos.orders o
WHERE n.order_source_id = o.source_id
  AND o.status = 'cancelled'
  AND o.duplicate_of_source_id IS NOT NULL;

UPDATE public.pos_notifications n
SET created_at = to_timestamp(o.created_at / 1000.0)
FROM pos.orders o
WHERE n.order_source_id = o.source_id
  AND o.created_at IS NOT NULL
  AND o.created_at > 0;

CREATE INDEX IF NOT EXISTS pos_notifications_order_active_created_idx
  ON public.pos_notifications (order_source_id, is_active, created_at DESC)
  WHERE order_source_id IS NOT NULL;
