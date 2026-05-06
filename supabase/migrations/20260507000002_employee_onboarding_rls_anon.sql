-- Fix RLS: allow anon (Better Auth client) to SELECT and UPDATE employee_onboarding_applications
-- The admin uses Better Auth (not Supabase Auth), so the Supabase client has no auth token
-- and is treated as anon. Without this policy, the admin cannot see or update applications.

drop policy if exists "employee_onboarding_anon_select" on public.employee_onboarding_applications;
create policy "employee_onboarding_anon_select"
  on public.employee_onboarding_applications
  for select to anon, authenticated
  using (true);

drop policy if exists "employee_onboarding_anon_update" on public.employee_onboarding_applications;
create policy "employee_onboarding_anon_update"
  on public.employee_onboarding_applications
  for update to anon, authenticated
  using (true)
  with check (status in ('pending', 'approved', 'rejected', 'needs_revision'));

grant select, update on public.employee_onboarding_applications to anon, authenticated;
