-- Investor authorization and consented access requests.
-- Browser roles receive no direct grants; the auth server is the only reader/writer.

create table if not exists public.investor_memberships (
  user_id text primary key references public."user" (id) on delete cascade,
  role text not null default 'investor' check (role = 'investor'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended', 'revoked')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_leads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public."user" (id) on delete cascade,
  city_interest text,
  investment_range text,
  consent_at timestamptz not null,
  consent_version text not null,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'qualified', 'meeting', 'declined', 'converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investor_memberships_status_idx
  on public.investor_memberships (status, updated_at desc);
create index if not exists investor_leads_user_created_idx
  on public.investor_leads (user_id, created_at desc);

revoke all on table public.investor_memberships from public, anon, authenticated;
revoke all on table public.investor_leads from public, anon, authenticated;
grant select, insert, update on table public.investor_memberships to supabase_admin;
grant select, insert, update on table public.investor_leads to supabase_admin;
