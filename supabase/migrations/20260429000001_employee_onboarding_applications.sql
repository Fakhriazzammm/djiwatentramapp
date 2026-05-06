create table if not exists public.employee_onboarding_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_revision')),
  full_name text not null,
  email text,
  phone text not null,
  identity_number text,
  address text,
  birth_date date,
  emergency_contact jsonb not null default '{}'::jsonb,
  employment jsonb not null default '{}'::jsonb,
  contract jsonb not null default '{}'::jsonb,
  signature_url text,
  contract_pdf_url text,
  attachments jsonb not null default '{}'::jsonb,
  approved_user_source_id text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists employee_onboarding_applications_status_idx
  on public.employee_onboarding_applications(status, created_at desc);

create or replace function public.touch_employee_onboarding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_onboarding_applications_touch_updated_at
  on public.employee_onboarding_applications;
create trigger employee_onboarding_applications_touch_updated_at
before update on public.employee_onboarding_applications
for each row
execute function public.touch_employee_onboarding_updated_at();

alter table public.employee_onboarding_applications enable row level security;

drop policy if exists "employee_onboarding_public_insert" on public.employee_onboarding_applications;
create policy "employee_onboarding_public_insert"
  on public.employee_onboarding_applications
  for insert to anon, authenticated
  with check (status = 'pending');

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

grant insert on public.employee_onboarding_applications to anon, authenticated;
grant select, update on public.employee_onboarding_applications to anon, authenticated;
