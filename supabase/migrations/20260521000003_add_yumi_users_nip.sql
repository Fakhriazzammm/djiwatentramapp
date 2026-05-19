-- Add employee_nip column to yumi_users for human-friendly NIP
alter table public.yumi_users
  add column if not exists employee_nip text;

create unique index if not exists idx_yumi_users_employee_nip
  on public.yumi_users (employee_nip)
  where employee_nip is not null;
