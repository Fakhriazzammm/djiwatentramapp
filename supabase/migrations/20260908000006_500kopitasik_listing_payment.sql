-- 500 Kopi Tasik: payment-first coffee shop listing.
-- Additive and idempotent. A shop becomes public only after verified Mayar settlement.

CREATE TABLE IF NOT EXISTS pos.coffee_passport_listing_payments (
  listing_payment_id text PRIMARY KEY,
  shop_id text NOT NULL UNIQUE REFERENCES pos.coffee_passport_shops(shop_id),
  customer_id text NOT NULL REFERENCES pos.customers(source_id),
  amount bigint NOT NULL DEFAULT 1000 CHECK (amount = 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  mayar_invoice_id text UNIQUE,
  mayar_transaction_id text UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE pos.coffee_passport_listing_payments
  ADD COLUMN IF NOT EXISTS mayar_invoice_url text;

CREATE INDEX IF NOT EXISTS idx_coffee_passport_listing_payment_customer
  ON pos.coffee_passport_listing_payments (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION pos.coffee_passport_settle_listing(
  p_listing_payment_id text,
  p_invoice_id text,
  p_transaction_id text,
  p_paid_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_payment pos.coffee_passport_listing_payments;
  v_shop pos.coffee_passport_shops;
BEGIN
  SELECT * INTO v_payment
  FROM pos.coffee_passport_listing_payments
  WHERE listing_payment_id = p_listing_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing payment tidak ditemukan'; END IF;

  IF v_payment.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'dedup', true, 'shop_id', v_payment.shop_id,
      'listing_payment_id', v_payment.listing_payment_id);
  END IF;
  IF v_payment.mayar_invoice_id IS NOT NULL AND NULLIF(trim(p_invoice_id), '') IS DISTINCT FROM v_payment.mayar_invoice_id THEN
    RAISE EXCEPTION 'Listing invoice mismatch';
  END IF;

  SELECT * INTO v_shop
  FROM pos.coffee_passport_shops
  WHERE shop_id = v_payment.shop_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coffee shop listing tidak ditemukan'; END IF;

  UPDATE pos.coffee_passport_listing_payments
  SET status = 'paid',
      mayar_invoice_id = NULLIF(trim(p_invoice_id), ''),
      mayar_transaction_id = NULLIF(trim(p_transaction_id), ''),
      paid_at = p_paid_at
  WHERE listing_payment_id = v_payment.listing_payment_id;

  UPDATE pos.coffee_passport_shops
  SET verification_status = 'approved',
      is_active = true,
      verified_at = p_paid_at,
      updated_at = now()
  WHERE shop_id = v_payment.shop_id;

  RETURN jsonb_build_object('ok', true, 'dedup', false, 'shop_id', v_payment.shop_id,
    'listing_payment_id', v_payment.listing_payment_id, 'status', 'listed');
END;
$$;

REVOKE ALL ON TABLE pos.coffee_passport_listing_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.coffee_passport_settle_listing(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.coffee_passport_settle_listing(text, text, text, timestamptz) TO service_role;
