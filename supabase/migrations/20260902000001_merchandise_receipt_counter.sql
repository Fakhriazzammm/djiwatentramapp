-- Merchandise gets an isolated daily receipt sequence.
-- Existing POS/customer calls continue using the shared `all` counter.

CREATE OR REPLACE FUNCTION pos.next_daily_receipt_no(p_order_kind TEXT DEFAULT 'all')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    counter_kind TEXT := CASE
        WHEN lower(coalesce(p_order_kind, 'all')) = 'merchandise' THEN 'merchandise'
        ELSE 'all'
    END;
    next_no INTEGER;
BEGIN
    INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
    VALUES (today, counter_kind, 1)
    ON CONFLICT (date, order_kind)
    DO UPDATE SET last_no = pos.daily_receipt_counter.last_no + 1
    RETURNING last_no INTO next_no;

    RETURN next_no;
END;
$$;

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
    counter_kind TEXT := CASE
        WHEN lower(coalesce(p_order_kind, 'all')) = 'merchandise' THEN 'merchandise'
        ELSE 'all'
    END;
BEGIN
    IF p_last_no IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE pos.daily_receipt_counter
    SET last_no = last_no - 1
    WHERE date = today
      AND order_kind = counter_kind
      AND last_no = p_last_no;

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION pos.next_daily_receipt_no(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.decrement_daily_receipt_no(TEXT, INTEGER) TO anon, authenticated;