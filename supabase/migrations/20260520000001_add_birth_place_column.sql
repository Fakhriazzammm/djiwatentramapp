-- Add birth_place column to employee_onboarding_applications
ALTER TABLE public.employee_onboarding_applications
  ADD COLUMN IF NOT EXISTS birth_place text;
