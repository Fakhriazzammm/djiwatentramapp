-- Contract approval workflow tables
-- Adds structured approval tracking for employee contracts

-- 1. Add contract approval columns to existing table
alter table public.employee_onboarding_applications
  add column if not exists contract_approved_by_admin_at timestamptz,
  add column if not exists contract_approved_by_admin_id text,
  add column if not exists contract_signed_by_employee_at timestamptz,
  add column if not exists contract_status text default 'pending'
    check (contract_status in ('pending', 'admin_approved', 'signed', 'active', 'rejected', 'expired', 'renewed'));

-- 2. Contract approvals tracking table
create table if not exists public.contract_approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.employee_onboarding_applications(id) on delete cascade,
  stage text not null check (stage in ('admin', 'manager', 'employee')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by text,
  approved_at timestamptz,
  notes text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists contract_approvals_application_idx
  on public.contract_approvals(application_id, stage);

-- 3. Enable RLS
alter table public.contract_approvals enable row level security;

create policy "Contract approvals are readable by authenticated users"
  on public.contract_approvals for select
  using (auth.role() = 'authenticated');

create policy "Contract approvals can be inserted by authenticated users"
  on public.contract_approvals for insert
  with check (auth.role() = 'authenticated');

create policy "Contract approvals can be updated by authenticated users"
  on public.contract_approvals for update
  using (auth.role() = 'authenticated');
