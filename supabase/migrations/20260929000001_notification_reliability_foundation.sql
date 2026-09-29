-- Notification reliability foundation: per-user state, canonical entity metadata,
-- and explicit payment failure/resolution states. Additive and idempotent.
ALTER TABLE public.pos_notifications
  ADD COLUMN IF NOT EXISTS event_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS source_app text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by text;

ALTER TABLE public.pos_notifications
  DROP CONSTRAINT IF EXISTS pos_notifications_notification_type_check;
ALTER TABLE public.pos_notifications
  ADD CONSTRAINT pos_notifications_notification_type_check CHECK (notification_type IN (
    'order_cashier_pending',
    'order_mayar_pending',
    'order_paid',
    'order_payment_failed',
    'order_cancelled',
    'admin_info',
    'admin_briefing'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS pos_notifications_event_id_idx
  ON public.pos_notifications(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_notifications_entity_idx
  ON public.pos_notifications(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_notifications_type_created_idx
  ON public.pos_notifications(notification_type, created_at DESC);

ALTER TABLE public.pos_notification_reads
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
