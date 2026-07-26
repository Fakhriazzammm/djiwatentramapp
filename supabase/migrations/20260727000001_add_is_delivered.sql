BEGIN;
  ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT false;
  COMMENT ON COLUMN pos.orders.is_delivered IS 'Flag pesanan sudah diantar ke pelanggan. Auto-set true saat shift ditutup.';
COMMIT;
