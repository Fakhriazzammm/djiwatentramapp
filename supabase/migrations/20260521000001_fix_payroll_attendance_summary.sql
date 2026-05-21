-- ============================================================
-- Fix: Add attendance summary function + slug column to payslips
-- Project: xaemykhjpkgypqqpfdcb (Supabase ref)
-- Schema: pos
-- Date: 2026-05-21
-- 
-- 1. Function: pos.get_attendance_summary_for_period(p_start_date, p_end_date)
--    - Returns per-user attendance summary filtered by date range
--    - Replaces the view's logic with a parameterized function for payroll use
--    - Idempotent via CREATE OR REPLACE
--
-- 2. Add slug column to pos.payslips
--    - Idempotent via ADD COLUMN IF NOT EXISTS
-- ============================================================

-- ============================================================
-- 1. Function: pos.get_attendance_summary_for_period
-- Returns attendance summary for a given date range,
-- aggregating check_in records per user.
-- ============================================================
CREATE OR REPLACE FUNCTION pos.get_attendance_summary_for_period(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE(
    user_id          TEXT,
    user_name        TEXT,
    role_name        TEXT,
    total_days_worked BIGINT,
    total_shifts     BIGINT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        a."userId"                        AS user_id,
        a."userName"                      AS user_name,
        a."roleName"                      AS role_name,
        COUNT(DISTINCT date(to_timestamp(
            (a.raw->>'timestamp')::numeric / 1000
        )))                               AS total_days_worked,
        COUNT(DISTINCT a._id)             AS total_shifts
    FROM public.pos_attendance_logs a
    WHERE a.type = 'check_in'
      AND a.raw->>'timestamp' IS NOT NULL
      AND date(to_timestamp(
            (a.raw->>'timestamp')::numeric / 1000
          )) BETWEEN p_start_date AND p_end_date
    GROUP BY a."userId", a."userName", a."roleName"
    ORDER BY a."userName";
$$;

COMMENT ON FUNCTION pos.get_attendance_summary_for_period IS
    'Returns attendance summary (days worked and shift count) per user for a given date range. Filters individual check_in records.';

-- ============================================================
-- 2. Add slug column to pos.payslips
-- For URL-friendly identifier / public link generation
-- ============================================================
ALTER TABLE pos.payslips
    ADD COLUMN IF NOT EXISTS slug TEXT;

COMMENT ON COLUMN pos.payslips.slug IS
    'URL-friendly unique identifier for public payslip access';

-- ============================================================
-- Migration complete
-- ============================================================
