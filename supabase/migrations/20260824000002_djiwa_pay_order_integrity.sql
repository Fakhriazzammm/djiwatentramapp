-- Server-side order integrity for the Djiwa Pay 20% payment-channel rule.
-- Runs after order_items are inserted, before wallet hold/settlement in the customer flow.

CREATE OR REPLACE FUNCTION pos.validate_djiwa_pay_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_product_subtotal numeric(18,2);
  v_djiwa_discount numeric(18,2) := 0;
  v_expected_total numeric(18,2);
  v_percent numeric := 20;
  v_metadata jsonb;
BEGIN
  SELECT * INTO v_order FROM pos.orders WHERE source_id = NEW.order_source_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_metadata := COALESCE(v_order.receipt_meta, '{}'::jsonb);
  SELECT COALESCE(SUM(COALESCE(price, 0) * GREATEST(quantity, 0)), 0)
  INTO v_product_subtotal
  FROM pos.order_items
  WHERE order_source_id = NEW.order_source_id
    AND COALESCE(status, '') IS DISTINCT FROM 'cancelled';

  -- Wallet is the only payment channel eligible for the Djiwa Pay voucher.
  IF lower(COALESCE(v_order.payment_method, '')) IN ('wallet', 'djiwa_pay', 'djiwapay') THEN
    v_percent := COALESCE(NULLIF((
      SELECT raw->>'djiwaPayDiscountPercent' FROM pos.site_settings ORDER BY creation_time DESC NULLS LAST LIMIT 1
    ), '')::numeric, 20);
    v_djiwa_discount := LEAST(v_product_subtotal, ROUND(v_product_subtotal * v_percent / 100));

    v_expected_total := GREATEST(0, v_product_subtotal - v_djiwa_discount)
      + COALESCE(v_order.service_charge_amount, 0)
      + COALESCE(v_order.tax_amount, 0);

    UPDATE pos.orders
    SET discount_amount = GREATEST(0, COALESCE(discount_amount, 0) - COALESCE((v_metadata->>'djiwaPayDiscount')::numeric, 0)) + v_djiwa_discount,
        total_amount = v_expected_total,
        receipt_meta = v_metadata || jsonb_build_object(
          'djiwaPayDiscountPercent', v_percent,
          'djiwaPayDiscount', v_djiwa_discount,
          'djiwaPayDiscountPaymentMethod', 'wallet',
          'pricingVerifiedServerSide', true
        )
    WHERE source_id = NEW.order_source_id;
  ELSE
    -- Cashier/cash and Mayar QRIS must never carry the Djiwa Pay voucher metadata.
    IF (v_metadata ? 'djiwaPayDiscount') OR (v_metadata ? 'djiwaPayDiscountPaymentMethod') THEN
      RAISE EXCEPTION 'Voucher Djiwa Pay hanya berlaku untuk pembayaran Djiwa Pay';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_djiwa_pay_order_pricing ON pos.order_items;
CREATE CONSTRAINT TRIGGER trg_validate_djiwa_pay_order_pricing
AFTER INSERT OR UPDATE OF price, quantity, status ON pos.order_items
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION pos.validate_djiwa_pay_order_pricing();

GRANT EXECUTE ON FUNCTION pos.validate_djiwa_pay_order_pricing() TO service_role;
