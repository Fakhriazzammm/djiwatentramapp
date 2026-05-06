-- Fix RLS for Better Auth integration (admin uses anon key)
-- Previous policies only allowed authenticated role, but the app uses Better Auth
-- so the Supabase client doesn't have an auth token and is treated as anon.

drop policy if exists "employee_onboarding_authenticated_select" on public.employee_onboarding_applications;

create policy "employee_onboarding_anon_select"
  on public.employee_onboarding_applications
  for select to anon, authenticated
  using (true);

drop policy if exists "employee_onboarding_authenticated_update" on public.employee_onboarding_applications;

create policy "employee_onboarding_anon_update"
  on public.employee_onboarding_applications
  for update to anon, authenticated
  using (true)
  with check (status in ('pending', 'approved', 'rejected', 'needs_revision'));

grant select, update on public.employee_onboarding_applications to anon, authenticated;
