-- Happy Hour Makan Siang (11:00-13:00) & Makan Malam (18:00-20:00) tetap aktif.
-- Migrasi ini memastikan diskon tidak pernah DOBEL (stack):
--   1. Jika order wallet customer_self_service memuat item yang valid utk kampanye
--      Djiwa Pay 50% (harga master Rp30.000) DAN kampanye sedang aktif ->
--      jalur kampanye, item Rp30.000 wajib Rp15.000, tanpa potongan tambahan.
--   2. Jika TIDAK ada item yang sudah terdiskon (price < master price, mis. HH) ->
--      loyalty Djiwa Pay (default 20%) boleh dipotong sekali di level order.
--   3. Jika SUDAH ADA item promo/Happy Hour di order (price < master price) ->
--      JANGAN potong loyalty order-level lagi (anti-stack).
-- Data order lama tidak pernah diubah; hanya transaksi baru yang divalidasi.

CREATE OR REPLACE FUNCTION pos.validate_djiwa_pay_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_product_subtotal numeric(18,2);
  v_campaign_discount numeric(18,2) := 0;
  v_expected_total numeric(18,2);
  v_percent numeric := 20;
  v_metadata jsonb;
  v_campaign_code text := 'DJIWA-PAY-50-SEPTEMBER-2026';
  v_campaign_active boolean := false;
  v_has_qualifying_product boolean := false;
  v_has_discounted_item boolean := false;
BEGIN
  SELECT * INTO v_order FROM pos.orders WHERE source_id = NEW.order_source_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Historical/closed orders are never rewritten.
  IF TG_OP = 'UPDATE' AND lower(COALESCE(v_order.status, '')) IN ('paid', 'completed', 'settled', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_metadata := COALESCE(v_order.receipt_meta, '{}'::jsonb);

  SELECT EXISTS (
    SELECT 1 FROM pos.discounts d
    WHERE d.code = v_campaign_code AND d.is_active
      AND extract(epoch FROM now()) * 1000 BETWEEN COALESCE(d.start_date, 0) AND COALESCE(d.end_date + 86399999, 9223372036854775)
      AND COALESCE(v_order.created_at, v_order.creation_time, 0) BETWEEN COALESCE(d.start_date, 0) AND COALESCE(d.end_date + 86399999, 9223372036854775)
      AND (now() AT TIME ZONE 'Asia/Jakarta')::time >= COALESCE(NULLIF(d.start_time, '')::time, time '00:00')
      AND (now() AT TIME ZONE 'Asia/Jakarta')::time <= COALESCE(NULLIF(d.end_time, '')::time, time '23:59:59')
  ) INTO v_campaign_active;

  IF lower(COALESCE(v_order.payment_method, '')) IN ('wallet', 'djiwa_pay', 'djiwapay')
     AND lower(COALESCE(v_order.source, '')) = 'customer_self_service' THEN

    -- Order harus merujuk produk yang valid (menghindari manipulasi produk).
    IF EXISTS (
      SELECT 1 FROM pos.order_items oi
      LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled'
        AND p.source_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Produk order tidak valid untuk verifikasi promo Djiwa Pay';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pos.order_items oi
      JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled'
        AND p.price = 30000
        AND GREATEST(oi.quantity, 0) > 0
    ) INTO v_has_qualifying_product;

    -- Ada item yang harganya sudah di bawah harga master (promo/Happy Hour)?
    SELECT EXISTS (
      SELECT 1 FROM pos.order_items oi
      JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled'
        AND oi.price < p.price
    ) INTO v_has_discounted_item;

    IF v_campaign_active
       AND lower(COALESCE(v_order.brand_slug, 'djiwatentram')) = 'djiwatentram'
       AND v_has_qualifying_product THEN
      -- ── JALUR KAMPANYE DJIWA PAY 50% ─────────────────────────────
      IF EXISTS (
        SELECT 1 FROM pos.order_items oi
        JOIN pos.products p ON p.source_id = oi.product_source_id
        WHERE oi.order_source_id = NEW.order_source_id
          AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled'
          AND p.price = 30000
          AND (oi.price <> 15000 OR oi.original_price IS DISTINCT FROM 30000)
      ) THEN
        RAISE EXCEPTION 'Harga item promo Djiwa Pay harus Rp15.000 dari harga master Rp30.000';
      END IF;

      SELECT COALESCE(SUM(
        CASE WHEN p.price = 30000 THEN p.price * GREATEST(oi.quantity, 0)
             ELSE oi.price * GREATEST(oi.quantity, 0) END
      ), 0),
      COALESCE(SUM(CASE WHEN p.price = 30000 THEN 15000 * GREATEST(oi.quantity, 0) ELSE 0 END), 0)
      INTO v_product_subtotal, v_campaign_discount
      FROM pos.order_items oi
      JOIN pos.products p ON p.source_id = oi.product_source_id
      WHERE oi.order_source_id = NEW.order_source_id
        AND COALESCE(oi.status, '') IS DISTINCT FROM 'cancelled';

      v_expected_total := GREATEST(0, v_product_subtotal - v_campaign_discount)
        + COALESCE(v_order.service_charge_amount, 0) + COALESCE(v_order.tax_amount, 0);

      UPDATE pos.orders
      SET discount_amount = v_campaign_discount,
          total_amount = v_expected_total,
          receipt_meta = v_metadata || jsonb_build_object(
            'djiwaPayDiscountPercent', 50,
            'djiwaPayDiscount', v_campaign_discount,
            'djiwaPayDiscountPaymentMethod', 'wallet',
            'djiwaPayCampaignCode', v_campaign_code,
            'djiwaPayCampaignLabel', 'Djiwa Pay 50%',
            'pricingVerifiedServerSide', true,
            'stackingPrevented', true
          )
      WHERE source_id = NEW.order_source_id;

    ELSIF NOT v_has_discounted_item THEN
      -- ── JALUR LOYALTY DJIWA PAY (20%) — hanya jika TIDAK ada item promo/HH ──
      SELECT COALESCE(SUM(COALESCE(price, 0) * GREATEST(quantity, 0)), 0)
      INTO v_product_subtotal FROM pos.order_items
      WHERE order_source_id = NEW.order_source_id AND COALESCE(status, '') IS DISTINCT FROM 'cancelled';

      v_percent := COALESCE(NULLIF((SELECT raw->>'djiwaPayDiscountPercent' FROM pos.site_settings ORDER BY creation_time DESC NULLS LAST LIMIT 1), '')::numeric, 20);
      v_campaign_discount := LEAST(v_product_subtotal, ROUND(v_product_subtotal * v_percent / 100));
      v_expected_total := GREATEST(0, v_product_subtotal - v_campaign_discount)
        + COALESCE(v_order.service_charge_amount, 0) + COALESCE(v_order.tax_amount, 0);

      UPDATE pos.orders
      SET discount_amount = v_campaign_discount,
          total_amount = v_expected_total,
          receipt_meta = v_metadata || jsonb_build_object(
            'djiwaPayDiscountPercent', v_percent,
            'djiwaPayDiscount', v_campaign_discount,
            'djiwaPayDiscountPaymentMethod', 'wallet',
            'pricingVerifiedServerSide', true
          )
      WHERE source_id = NEW.order_source_id;

    ELSE
      -- ── ANTI-STACK: sudah ada item promo/Happy Hour → jangan potong loyalty lagi ──
      SELECT COALESCE(SUM(COALESCE(price, 0) * GREATEST(quantity, 0)), 0)
      INTO v_product_subtotal FROM pos.order_items
      WHERE order_source_id = NEW.order_source_id AND COALESCE(status, '') IS DISTINCT FROM 'cancelled';

      v_expected_total := GREATEST(0, v_product_subtotal)
        + COALESCE(v_order.service_charge_amount, 0) + COALESCE(v_order.tax_amount, 0);

      UPDATE pos.orders
      SET discount_amount = 0,
          total_amount = v_expected_total,
          receipt_meta = v_metadata || jsonb_build_object(
            'pricingVerifiedServerSide', true,
            'stackingPrevented', true
          )
      WHERE source_id = NEW.order_source_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION pos.validate_djiwa_pay_order_pricing() TO service_role;
