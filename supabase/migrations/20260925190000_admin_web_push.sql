-- Additive Web Push storage for Admin PWA.
-- Private key never belongs in the database or browser bundle.
CREATE TABLE IF NOT EXISTS public.pos_notification_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_id text NOT NULL,
  target_role text,
  target_branch_id text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_notification_push_subscriptions_target_idx
  ON public.pos_notification_push_subscriptions (is_active, target_role, target_branch_id, user_id);

CREATE TABLE IF NOT EXISTS public.pos_notification_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.pos_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.pos_notification_push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'expired')),
  error_message text,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, subscription_id)
);

ALTER TABLE public.pos_notification_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_notification_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_notification_push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.pos_notification_push_deliveries FROM anon, authenticated;
GRANT ALL ON public.pos_notification_push_subscriptions TO service_role;
GRANT ALL ON public.pos_notification_push_deliveries TO service_role;

DROP POLICY IF EXISTS pos_notification_push_subscriptions_deny_client ON public.pos_notification_push_subscriptions;
CREATE POLICY pos_notification_push_subscriptions_deny_client
  ON public.pos_notification_push_subscriptions FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pos_notification_push_deliveries_deny_client ON public.pos_notification_push_deliveries;
CREATE POLICY pos_notification_push_deliveries_deny_client
  ON public.pos_notification_push_deliveries FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
