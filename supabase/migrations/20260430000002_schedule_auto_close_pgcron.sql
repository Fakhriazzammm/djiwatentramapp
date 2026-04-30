-- Migration: Schedule auto_close_overdue_shifts via pg_cron
-- Runs every 10 minutes, fully automated within Supabase

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the auto-close job (runs every 10 minutes)
SELECT cron.schedule(
  'auto-close-overdue-shifts',
  '*/10 * * * *',
  $$SELECT public.auto_close_overdue_shifts();$$
);
