-- Djiwa Pay integrations: payment e-mail inbox (forwarding) and Google Calendar / Drive / Sheets.
-- Nothing here stores e-mail bodies: only parsed fields, a hash and the sender domain.

alter table finance.entries add column if not exists inbound_id text;

-- One forwarding address per user: <token>@catat.djiwapay.web.id
create table if not exists finance.inbound_sources (
  user_id text primary key,
  token text not null unique check (token ~ '^[a-z0-9]{8,32}$'),
  enabled boolean not null default true,
  forward_code text,                    -- Gmail's forwarding confirmation code, shown once to the user
  forward_code_at timestamptz,
  trusted_count integer not null default 0,   -- records the user approved; auto-record unlocks after a few
  mail_count integer not null default 0,
  first_mail_at timestamptz,
  last_mail_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists finance.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  message_id text not null,             -- RFC 5322 Message-ID (or a hash of it)
  sender_domain text not null default '',
  channel text not null default '',     -- issuer id, e.g. bca, gopay
  parsed jsonb not null default '{}'::jsonb,
  confidence real not null default 0,
  status text not null check (status in ('auto','review','approved','rejected','ignored','duplicate','failed')),
  reason text not null default '',
  entry_id text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index if not exists inbound_messages_review on finance.inbound_messages (user_id, status, created_at desc);

-- What the user taught us: merchant text -> category / account.
create table if not exists finance.merchant_rules (
  user_id text not null, pattern text not null,
  category_id text not null, uses integer not null default 1, updated_at timestamptz not null default now(),
  primary key (user_id, pattern)
);

-- One Google connection per user. Tokens are AES-256-GCM encrypted; the browser never sees them.
create table if not exists finance.google_connections (
  user_id text primary key,
  access_enc text, refresh_enc text, expires_at timestamptz,
  email text, granted_scopes text[] not null default '{}',
  state_hash text, state_expires_at timestamptz,
  connected_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists google_connections_state on finance.google_connections (state_hash) where state_hash is not null;

create table if not exists finance.google_calendar_events (
  user_id text not null, bill_id text not null,
  calendar_id text not null default 'primary', event_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, bill_id)
);

create table if not exists finance.google_drive_files (
  user_id text not null, receipt_id text not null,
  file_id text, folder_id text,
  status text not null check (status in ('pending','uploaded','failed')),
  attempts integer not null default 0, last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_id, receipt_id)
);

create table if not exists finance.google_sheet_exports (
  user_id text primary key,
  spreadsheet_id text, spreadsheet_url text,
  status text not null check (status in ('pending','synced','failed')),
  last_synced_at timestamptz, last_error text,
  updated_at timestamptz not null default now()
);
