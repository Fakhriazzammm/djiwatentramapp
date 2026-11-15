-- Import of old Gmail mail: scan -> stage -> preview -> commit. Nothing becomes an entry until the user confirms the preview.
create table if not exists finance.gmail_import (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  status text not null check (status in ('scanning','ready','done','cancelled','undone','failed')),
  period_days integer not null,                       -- 0 = everything
  since timestamptz,                                  -- null = no lower bound
  until timestamptz not null,                         -- the scan walks from here back to `since`
  window_end timestamptz not null,                    -- progress: windows newer than this are done
  page_token text,
  scanned integer not null default 0,
  staged integer not null default 0,
  committed integer not null default 0,
  moved_to_review integer not null default 0,
  error text,
  next_at timestamptz not null default now(),         -- backoff after a Gmail rate limit
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- Gmail ids this import has handled, so a resumed scan never repeats work. Dropped when the import ends.
create table if not exists finance.gmail_import_seen (
  import_id uuid not null, gmail_id text not null,
  primary key (import_id, gmail_id)
);
create index if not exists gmail_import_user on finance.gmail_import (user_id, created_at desc);
create index if not exists gmail_import_scanning on finance.gmail_import (status) where status = 'scanning';

alter table finance.inbound_messages add column if not exists import_id uuid;
alter table finance.inbound_messages drop constraint if exists inbound_messages_status_check;
alter table finance.inbound_messages add constraint inbound_messages_status_check check (status in ('auto','review','approved','rejected','ignored','duplicate','failed','staged'));
create index if not exists inbound_messages_import on finance.inbound_messages (import_id) where import_id is not null;
