-- Personal employee notifications: additive, deduplicated, and exposed only through a username-scoped RPC.
CREATE TABLE IF NOT EXISTS public.employee_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_user_id text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL DEFAULT 'info',
  action_url text,
  action_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_notifications_employee_created_idx
  ON public.employee_notifications (employee_user_id, created_at DESC);

ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_employee_notifications(p_username text)
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  notification_type text,
  action_url text,
  action_label text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.title, n.message, n.notification_type,
         n.action_url, n.action_label, n.created_at
  FROM public.employee_notifications n
  JOIN public.yumi_users u ON u.source_id = n.employee_user_id
  WHERE (u.username = p_username OR u.slug = p_username)
  ORDER BY n.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_employee_notifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_notifications(text) TO anon, authenticated;
