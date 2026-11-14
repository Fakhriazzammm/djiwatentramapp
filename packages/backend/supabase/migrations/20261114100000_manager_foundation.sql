-- apps/manager foundation (additive only). Accessed exclusively through auth-server
-- (/api/manager/*, /api/admin-manager/*) with the service connection; no anon/authenticated access.

create table if not exists public.mgr_memberships (
  user_id text primary key,                       -- Better Auth public."user".id
  email text,
  display_name text,
  requested_role text not null check (requested_role in ('manager','supervisor')),
  role text check (role in ('manager','supervisor')),   -- role granted by Owner
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.mgr_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  detail text,
  source text not null default 'self' check (source in ('ai','owner','manager','supervisor','self')),
  source_ref text,                                -- data signal that justified an AI task
  created_by text not null,                       -- user_id, or 'ai'
  assignee_role text not null check (assignee_role in ('manager','supervisor')),
  assignee_user_id text,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  kind text not null default 'general' check (kind in ('general','purchasing','ops','people','finance')),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  done_at timestamptz,
  done_by text,
  plan_date date,                                 -- WIB date for AI daily plan
  attachments jsonb not null default '[]'::jsonb, -- [{type:'link'|'file'|'photo'|'video', name, url}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mgr_tasks_role_status on public.mgr_tasks (assignee_role, status, due_at);
create unique index if not exists idx_mgr_tasks_ai_dedupe on public.mgr_tasks (assignee_role, plan_date, source_ref)
  where source = 'ai' and source_ref is not null;

create table if not exists public.mgr_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.mgr_tasks (id) on delete cascade,
  author_id text not null,
  author_name text,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_mgr_task_comments_task on public.mgr_task_comments (task_id, created_at);

create table if not exists public.mgr_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                             -- laporan_harian, berita_acara_selisih, dll.
  title text not null check (length(btrim(title)) between 1 and 200),
  body jsonb not null default '{}'::jsonb,        -- filled blocks
  from_user_id text not null,
  from_name text,
  from_role text not null check (from_role in ('manager','supervisor')),
  to_role text not null check (to_role in ('manager','owner')),
  status text not null default 'sent' check (status in ('sent','read','needs_revision','acknowledged')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mgr_reports_to on public.mgr_reports (to_role, status, created_at desc);

create table if not exists public.mgr_playbook_chapters (
  slug text primary key,
  position int not null default 0,
  title text not null,
  roles text[] not null default '{manager,supervisor}',
  body jsonb not null default '[]'::jsonb,        -- editable by Owner in apps/admin
  updated_by text,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['mgr_memberships','mgr_tasks','mgr_task_comments','mgr_reports','mgr_playbook_chapters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
