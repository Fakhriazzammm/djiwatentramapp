-- 500 Kopi Tasik: read-only reconciliation bridge for verified payment recovery.
-- Keeps listing payment table private from API clients and exposes only pending invoice metadata.

CREATE OR REPLACE FUNCTION pos.coffee_passport_pending_listing_payments()
RETURNS TABLE (
  listing_payment_id text,
  mayar_invoice_id text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pos, public
AS $$
  SELECT p.listing_payment_id, p.mayar_invoice_id, p.status
  FROM pos.coffee_passport_listing_payments p
  WHERE p.status = 'pending'
    AND p.mayar_invoice_id IS NOT NULL
  ORDER BY p.created_at ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION pos.coffee_passport_pending_listing_payments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_pending_listing_payments() TO service_role;
