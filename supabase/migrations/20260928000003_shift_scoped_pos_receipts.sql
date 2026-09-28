-- Shift-scoped POS receipt numbering.
-- Existing daily counters remain for non-POS/customer channels; POS orders
-- receive a fresh counter per opened shift.
ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS shift_source_id text;

CREATE OR REPLACE FUNCTION pos.next_shift_receipt_no(p_shift_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_key text := 'shift:' || NULLIF(trim(p_shift_id), '');
  v_next integer;
BEGIN
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'shift_id wajib diisi';
  END IF;
  INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
  VALUES (v_key, 'all', 1)
  ON CONFLICT (date, order_kind)
  DO UPDATE SET last_no = pos.daily_receipt_counter.last_no + 1
  RETURNING last_no INTO v_next;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION pos.decrement_shift_receipt_no(p_shift_id text, p_last_no integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_key text := 'shift:' || NULLIF(trim(p_shift_id), '');
  v_updated integer;
BEGIN
  IF v_key IS NULL OR p_last_no IS NULL THEN RETURN false; END IF;
  UPDATE pos.daily_receipt_counter
  SET last_no = p_last_no - 1
  WHERE date = v_key AND order_kind = 'all' AND last_no = p_last_no AND p_last_no > 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION pos.next_shift_receipt_no(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pos.decrement_shift_receipt_no(text, integer) TO anon, authenticated, service_role;
