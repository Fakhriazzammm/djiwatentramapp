-- Create purchase logs table for tracking inventory restock transactions
CREATE TABLE IF NOT EXISTS pos_purchase_logs (
    id BIGSERIAL PRIMARY KEY,
    inventory_id TEXT,
    ingredient_name TEXT NOT NULL,
    quantity_added REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    unit_price REAL,
    total_cost REAL,
    merchant TEXT,
    ocr_raw_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON pos_purchase_logs TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE pos_purchase_logs_id_seq TO anon, authenticated, service_role;

-- Create exec_sql RPC for running arbitrary SQL from Edge Functions
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;
