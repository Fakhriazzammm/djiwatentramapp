-- =============================================================================
-- Add email column to yumi_users and employee_onboarding_applications
-- 
-- Latar belakang:
--   yumi_users belum memiliki kolom email. Email diperlukan untuk integrasi
--   dengan external identity provider dan notification system.
--   Backfill menggunakan username@djiwa.internal untuk user yang belum
--   memiliki email.
-- =============================================================================

-- =============================================================================
-- PART 1: Add email column to yumi_users
-- =============================================================================
alter table public.yumi_users
  add column if not exists email text;

-- =============================================================================
-- PART 2: Backfill email untuk user yang NULL
-- =============================================================================
update public.yumi_users
  set email = trim(username) || '@djiwa.internal'
  where email is null;

-- =============================================================================
-- PART 3: Pastikan kolom email ada di employee_onboarding_applications
-- =============================================================================
alter table public.employee_onboarding_applications
  add column if not exists email text;
