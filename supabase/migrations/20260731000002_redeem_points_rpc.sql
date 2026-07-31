-- === RPC Tukar Poin (redeem) — atomic & anti-overdraft ===
-- Mengunci baris customer (FOR UPDATE), verifikasi kepemilikan via email
-- (Better Auth session dipegang app, bukan Supabase Auth), cek saldo,
-- potong poin, dan catat ledger dalam SATU transaksi.
-- Dipanggil dari edge function customer-sync (service_role).

CREATE OR REPLACE FUNCTION pos.redeem_points(
  p_source_id text,
  p_email text,
  p_reward_id text,
  p_reward_name text,
  p_cost integer,
  p_voucher_code text,
  p_reference_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pos, public
AS $$
DECLARE
  v_customer pos.customers%ROWTYPE;
  v_remaining integer;
BEGIN
  -- Ownership: email harus cocok dengan row customer.
  SELECT * INTO v_customer
  FROM pos.customers
  WHERE source_id = p_source_id
    AND lower(coalesce(email, '')) = lower(p_email)
    AND coalesce(email, '') <> ''
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OWNERSHIP_MISMATCH');
  END IF;

  IF COALESCE(v_customer.total_points, 0) < p_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS');
  END IF;

  v_remaining := COALESCE(v_customer.total_points, 0) - p_cost;

  UPDATE pos.customers
  SET total_points = v_remaining, updated_at = now()
  WHERE source_id = p_source_id;

  INSERT INTO pos.customer_point_ledger
    (customer_id, points, balance_after, reason, reference_id, note, created_at)
  VALUES
    (p_source_id, -p_cost, v_remaining, 'redeem', p_reference_id, p_reward_name, now());

  RETURN jsonb_build_object('ok', true, 'remaining', v_remaining, 'voucher_code', p_voucher_code);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.redeem_points(text, text, text, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.redeem_points(text, text, text, text, integer, text, text) TO anon;
