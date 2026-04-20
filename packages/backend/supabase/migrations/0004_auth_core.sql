create extension if not exists pgcrypto;

create table if not exists public.yumi_roles (
  source_id text primary key,
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_yumi_roles_name_lower
  on public.yumi_roles ((lower(trim(name))));

create table if not exists public.yumi_users (
  source_id text primary key,
  username text not null,
  password_hash text,
  home_pin_hash text,
  home_pin_fingerprint text,
  name text not null,
  role_source_id text not null references public.yumi_roles (source_id),
  is_active boolean not null default true,
  receive_report_emails boolean not null default false,
  last_login_at timestamptz,
  auth_user_id text,
  face_descriptor jsonb,
  slug text,
  raw jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_yumi_users_username_lower
  on public.yumi_users ((lower(trim(username))));

create unique index if not exists idx_yumi_users_home_pin_fingerprint
  on public.yumi_users (home_pin_fingerprint)
  where home_pin_fingerprint is not null;

create unique index if not exists idx_yumi_users_auth_user_id
  on public.yumi_users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists idx_yumi_users_slug
  on public.yumi_users (slug)
  where slug is not null and btrim(slug) <> '';

create index if not exists idx_yumi_users_role_source_id
  on public.yumi_users (role_source_id);

create table if not exists public.yumi_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_source_id text not null references public.yumi_users (source_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_yumi_sessions_user_source_id
  on public.yumi_sessions (user_source_id);

create index if not exists idx_yumi_sessions_expires_at
  on public.yumi_sessions (expires_at);

alter table public.yumi_roles enable row level security;
alter table public.yumi_users enable row level security;
alter table public.yumi_sessions enable row level security;

revoke all on public.yumi_roles from anon, authenticated;
revoke all on public.yumi_users from anon, authenticated;
revoke all on public.yumi_sessions from anon, authenticated;

grant all on public.yumi_roles to service_role;
grant all on public.yumi_users to service_role;
grant all on public.yumi_sessions to service_role;
