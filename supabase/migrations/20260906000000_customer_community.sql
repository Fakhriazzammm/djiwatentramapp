-- Customer Community: persistent customer-only posts and moderation reports.
-- Better Auth requests are proxied through the community Worker; browser anon access is denied.

create extension if not exists pgcrypto;

create table if not exists public.customer_community_posts (
  id uuid primary key default gen_random_uuid(),
  author_source_id text not null,
  body text null,
  media_type text null check (media_type in ('image', 'video')),
  media_object_key text null,
  media_content_type text null,
  media_size_bytes bigint null,
  moderation_status text not null default 'published'
    check (moderation_status in ('published', 'hidden', 'removed')),
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint customer_community_posts_has_content check (
    nullif(btrim(body), '') is not null or media_object_key is not null
  )
);

create index if not exists customer_community_posts_feed_idx
  on public.customer_community_posts (created_at desc, id desc)
  where moderation_status = 'published' and deleted_at is null;

create index if not exists customer_community_posts_author_idx
  on public.customer_community_posts (author_source_id, created_at desc);

create table if not exists public.customer_community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.customer_community_posts(id) on delete cascade,
  reporter_source_id text not null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  moderator_source_id text null,
  moderator_note text null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  unique (post_id, reporter_source_id)
);

create index if not exists customer_community_reports_queue_idx
  on public.customer_community_reports (status, created_at desc);

alter table public.customer_community_posts enable row level security;
alter table public.customer_community_reports enable row level security;

revoke all on public.customer_community_posts from anon, authenticated;
revoke all on public.customer_community_reports from anon, authenticated;
grant all on public.customer_community_posts to service_role;
grant all on public.customer_community_reports to service_role;

create or replace function public.customer_community_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_community_posts_touch_updated_at on public.customer_community_posts;
create trigger customer_community_posts_touch_updated_at
before update on public.customer_community_posts
for each row execute function public.customer_community_touch_updated_at();

create or replace function public.customer_community_increment_report_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customer_community_posts
  set report_count = report_count + 1, updated_at = now()
  where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists customer_community_reports_increment_count on public.customer_community_reports;
create trigger customer_community_reports_increment_count
after insert on public.customer_community_reports
for each row execute function public.customer_community_increment_report_count();

comment on table public.customer_community_posts is 'Persistent customer-only Djiwa Community posts; media lives in Cloudflare R2.';
comment on table public.customer_community_reports is 'Customer reports reviewed through the Admin moderation queue.';
