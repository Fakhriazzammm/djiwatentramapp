-- Migration: Decrement daily receipt counter on order delete (fill gap)
-- Hanya decrement jika last_no masih sama (guard: tidak decrement kalau sudah ada order lebih tinggi)
-- Run via Supabase SQL Editor or Management API

CREATE OR REPLACE FUNCTION pos.decrement_daily_receipt_no(p_order_kind TEXT DEFAULT 'all', p_last_no INTEGER DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND order_kind = p_order_kind
      AND last_no = p_last_no;   -- hanya decrement kalau masih nomor tertinggi

    RETURN FOUND;
END;
$$;
