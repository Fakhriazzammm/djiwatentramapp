-- Email marketing: campaigns, per-recipient delivery state, templates and suppressions.
-- Only Edge Functions (service role) touch these tables; clients never read them directly.
CREATE TABLE IF NOT EXISTS pos.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  subject text NOT NULL,
  html text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  template_id text,
  segment text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','paused','done','canceled')),
  scheduled_at timestamptz,
  from_address text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON pos.email_campaigns (status, scheduled_at);

CREATE TABLE IF NOT EXISTS pos.email_campaign_recipients (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES pos.email_campaigns(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  vars jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','bounced','complained','failed','skipped')),
  provider_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX IF NOT EXISTS email_recipients_campaign_status_idx ON pos.email_campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS email_recipients_provider_idx ON pos.email_campaign_recipients (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_recipients_customer_idx ON pos.email_campaign_recipients (customer_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS pos.email_suppressions (
  email text PRIMARY KEY CHECK (email = lower(email)),
  reason text NOT NULL CHECK (reason IN ('unsubscribed','bounce','complaint','manual')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.email_templates, pos.email_campaigns, pos.email_campaign_recipients, pos.email_suppressions FROM anon, authenticated;
GRANT ALL ON pos.email_templates, pos.email_campaigns, pos.email_campaign_recipients, pos.email_suppressions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pos.email_campaign_recipients_id_seq TO service_role;

CREATE OR REPLACE FUNCTION pos.email_campaign_status_counts(p_campaign_ids uuid[])
RETURNS TABLE (campaign_id uuid, status text, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pos, pg_temp AS $$
  SELECT campaign_id, status, count(*) FROM pos.email_campaign_recipients
  WHERE campaign_id = ANY(p_campaign_ids) GROUP BY campaign_id, status
$$;
REVOKE ALL ON FUNCTION pos.email_campaign_status_counts(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.email_campaign_status_counts(uuid[]) TO service_role;

-- Secrets (HELIPOD_EMAIL_API_KEY, EMAIL_WEBHOOK_SECRET, EMAIL_UNSUB_SECRET, EMAIL_FROM) are inserted by the operator, never committed.
CREATE TABLE IF NOT EXISTS pos.email_settings (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE pos.email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.email_settings FROM anon, authenticated;
GRANT ALL ON pos.email_settings TO service_role;
