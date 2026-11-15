-- Gmail direct: the server reads only mail from listed bank / e-wallet senders on the user's behalf.
create table if not exists finance.gmail_sync (
  user_id text primary key,
  enabled boolean not null default true,
  next_poll_at timestamptz not null default now(),
  last_polled_at timestamptz,
  last_error text,
  fetched_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gmail_sync_due on finance.gmail_sync (next_poll_at) where enabled;
-- Gmail message ids already handled, so a poll never fetches the same message twice.
create table if not exists finance.gmail_seen (
  user_id text not null, gmail_id text not null, seen_at timestamptz not null default now(),
  primary key (user_id, gmail_id)
);
