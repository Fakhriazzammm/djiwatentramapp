-- POS notification center: durable order/admin notifications with server-side auth.
-- Additive and idempotent. Browser clients must use the pos-notifications Edge Function;
-- the base tables remain closed behind RLS.

CREATE TABLE IF NOT EXISTS public.pos_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text NOT NULL CHECK (notification_type IN (
    'order_cashier_pending',
    'order_mayar_pending',
    'order_paid',
    'admin_info',
    'admin_briefing'
  )),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  title text NOT NULL,
  message text NOT NULL,
  order_source_id text,
  order_number text,
  source text,
  target_branch_id text,
  target_role text,
  target_user_id text,
  dedupe_key text NOT NULL UNIQUE,
  action_type text,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.pos_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.pos_notifications(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS pos_notifications_active_created_idx
  ON public.pos_notifications (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_notifications_target_idx
  ON public.pos_notifications (target_branch_id, target_role, target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pos_notification_reads_user_idx
  ON public.pos_notification_reads (user_id, read_at DESC);

ALTER TABLE public.pos_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_notification_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pos_notifications FROM anon, authenticated;
REVOKE ALL ON public.pos_notification_reads FROM anon, authenticated;
GRANT ALL ON public.pos_notifications TO service_role;
GRANT ALL ON public.pos_notification_reads TO service_role;

DROP POLICY IF EXISTS pos_notifications_deny_anon ON public.pos_notifications;
CREATE POLICY pos_notifications_deny_anon
  ON public.pos_notifications FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pos_notification_reads_deny_anon ON public.pos_notification_reads;
CREATE POLICY pos_notification_reads_deny_anon
  ON public.pos_notification_reads FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
