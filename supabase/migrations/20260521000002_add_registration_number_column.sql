-- Add registration_number and employee_nip columns to employee_onboarding_applications
alter table public.employee_onboarding_applications
  add column if not exists registration_number text,
  add column if not exists employee_nip text;

create unique index if not exists idx_employee_onboarding_registration_number
  on public.employee_onboarding_applications (registration_number)
  where registration_number is not null;
