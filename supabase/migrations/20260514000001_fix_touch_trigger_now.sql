-- Fix: touch_employee_onboarding_updated_at trigger was calling now()
-- which returns milliseconds epoch instead of timestamptz.
-- Use CURRENT_TIMESTAMP instead (SQL standard, always correct).

create or replace function public.touch_employee_onboarding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = CURRENT_TIMESTAMP;
  return new;
end;
$$;
