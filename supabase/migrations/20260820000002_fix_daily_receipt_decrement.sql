-- Fix daily receipt gaps after order deletion.
-- The counter is shared across all order types, so decrement must target `all`.

CREATE OR REPLACE FUNCTION pos.decrement_daily_receipt_no(
    p_order_kind TEXT DEFAULT 'all',
    p_last_no INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
BEGIN
    IF p_last_no IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE pos.daily_receipt_counter
    SET last_no = last_no - 1
    WHERE date = today
      AND order_kind = 'all'
      AND last_no = p_last_no;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION pos.decrement_daily_receipt_no(TEXT, INTEGER) TO anon, authenticated;
