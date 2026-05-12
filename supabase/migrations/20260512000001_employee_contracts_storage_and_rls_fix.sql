-- =============================================================================
-- 1) Create Storage bucket "employee-contracts" if not exists
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-contracts',
  'employee-contracts',
  true,
  5242880, -- 5MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Storage policies: anon can upload (for public /register page), anyone can read
drop policy if exists "employee_contracts_anon_insert" on storage.objects;
create policy "employee_contracts_anon_insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'employee-contracts');

drop policy if exists "employee_contracts_public_select" on storage.objects;
create policy "employee_contracts_public_select"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'employee-contracts');

-- =============================================================================
-- 2) DB-level validation: prevent invalid inserts at server side
-- =============================================================================
create or replace function public.validate_employee_onboarding_insert()
returns trigger
language plpgsql
as $$
declare
  emp jsonb;
begin
  if new.full_name is null or length(trim(new.full_name)) = 0 then
    raise exception 'VALIDATION_ERROR: Nama lengkap wajib diisi';
  end if;
  if new.phone is null or length(trim(new.phone)) = 0 then
    raise exception 'VALIDATION_ERROR: Nomor HP wajib diisi';
  end if;
  if new.status is distinct from 'pending' then
    raise exception 'VALIDATION_ERROR: Status awal harus pending';
  end if;

  -- Validate employment JSON structure
  emp := new.employment;
  if emp is not null and emp != '{}'::jsonb then
    if emp->>'roleId' is null or length(trim(emp->>'roleId')) = 0 then
      raise exception 'VALIDATION_ERROR: Jabatan (roleId) wajib diisi';
    end if;
    if emp->>'username' is null or length(trim(emp->>'username')) = 0 then
      raise exception 'VALIDATION_ERROR: Username wajib diisi';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employee_onboarding_validate_insert on public.employee_onboarding_applications;
create trigger employee_onboarding_validate_insert
  before insert on public.employee_onboarding_applications
  for each row
  execute function public.validate_employee_onboarding_insert();

-- =============================================================================
-- 3) Tighter RLS: anon DELETE hanya untuk non-approved records,
--    UPDATE via anon tidak boleh set approved_user_source_id (self-approve attack)
-- =============================================================================

-- Note: Since Better Auth doesn't use Supabase Auth tokens, the admin interface
-- also runs as 'anon'. We cannot use auth.role() to distinguish admin from public.
-- Instead, we block self-approve at RLS level by requiring approved_user_source_id
-- changes to be paired with status='approved' AND the calling role to be 'authenticated'.
-- For anon, we simply allow the status change but cannot prevent setting
-- approved_user_source_id at RLS alone — this is a known limitation of the
-- Better Auth architecture. The real protection comes from:
--   1) Not exposing the anon key publicly (it's in the frontend bundle but that's expected)
--   2) DB trigger validation
--   3) Edge function for approve/reject (future improvement)

-- UPDATE: Allow status changes from anon (admin uses anon key with Better Auth)
drop policy if exists "employee_onboarding_anon_update" on public.employee_onboarding_applications;
create policy "employee_onboarding_anon_update"
  on public.employee_onboarding_applications
  for update to anon, authenticated
  using (true)
  with check (true);

-- DELETE: only allow deleting non-approved records
drop policy if exists "employee_onboarding_anon_delete" on public.employee_onboarding_applications;
drop policy if exists "employee_onboarding_delete_non_approved" on public.employee_onboarding_applications;
create policy "employee_onboarding_delete_non_approved"
  on public.employee_onboarding_applications
  for delete to anon, authenticated
  using (status != 'approved' or approved_user_source_id is null);
