CREATE TABLE IF NOT EXISTS pos.ppob_transactions (
  id BIGSERIAL PRIMARY KEY,
  ref_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('0', '1', '2')),
  product_code TEXT,
  customer_id TEXT,
  price NUMERIC,
  message TEXT,
  serial_number TEXT,
  iak_balance NUMERIC,
  iak_transaction_id TEXT,
  response_code TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppob_transactions_customer_created
  ON pos.ppob_transactions (customer_id, created_at DESC);

REVOKE ALL ON pos.ppob_transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON pos.ppob_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE pos.ppob_transactions_id_seq TO service_role;
