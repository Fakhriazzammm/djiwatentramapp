-- Djiwa Pay 50% September campaign.
-- Idempotent campaign config and server-side wallet pricing validation.
-- Does not update products, orders, order_items, or historical finance rows.

INSERT INTO pos.discounts (
  source_id, name, code, discount_type, value, target_type, target_id,
  target_ids, formatted_id, is_active, min_order_value, start_date, end_date,
  start_time, end_time, days, is_happy_hour, product_prices, is_free_refill,
  refill_price, refill_availability, creation_time, raw
)
VALUES (
  'djiwa-pay-50-september-2026',
  'Djiwa Pay 50%',
  'DJIWA-PAY-50-SEPTEMBER-2026',
  'PERCENTAGE',
  50,
  'ALL',
  NULL,
  NULL,
  'DJIWA-PAY-50-SEPTEMBER-2026',
  true,
  NULL,
  (extract(epoch FROM timestamptz '2026-09-01 00:00:00+07') * 1000)::double precision,
  (extract(epoch FROM timestamptz '2026-09-30 00:00:00+07') * 1000)::double precision,
  NULL,
  NULL,
  NULL,
  false,
  NULL,
  false,
  NULL,
  NULL,
  extract(epoch FROM now()) * 1000,
  jsonb_build_object(
    'channel', 'djiwa_app',
    'payment_method', 'wallet',
    'base_price_filter', 30000,
    'badge_label', 'Djiwa Pay 50%',
    'campaign_type', 'djiwa_pay_campaign',
    'priority', 100
  )
)
ON CONFLICT (source_id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  discount_type = EXCLUDED.discount_type,
  value = EXCLUDED.value,
  target_type = EXCLUDED.target_type,
  is_active = EXCLUDED.is_active,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  is_happy_hour = EXCLUDED.is_happy_hour,
  raw = EXCLUDED.raw;

CREATE OR REPLACE FUNCTION pos.validate_djiwa_pay_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_product_subtotal numeric(18,2);
  v_campaign_discount numeric(18,2) := 0;
  v_existing_promo numeric(18,2) := 0;
  v_expected_total numeric(18,2);
  v_percent numeric := 20;
  v_metadata jsonb;
  v_campaign_active boolean := false;
  v_campaign_code text := 'DJIWA-PAY-50-SEPTEMBER-2026';
BEGIN
  SELECT * INTO v_order FROM pos.orders WHERE source_id = NEW.order_source_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(v_order.status, '')) IN ('paid', 'completed', 'settled', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_metadata := COALESCE(v_order.receipt_meta, '{}'::jsonb);
  SELECT COALESCE(SUM(COALESCE(price, 0) * GREATEST(quantity, 0)), 0)
    INTO v_product_subtotal
  FROM pos.order_items
  WHERE order_source_id = NEW.order_source_id
    AND COALESCE(status, '') IS DISTINCT FROM 'cancelled';

  SELECT EXISTS (
    SELECT 1 FROM pos.discounts d
    WHERE d.code = v_campaign_code
      AND d.is_active
      AND extract(epoch FROM now()) * 1000 >= COALESCE(d.start_date, 0)
      AND extract(epoch FROM now()) * 1000 <= COALESCE(d.end_date + 86399999, 9223372036854775)
      AND COALESCE(v_order.created_at, v_order.creation_time, 0) >= COALESCE(d.start_date, 0)
      AND COALESCE(v_order.created_at, v_order.creation_time, 0) <= COALESCE(d.end_date + 86399999, 9223372036854775)
  )
  INTO v_campaign_active;

  IF lower(COALESCE(v_order.payment_method, '')) IN ('wallet', 'djiwa_pay', 'djiwapay') THEN
    IF v_campaign_active
       AND lower(COALESCE(v_order.source, '')) = 'customer_self_service' THEN
      -- The client may carry an existing item promo price (for example Happy Hour),
      -- but the campaign floor for a qualifying Rp30.000 product is Rp15.000.
      -- Never accept a client price below that floor for a campaign item.
      IF EXISTS (
        SELECT 1
        FROM pos.order_items oi
        JOIN pos.products p ON p.source_id = oi.product_source_id
        WHERE oi.order_source_id = NEW.order_source_id
          AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled'
          AND p.price = 30000
          AND (oi.price < 15000 OR oi.price > p.price)
      ) THEN
        RAISE EXCEPTION 'Harga item Djiwa Pay 50%% tidak valid';
      END IF;

      -- Campaign items are sent to checkout at Rp15.000. Rebuild their gross
      -- subtotal from the master product so the database remains authoritative.
      SELECT COALESCE(SUM(
        CASE WHEN p.price = 30000
          THEN p.price * GREATEST(oi.quantity, 0)
          ELSE COALESCE(oi.price, 0) * GREATEST(oi.quantity, 0) END
      ), 0)
      INTO v_product_subtotal
      FROM pos.order_items oi
      LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled';

      SELECT COALESCE(SUM(
        CASE WHEN p.price = 30000
          THEN GREATEST(p.price - 15000, 0) * GREATEST(oi.quantity, 0)
          ELSE 0 END
      ), 0)
      INTO v_campaign_discount
      FROM pos.order_items oi
      LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled';

      v_existing_promo := GREATEST(0, COALESCE((v_metadata->>'promoDiscount')::numeric, 0));
      v_expected_total := GREATEST(0, v_product_subtotal - v_campaign_discount)
        + COALESCE(v_order.service_charge_amount, 0)
        + COALESCE(v_order.tax_amount, 0);

      UPDATE pos.orders
      SET discount_amount = v_campaign_discount + v_existing_promo,
          total_amount = v_expected_total,
          receipt_meta = v_metadata || jsonb_build_object(
            'djiwaPayDiscountPercent', 50,
            'djiwaPayDiscount', v_campaign_discount,
            'djiwaPayDiscountPaymentMethod', 'wallet',
            'djiwaPayCampaignCode', v_campaign_code,
            'djiwaPayCampaignLabel', 'Djiwa Pay 50%',
            'pricingVerifiedServerSide', true
          )
      WHERE source_id = NEW.order_source_id;
    ELSIF lower(COALESCE(v_order.source, '')) = 'customer_self_service' THEN
      -- Preserve the existing 20% Djiwa Pay benefit for customer wallet orders
      -- outside the September campaign path.
      v_percent := COALESCE(NULLIF((
        SELECT raw->>'djiwaPayDiscountPercent' FROM pos.site_settings
        ORDER BY creation_time DESC NULLS LAST LIMIT 1
      ), '')::numeric, 20);
      v_campaign_discount := LEAST(v_product_subtotal, ROUND(v_product_subtotal * v_percent / 100));
      v_expected_total := GREATEST(0, v_product_subtotal - v_campaign_discount)
        + COALESCE(v_order.service_charge_amount, 0)
        + COALESCE(v_order.tax_amount, 0);

      UPDATE pos.orders
      SET discount_amount = GREATEST(0, COALESCE(discount_amount, 0) - COALESCE((v_metadata->>'djiwaPayDiscount')::numeric, 0)) + v_campaign_discount,
          total_amount = v_expected_total,
          receipt_meta = v_metadata || jsonb_build_object(
            'djiwaPayDiscountPercent', v_percent,
            'djiwaPayDiscount', v_campaign_discount,
            'djiwaPayDiscountPaymentMethod', 'wallet',
            'pricingVerifiedServerSide', true
          )
      WHERE source_id = NEW.order_source_id;
    END IF;
  ELSE
    IF TG_OP = 'INSERT'
       AND ((v_metadata ? 'djiwaPayDiscount') OR (v_metadata ? 'djiwaPayDiscountPaymentMethod') OR (v_metadata ? 'djiwaPayCampaignCode')) THEN
      RAISE EXCEPTION 'Promo Djiwa Pay hanya berlaku untuk pembayaran Djiwa Pay';
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
