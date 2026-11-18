-- Admin access list and first-party page-view tracking for the Djiwa Pay admin dashboard.
-- The first admin comes from the ADMIN_EMAILS environment variable (seeded at startup), never from source code.
create table if not exists finance.admins (
  email text primary key,
  added_by text,
  created_at timestamptz not null default now()
);

create table if not exists finance.page_views (
  id bigserial primary key,
  at timestamptz not null default now(),
  visitor text not null,
  user_id text,
  path text not null,
  referrer text not null default '',
  device text not null default 'desktop',
  browser text not null default '',
  standalone boolean not null default false
);
create index if not exists page_views_at on finance.page_views (at desc);
create index if not exists page_views_visitor on finance.page_views (visitor, at);
create index if not exists page_views_user on finance.page_views (user_id, at desc) where user_id is not null;
