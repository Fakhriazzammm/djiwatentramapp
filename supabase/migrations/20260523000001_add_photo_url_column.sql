-- =============================================================================
-- Migration: Add photo_url column for employee profile photo
-- =============================================================================

alter table public.employee_onboarding_applications
  add column if not exists photo_url text;
