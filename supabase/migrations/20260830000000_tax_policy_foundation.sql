-- Tax/PPN foundation only.
-- Additive and idempotent: preserves legacy site_settings/order amounts and rows.
-- This migration is intentionally not applied by this task.

CREATE SCHEMA IF NOT EXISTS pos;

CREATE TABLE IF NOT EXISTS pos.tax_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL DEFAULT 'default',
  policy_name text NOT NULL,
  tax_type text NOT NULL DEFAULT 'none'
    CHECK (tax_type IN ('ppn', 'pb1', 'none', 'custom')),
  rate_percent numeric(10,4) NOT NULL DEFAULT 0
    CHECK (rate_percent >= 0 AND rate_percent <= 100),
  tax_base_mode text NOT NULL DEFAULT 'subtotal_after_discount'
    CHECK (tax_base_mode = 'subtotal_after_discount'),
  service_charge_rate_percent numeric(10,4) NOT NULL DEFAULT 0
    CHECK (service_charge_rate_percent >= 0 AND service_charge_rate_percent <= 100),
  service_charge_taxable boolean NOT NULL DEFAULT false,
  rounding_mode text NOT NULL DEFAULT 'rupiah_nearest_thousand_half_down'
    CHECK (rounding_mode = 'rupiah_nearest_thousand_half_down'),
  is_active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  policy_version text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (source_id, policy_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_tax_policies_one_active_scope
  ON pos.tax_policies (source_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_pos_tax_policies_effective_window
  ON pos.tax_policies (source_id, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS ix_pos_tax_policies_active
  ON pos.tax_policies (is_active, effective_from);

-- Safe inactive baseline; it does not turn taxation on.
INSERT INTO pos.tax_policies (
  source_id, policy_name, tax_type, rate_percent,
  service_charge_rate_percent, is_active, policy_version, raw
) VALUES (
  'default', 'PBJT Makanan dan Minuman - Kota Tasikmalaya', 'pb1', 10,
  0, true, 'tasikmalaya-pbjt-10-v1', jsonb_build_object('seed', 'tax_policy_foundation', 'jurisdiction', 'Kota Tasikmalaya')
) ON CONFLICT (source_id, policy_version) DO NOTHING;

ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS tax_base_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS tax_rate_snapshot numeric(10,4),
  ADD COLUMN IF NOT EXISTS service_charge_base_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS service_charge_rate_snapshot numeric(10,4),
  ADD COLUMN IF NOT EXISTS raw_total_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(18,2),
  ADD COLUMN IF NOT EXISTS payment_channel_canonical text,
  ADD COLUMN IF NOT EXISTS tax_exemption_reason text,
  ADD COLUMN IF NOT EXISTS tax_policy_version text;

CREATE INDEX IF NOT EXISTS ix_pos_orders_tax_policy_version
  ON pos.orders (tax_policy_version)
  WHERE tax_policy_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pos_orders_payment_channel_canonical
  ON pos.orders (payment_channel_canonical)
  WHERE payment_channel_canonical IS NOT NULL;

CREATE TABLE IF NOT EXISTS pos.tax_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_source_id text,
  event_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  actor_source_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pos_tax_audit_events_order
  ON pos.tax_audit_events (order_source_id, created_at);
CREATE INDEX IF NOT EXISTS ix_pos_tax_audit_events_type_created
  ON pos.tax_audit_events (event_type, created_at);

CREATE TABLE IF NOT EXISTS pos.tax_period_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  tax_type text NOT NULL DEFAULT 'none'
    CHECK (tax_type IN ('ppn', 'pb1', 'none', 'custom')),
  taxable_base numeric(18,2) NOT NULL DEFAULT 0 CHECK (taxable_base >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  service_charge_base numeric(18,2) NOT NULL DEFAULT 0 CHECK (service_charge_base >= 0),
  service_charge_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (service_charge_amount >= 0),
  order_count integer NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'final', 'void')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS ix_pos_tax_period_summaries_period
  ON pos.tax_period_summaries (period_start, period_end);
CREATE INDEX IF NOT EXISTS ix_pos_tax_period_summaries_type
  ON pos.tax_period_summaries (tax_type, period_start);

-- Idempotent liability account seed. The guard keeps this migration parseable and
-- safe if accounting has not yet been installed in a fresh migration chain.
DO $$
BEGIN
  IF to_regclass('public.accounting_chart_of_accounts') IS NOT NULL THEN
    INSERT INTO public.accounting_chart_of_accounts
      (code, name, type, normal_balance, description)
    VALUES
      ('2-2100', 'Pajak Keluaran / PPN Terutang', 'liability', 'kredit',
       'Pajak keluaran yang dipungut dari pelanggan; klasifikasi wajib dikonfirmasi sebelum aktivasi')
    ON CONFLICT (code) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pos.canonical_payment_channel(
  p_source text,
  p_payment_method text,
  p_payment_choice text DEFAULT NULL,
  p_payment_receipt_kind text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_source text := lower(trim(coalesce(p_source, '')));
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_choice text := lower(trim(coalesce(p_payment_choice, '')));
  v_receipt text := lower(trim(coalesce(p_payment_receipt_kind, '')));
BEGIN
  IF v_source IN ('customer_self_service', 'customer', 'djiwa_app', 'djiwaapp')
     AND (v_choice IN ('cashier', 'cash', 'tunai') OR v_receipt = 'cashier_pending') THEN
    RETURN 'Djiwa App - Bayar Tunai di Kasir';
  ELSIF v_source IN ('customer_self_service', 'customer', 'djiwa_app', 'djiwaapp')
        AND (v_choice IN ('wallet', 'djiwa_pay', 'djiwapay') OR v_method IN ('wallet', 'djiwa_pay', 'djiwapay')) THEN
    RETURN 'Djiwa App - Djiwa Pay';
  ELSIF v_source IN ('customer_self_service', 'customer', 'djiwa_app', 'djiwaapp')
        AND (v_choice IN ('mayar', 'qris') OR v_method IN ('qris', 'qris_mayar', 'mayar')) THEN
    RETURN 'Djiwa App - QRIS';
  ELSIF v_source IN ('pos', 'cashier', 'kasir') AND v_method IN ('cash', 'tunai', 'cashier') THEN
    RETURN 'Bayar Tunai di Kasir';
  ELSIF v_source IN ('pos', 'cashier', 'kasir') AND v_method IN ('qris', 'qris_mayar', 'mayar') THEN
    RETURN 'QRIS di Kasir';
  END IF;
  RETURN 'Unknown';
END;
$$;

CREATE OR REPLACE FUNCTION pos.calculate_order_tax(
  p_items jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_tax_policy_id text DEFAULT NULL,
  p_service_charge_override numeric DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_choice text DEFAULT NULL,
  p_payment_receipt_kind text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public, pg_catalog
AS $$
DECLARE
  v_policy pos.tax_policies%ROWTYPE;
  v_item jsonb;
  v_subtotal numeric(18,2) := 0;
  v_discount numeric(18,2) := round(coalesce(p_discount_amount, 0), 2);
  v_tax_base numeric(18,2);
  v_service_rate numeric(10,4);
  v_tax_rate numeric(10,4);
  v_service_amount numeric(18,2);
  v_tax_amount numeric(18,2);
  v_raw_total numeric(18,2);
  v_final_total numeric(18,2);
  v_rounding numeric(18,2);
  v_channel text;
BEGIN
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'p_items must be a JSON array';
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Discount cannot be negative';
  END IF;

  IF p_tax_policy_id IS NULL THEN
    SELECT * INTO v_policy
    FROM pos.tax_policies
    WHERE is_active AND effective_from <= now()
      AND (effective_until IS NULL OR effective_until > now())
    ORDER BY effective_from DESC, created_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_policy
    FROM pos.tax_policies
    WHERE id::text = p_tax_policy_id OR policy_version = p_tax_policy_id
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0002', message = 'Tax policy not found';
    END IF;
    IF NOT v_policy.is_active OR v_policy.effective_from > now()
       OR (v_policy.effective_until IS NOT NULL AND v_policy.effective_until <= now()) THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'Tax policy is not active';
    END IF;
  END IF;

  IF NOT FOUND THEN
    v_tax_rate := 0;
    v_service_rate := 0;
  ELSE
    v_tax_rate := v_policy.rate_percent;
    v_service_rate := v_policy.service_charge_rate_percent;
  END IF;
  IF p_service_charge_override IS NOT NULL THEN
    IF p_service_charge_override < 0 OR p_service_charge_override > 100 THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'Service charge override is out of range';
    END IF;
    v_service_rate := p_service_charge_override;
  END IF;

  v_channel := pos.canonical_payment_channel(
    p_source, p_payment_method, p_payment_choice, p_payment_receipt_kind
  );
  IF v_channel IN ('Bayar Tunai di Kasir', 'Djiwa App - Bayar Tunai di Kasir') THEN
    v_tax_rate := 0;
    v_service_rate := 0;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    IF coalesce((v_item->>'quantity')::numeric, 0) < 0
       OR coalesce((v_item->>'price')::numeric, 0) < 0 THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'Item quantity and price cannot be negative';
    END IF;
    v_subtotal := v_subtotal + round(
      coalesce((v_item->>'price')::numeric, 0) * coalesce((v_item->>'quantity')::numeric, 0), 2);
  END LOOP;

  v_tax_base := greatest(v_subtotal - v_discount, 0);
  v_service_amount := round(v_tax_base * v_service_rate / 100, 2);
  v_tax_amount := round(v_tax_base * v_tax_rate / 100, 2);
  v_raw_total := v_tax_base + v_service_amount + v_tax_amount;
  v_final_total := floor(v_raw_total / 1000) * 1000
    + CASE WHEN v_raw_total - floor(v_raw_total / 1000) * 1000 > 500 THEN 1000 ELSE 0 END;
  v_rounding := v_final_total - v_raw_total;

  RETURN jsonb_build_object(
    'subtotalAmount', v_subtotal,
    'discountAmount', v_discount,
    'taxBaseAmount', v_tax_base,
    'taxRate', v_tax_rate,
    'taxAmount', v_tax_amount,
    'serviceChargeBaseAmount', v_tax_base,
    'serviceChargeRate', v_service_rate,
    'serviceChargeAmount', v_service_amount,
    'rawTotalAmount', v_raw_total,
    'roundingAdjustment', v_rounding,
    'totalAmount', v_final_total,
    'paymentChannelCanonical', v_channel,
    'taxPolicyVersion', coalesce(v_policy.policy_version, 'none'),
    'taxType', coalesce(v_policy.tax_type, 'none'),
    'roundingMode', 'rupiah_nearest_thousand_half_down'
  );
END;
$$;

-- Recreate only the public projection; existing columns/order rows remain intact.
CREATE OR REPLACE VIEW public.pos_orders AS
SELECT
  o.source_id AS _id,
  COALESCE(o.creation_time, o.created_at) AS "_creationTime",
  o.order_number AS "orderNumber",
  o.total_amount AS "totalAmount",
  o.status,
  o.payment_method AS "paymentMethod",
  o.customer_name AS "customerName",
  o.customer_email AS "customerEmail",
  o.customer_description AS "customerDescription",
  o.table_number AS "tableNumber",
  o.order_type AS "orderType",
  o.source,
  o.brand_slug AS "brandSlug",
  o.business_unit AS "businessUnit",
  o.source_app AS "sourceApp",
  o.guest_count AS "guestCount",
  o.free_refill_selected AS "freeRefillSelected",
  o.dessert_later AS "dessertLater",
  o.notes,
  o.created_at AS "createdAt",
  o.voucher_source_id AS "voucherId",
  o.discount_amount AS "discountAmount",
  o.tax_amount AS "taxAmount",
  o.service_charge_amount AS "serviceChargeAmount",
  o.receipt_meta AS "receiptMeta",
  o.payment_receipt_kind AS "paymentReceiptKind",
  o.payment_gateway AS "paymentGateway",
  o.gateway_invoice_id AS "gatewayInvoiceId",
  o.auth_user_id AS "authUserId",
  o.daily_receipt_no,
  o.receipt_kind,
  o.customer_source_id AS "customerSourceId",
  o.delivery_date AS "deliveryDate",
  o.delivery_provider AS "deliveryProvider",
  o.delivery_status AS "deliveryStatus",
  o.delivery_contact_name AS "deliveryContactName",
  o.delivery_contact_phone AS "deliveryContactPhone",
  o.delivery_address AS "deliveryAddress",
  o.delivery_notes AS "deliveryNotes",
  o.booking_source_id AS "bookingSourceId",
  o.booking_code AS "bookingCode",
  o.booking_date AS "bookingDate",
  o.booking_type_key AS "bookingTypeKey",
  o.booking_type_label AS "bookingTypeLabel",
  o.event_type_key AS "eventTypeKey",
  o.event_type_label AS "eventTypeLabel",
  o.event_type_other AS "eventTypeOther",
  o.arrival_time AS "arrivalTime",
  COALESCE(NULLIF(o.raw->>'platform', ''), NULLIF(o.raw->>'orderPlatform', ''), NULLIF(o.receipt_meta->>'platform', '')) AS platform,
  COALESCE(oi_items.items, '[]'::jsonb) AS items,
  o.subtotal_amount AS "subtotalAmount",
  o.tax_base_amount AS "taxBaseAmount",
  o.tax_rate_snapshot AS "taxRateSnapshot",
  o.service_charge_base_amount AS "serviceChargeBaseAmount",
  o.service_charge_rate_snapshot AS "serviceChargeRateSnapshot",
  o.raw_total_amount AS "rawTotalAmount",
  o.rounding_adjustment AS "roundingAdjustment",
  o.payment_channel_canonical AS "paymentChannelCanonical",
  o.tax_exemption_reason AS "taxExemptionReason",
  o.tax_policy_version AS "taxPolicyVersion"
FROM pos.orders o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'productId', oi.product_source_id,
    'productName', oi.product_name,
    'variant', oi.variant,
    'quantity', oi.quantity,
    'price', oi.price,
    'originalPrice', oi.original_price,
    'status', oi.status,
    'hppSnapshot', oi.hpp_snapshot
  ) ORDER BY oi.line_no) AS items
  FROM pos.order_items oi
  WHERE oi.order_source_id = o.source_id
) oi_items ON true;

-- Custom auth deployments use anon for browser writes. Audit payloads stay private.
GRANT USAGE ON SCHEMA pos TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON pos.tax_policies TO anon, authenticated, service_role;
GRANT SELECT ON pos.tax_period_summaries TO anon, authenticated, service_role;
GRANT SELECT ON public.pos_orders TO anon, authenticated, service_role;
GRANT ALL ON pos.tax_policies, pos.tax_audit_events, pos.tax_period_summaries TO service_role;
GRANT EXECUTE ON FUNCTION pos.canonical_payment_channel(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pos.calculate_order_tax(jsonb, numeric, text, numeric, text, text, text, text) TO anon, authenticated, service_role;

ALTER TABLE pos.tax_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_policies_read ON pos.tax_policies;
CREATE POLICY tax_policies_read ON pos.tax_policies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tax_policies_write ON pos.tax_policies;
CREATE POLICY tax_policies_write ON pos.tax_policies FOR INSERT TO service_role
  WITH CHECK (rate_percent BETWEEN 0 AND 100 AND service_charge_rate_percent BETWEEN 0 AND 100);
DROP POLICY IF EXISTS tax_policies_update ON pos.tax_policies;
CREATE POLICY tax_policies_update ON pos.tax_policies FOR UPDATE TO service_role
  USING (true) WITH CHECK (rate_percent BETWEEN 0 AND 100 AND service_charge_rate_percent BETWEEN 0 AND 100);

ALTER TABLE pos.tax_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_audit_events_service_read ON pos.tax_audit_events;
CREATE POLICY tax_audit_events_service_read ON pos.tax_audit_events FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS tax_audit_events_service_insert ON pos.tax_audit_events;
CREATE POLICY tax_audit_events_service_insert ON pos.tax_audit_events FOR INSERT TO service_role WITH CHECK (true);

ALTER TABLE pos.tax_period_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_period_summaries_read ON pos.tax_period_summaries;
CREATE POLICY tax_period_summaries_read ON pos.tax_period_summaries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tax_period_summaries_service_write ON pos.tax_period_summaries;
CREATE POLICY tax_period_summaries_service_write ON pos.tax_period_summaries FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
