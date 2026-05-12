-- =============================================================================
-- Migration: Add cv_url column for candidate CV uploads
-- =============================================================================

alter table public.employee_onboarding_applications
  add column if not exists cv_url text;
