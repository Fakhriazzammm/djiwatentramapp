-- Allow authenticated users to delete employee onboarding applications
-- This is needed for the admin to bulk-delete or individually delete applications

drop policy if exists "employee_onboarding_authenticated_delete" on public.employee_onboarding_applications;
create policy "employee_onboarding_anon_delete"
  on public.employee_onboarding_applications
  for delete to anon, authenticated
  using (true);
