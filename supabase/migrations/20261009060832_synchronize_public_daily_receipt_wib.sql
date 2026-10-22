-- Browser creation and the settlement fallback must use the same WIB counter.
-- Keep p_order_kind for API compatibility; it never partitions the sequence.
CREATE OR REPLACE FUNCTION public.next_daily_receipt_no(p_order_kind TEXT DEFAULT 'all')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, pg_temp
AS $$
DECLARE
    business_date TEXT := to_char(timezone('Asia/Jakarta', now()), 'YYYY-MM-DD');
    next_no INTEGER;
BEGIN
    INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
    VALUES (business_date, 'all', 1)
    ON CONFLICT (date, order_kind)
    DO UPDATE SET last_no = pos.daily_receipt_counter.last_no + 1
    RETURNING last_no INTO next_no;
    RETURN next_no;
END;
$$;

REVOKE ALL ON FUNCTION public.next_daily_receipt_no(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_daily_receipt_no(TEXT) TO anon, authenticated, service_role;

-- pos.next_daily_receipt_no already uses this same counter and WIB date.
-- Leave assign_receipt_on_settlement in place: its NULL guard makes it idempotent.
-- No historical orders or counter values are rewritten.
