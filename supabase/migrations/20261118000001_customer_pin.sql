-- Djiwa Pay PIN: one hashed PIN per customer, checked on the server before money moves.
CREATE TABLE IF NOT EXISTS pos.customer_pins (
  customer_id text PRIMARY KEY REFERENCES pos.customers(source_id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pos.customer_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos.customer_pins FROM anon, authenticated;
