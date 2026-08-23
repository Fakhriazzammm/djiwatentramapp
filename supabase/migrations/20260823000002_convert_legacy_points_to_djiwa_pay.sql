-- One-time conversion: legacy Yumi Poin -> Djiwa Pay at 1 point = Rp1.
-- Idempotent: each customer can be converted only once.
-- Historical point ledger is preserved; active point columns are cleared.

CREATE TABLE IF NOT EXISTS pos.customer_wallet_conversion_log (
  customer_id text PRIMARY KEY REFERENCES pos.customers(source_id),
  points_converted bigint NOT NULL CHECK (points_converted >= 0),
  amount_credited bigint NOT NULL CHECK (amount_credited >= 0),
  conversion_rate bigint NOT NULL DEFAULT 1 CHECK (conversion_rate = 1),
  idempotency_key text NOT NULL UNIQUE,
  converted_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION pos.convert_legacy_points_to_djiwa_pay()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_customer record;
  v_wallet pos.customer_wallets;
  v_points bigint;
  v_balance bigint;
  v_converted bigint := 0;
  v_amount bigint := 0;
BEGIN
  FOR v_customer IN
    SELECT source_id, total_points
    FROM pos.customers
    WHERE is_active = true AND COALESCE(total_points, 0) > 0
    ORDER BY source_id
  LOOP
    IF EXISTS (SELECT 1 FROM pos.customer_wallet_conversion_log WHERE customer_id = v_customer.source_id) THEN
      CONTINUE;
    END IF;

    v_points := COALESCE(v_customer.total_points, 0);
    PERFORM pos.wallet_ensure(v_customer.source_id);
    SELECT * INTO v_wallet
    FROM pos.customer_wallets
    WHERE customer_id = v_customer.source_id
    FOR UPDATE;

    IF v_wallet.status <> 'active' THEN
      RAISE EXCEPTION 'Wallet customer % sedang diblokir', v_customer.source_id;
    END IF;

    v_balance := v_wallet.available_balance + v_points;

    UPDATE pos.customer_wallets
    SET available_balance = v_balance,
        total_credited = total_credited + v_points,
        updated_at = now()
    WHERE customer_id = v_customer.source_id;

    INSERT INTO pos.customer_wallet_ledger (
      customer_id, amount, direction, balance_after, status,
      transaction_type, reference_type, reference_id, idempotency_key,
      note, created_by
    ) VALUES (
      v_customer.source_id, v_points, 'credit', v_balance, 'completed',
      'adjustment', 'legacy_points_conversion', v_customer.source_id,
      'legacy_points_conversion_' || v_customer.source_id,
      'Konversi Yumi Poin lama ke Djiwa Pay dengan rasio 1 poin = Rp1',
      'system'
    );

    INSERT INTO pos.customer_wallet_conversion_log (
      customer_id, points_converted, amount_credited, conversion_rate, idempotency_key
    ) VALUES (
      v_customer.source_id, v_points, v_points, 1,
      'legacy_points_conversion_' || v_customer.source_id
    );

    UPDATE pos.customers
    SET total_points = 0,
        lifetime_points = 0,
        raw = jsonb_set(
          COALESCE(raw, '{}'::jsonb),
          '{legacyPointsConverted}',
          jsonb_build_object(
            'points', v_points,
            'rate', 1,
            'amount', v_points,
            'convertedAt', now()
          ),
          true
        ),
        updated_at = now()
    WHERE source_id = v_customer.source_id;

    v_converted := v_converted + 1;
    v_amount := v_amount + v_points;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'customers_converted', v_converted,
    'amount_credited', v_amount,
    'conversion_rate', 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pos.convert_legacy_points_to_djiwa_pay() TO service_role;

SELECT pos.convert_legacy_points_to_djiwa_pay();
REVOKE EXECUTE ON FUNCTION pos.convert_legacy_points_to_djiwa_pay() FROM PUBLIC, anon, authenticated;
