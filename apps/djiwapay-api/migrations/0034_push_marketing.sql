-- Push marketing: Android (FCM) devices next to Web Push, per-person topic choices, campaigns and per-device delivery rows.
alter table finance.push_subscriptions alter column p256dh drop not null;
alter table finance.push_subscriptions alter column auth drop not null;
alter table finance.push_subscriptions add column if not exists platform text not null default 'web';
alter table finance.push_subscriptions add column if not exists app_version text;
alter table finance.push_subscriptions add column if not exists updated_at timestamptz not null default now();

create table if not exists finance.push_prefs (
  user_id text primary key,
  marketing boolean not null default true,
  topics text[] not null default '{fitur,promo,tips}',
  updated_at timestamptz not null default now()
);

create table if not exists finance.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  body text not null,
  route text not null default '/',
  image_url text,
  topic text not null default 'fitur',
  segment text not null default 'devices',
  platform text not null default 'all',
  respect_quiet boolean not null default true,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','paused','done','canceled')),
  scheduled_at timestamptz,
  total int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);
create index if not exists push_campaigns_status_idx on finance.push_campaigns (status, scheduled_at);

create table if not exists finance.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references finance.push_campaigns(id) on delete cascade,
  user_id text not null,
  endpoint text not null,
  platform text not null,
  vars jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id, endpoint)
);
create index if not exists push_deliveries_campaign_idx on finance.push_deliveries (campaign_id, status);
create index if not exists push_deliveries_user_idx on finance.push_deliveries (user_id, sent_at);
