-- Daily receipt numbering: separate counter per type, reset daily
-- Run via Supabase SQL Editor or Management API

-- 1. Create counter table
CREATE TABLE IF NOT EXISTS pos.daily_receipt_counter (
    date DATE NOT NULL,
    order_kind TEXT NOT NULL CHECK (order_kind IN ('dine_in', 'takeaway', 'online')),
    last_no INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, order_kind)
);

-- 2. Create function to get next receipt number
CREATE OR REPLACE FUNCTION pos.next_daily_receipt_no(p_order_kind TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today DATE := CURRENT_DATE;
    next_no INTEGER;
BEGIN
    INSERT INTO pos.daily_receipt_counter (date, order_kind, last_no)
    VALUES (today, p_order_kind, 1)
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
