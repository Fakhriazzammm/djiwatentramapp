-- Riwayat perubahan pengaturan stok & opname (Aplikasi Manager ⇄ Admin). Aditif.
create table if not exists public.mgr_change_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  area text not null default 'opname',
  actor_id text,
  actor_name text,
  actor_role text,
  source_app text not null default 'Aplikasi Manager',
  what text not null,
  from_value text,
  to_value text
);
create index if not exists idx_mgr_change_log_area_at on public.mgr_change_log (area, at desc);
alter table public.mgr_change_log enable row level security;
revoke all on public.mgr_change_log from anon, authenticated;
grant all on public.mgr_change_log to service_role;
grant usage, select on sequence public.mgr_change_log_id_seq to service_role;
