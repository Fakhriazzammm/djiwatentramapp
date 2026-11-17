-- Web Push subscriptions of the installed app (one row per browser or device).
create table if not exists finance.push_subscriptions (
  user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  primary key (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on finance.push_subscriptions (user_id);
