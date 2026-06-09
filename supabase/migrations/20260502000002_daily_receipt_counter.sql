-- Daily receipt numbering: single shared counter per day (all types use same counter)
-- Run via Supabase SQL Editor or Management API
--
-- 2026-06-09: Changed from per-type (dine_in/takeaway/online) to single shared counter
-- The RPC function now ignores p_order_kind and always uses order_kind='all'

-- 1. Create counter table
CREATE TABLE IF NOT EXISTS pos.daily_receipt_counter (
    date TEXT NOT NULL,
    order_kind TEXT NOT NULL DEFAULT 'all',
    last_no INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, order_kind)
);

-- 2. Create function to get next receipt number (single shared counter)
CREATE OR REPLACE FUNCTION pos.next_daily_receipt_no(p_order_kind TEXT DEFAULT 'all')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    next_no INTEGER;
BEGIN
    INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
    VALUES (today, 'all', 1)
    ON CONFLICT (date, order_kind)
    DO UPDATE SET last_no = pos.daily_receipt_counter.last_no + 1
    RETURNING last_no INTO next_no;

    RETURN next_no;
END;
$$;

-- 3. Add columns to pos.orders
ALTER TABLE pos.orders
ADD COLUMN IF NOT EXISTS daily_receipt_no INTEGER,
ADD COLUMN IF NOT EXISTS receipt_kind TEXT;
