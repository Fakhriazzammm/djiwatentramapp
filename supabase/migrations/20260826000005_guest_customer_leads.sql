-- Persist guest customer identity separately from authenticated members.
-- Marketing consent is explicit and defaults to false.
CREATE TABLE IF NOT EXISTS pos.customer_leads (
  source_id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  customer_description text NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  guest_session_id text,
  source text NOT NULL DEFAULT 'customer_guest_checkout',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_leads_email_idx
  ON pos.customer_leads (lower(email));
CREATE INDEX IF NOT EXISTS customer_leads_phone_idx
  ON pos.customer_leads (phone);
CREATE INDEX IF NOT EXISTS customer_leads_last_seen_idx
  ON pos.customer_leads (last_seen_at DESC);

ALTER TABLE pos.customer_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.customer_leads FROM anon, authenticated;
GRANT ALL ON pos.customer_leads TO service_role;

COMMENT ON TABLE pos.customer_leads IS
  'Guest customer identities captured for order handoff and consent-aware CRM/marketing.';
COMMENT ON COLUMN pos.customer_leads.marketing_consent IS
  'Explicit opt-in for promotional communication; false means operational data only.';
