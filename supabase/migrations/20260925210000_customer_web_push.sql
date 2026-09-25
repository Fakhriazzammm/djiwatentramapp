-- Extend the shared Web Push registry for authenticated Customer PWA devices.
-- Customer sessions are Better Auth identities and must not be forced through yumi_sessions.
ALTER TABLE public.pos_notification_push_subscriptions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.pos_notification_push_subscriptions
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS app_scope text NOT NULL DEFAULT 'admin';

ALTER TABLE public.pos_notification_push_subscriptions
  DROP CONSTRAINT IF EXISTS pos_notification_push_subscriptions_owner_check;

ALTER TABLE public.pos_notification_push_subscriptions
  ADD CONSTRAINT pos_notification_push_subscriptions_owner_check
  CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS pos_notification_push_subscriptions_customer_idx
  ON public.pos_notification_push_subscriptions (is_active, customer_id, app_scope);

CREATE INDEX IF NOT EXISTS pos_notification_push_subscriptions_scope_idx
  ON public.pos_notification_push_subscriptions (is_active, app_scope);
