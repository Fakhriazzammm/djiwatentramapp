-- Change rounding policy to always round down to the previous Rp1,000.
ALTER TABLE pos.tax_policies
  DROP CONSTRAINT IF EXISTS tax_policies_rounding_mode_check;

UPDATE pos.tax_policies
SET rounding_mode = 'rupiah_thousand_floor', updated_at = now()
WHERE rounding_mode <> 'rupiah_thousand_floor';

ALTER TABLE pos.tax_policies
  ADD CONSTRAINT tax_policies_rounding_mode_check
  CHECK (rounding_mode = 'rupiah_thousand_floor');

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
SET search_path = pos, public, pg_temp
AS $$
DECLARE
  v_policy pos.tax_policies;
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

  SELECT * INTO v_policy
  FROM pos.tax_policies
  WHERE is_active
    AND effective_from <= now()
    AND (effective_until IS NULL OR effective_until > now())
    AND (p_tax_policy_id IS NULL OR source_id = p_tax_policy_id)
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  v_tax_rate := coalesce(v_policy.rate_percent, 0);
  v_service_rate := coalesce(p_service_charge_override, v_policy.service_charge_rate_percent, 0);
  v_channel := pos.canonical_payment_channel(p_source, p_payment_method, p_payment_choice, p_payment_receipt_kind);

  IF v_channel IN ('Bayar Tunai di Kasir', 'Djiwa App - Bayar Tunai di Kasir') THEN
    v_tax_rate := 0;
    v_service_rate := 0;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    v_subtotal := v_subtotal + round(
      greatest(0, coalesce((v_item->>'price')::numeric, 0)) *
      greatest(0, coalesce((v_item->>'quantity')::numeric, 0)), 2
    );
  END LOOP;

  v_tax_base := greatest(0, v_subtotal - greatest(0, v_discount));
  v_service_amount := round(v_tax_base * v_service_rate / 100, 2);
  v_tax_amount := round(v_tax_base * v_tax_rate / 100, 2);
  v_raw_total := v_tax_base + v_service_amount + v_tax_amount;
  v_final_total := floor(v_raw_total / 1000) * 1000;
  v_rounding := v_final_total - v_raw_total;

  RETURN jsonb_build_object(
    'taxRate', v_tax_rate,
    'taxType', coalesce(v_policy.tax_type, 'none'),
    'taxAmount', v_tax_amount,
    'totalAmount', v_final_total,
    'roundingMode', 'rupiah_thousand_floor',
    'taxBaseAmount', v_tax_base,
    'discountAmount', greatest(0, v_discount),
    'rawTotalAmount', v_raw_total,
    'subtotalAmount', v_subtotal,
    'taxPolicyVersion', coalesce(v_policy.policy_version, 'none'),
    'serviceChargeRate', v_service_rate,
    'roundingAdjustment', v_rounding,
    'serviceChargeAmount', v_service_amount,
    'paymentChannelCanonical', v_channel,
    'serviceChargeBaseAmount', v_tax_base
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pos.calculate_order_tax(jsonb, numeric, text, numeric, text, text, text, text)
  TO anon, authenticated, service_role;
