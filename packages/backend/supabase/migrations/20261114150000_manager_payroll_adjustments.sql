-- Penyesuaian gaji manual (bonus, lembur, denda, potongan) dari Manager. Aditif; tidak mengubah tabel payroll.
create table if not exists public.mgr_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                         -- pos_staff_users._id
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  kind text not null check (kind in ('bonus','lembur','denda','potongan')),
  amount numeric(15,2) not null check (amount > 0),
  note text,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mgr_payroll_adj_period on public.mgr_payroll_adjustments (period, user_id);
alter table public.mgr_payroll_adjustments enable row level security;
revoke all on public.mgr_payroll_adjustments from anon, authenticated;
grant all on public.mgr_payroll_adjustments to service_role;
