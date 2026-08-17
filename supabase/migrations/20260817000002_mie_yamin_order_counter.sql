-- Dedicated daily order numbering for Order Mie Yamin.
-- Internal pos.orders.source_id remains unchanged; only order_number is specialized.

CREATE TABLE IF NOT EXISTS pos.mie_yamin_order_counter (
    date TEXT PRIMARY KEY,
    last_no INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION pos.next_mie_yamin_order_no()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
    today TEXT := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD');
    next_no INTEGER;
BEGIN
    INSERT INTO pos.mie_yamin_order_counter (date, last_no)
    VALUES (today, 1)
    ON CONFLICT (date)
    DO UPDATE SET last_no = pos.mie_yamin_order_counter.last_no + 1
    RETURNING last_no INTO next_no;

    RETURN next_no;
END;
$$;

REVOKE ALL ON FUNCTION pos.next_mie_yamin_order_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.next_mie_yamin_order_no() TO anon, authenticated, service_role;
