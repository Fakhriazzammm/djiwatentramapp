-- Apps Script alternative: a user-owned script in the user's own Gmail posts matching bank / e-wallet mail to a private URL.
-- No Google OAuth client of ours is involved, so no Google verification is needed. The token is the credential; the mail itself is still DKIM-checked.
create table if not exists finance.inbound_hooks (
  user_id text primary key,
  token text not null unique check (token ~ '^[A-Za-z0-9]{32,64}$'),
  created_at timestamptz not null default now(),
  last_at timestamptz,
  last_status text,
  last_reason text,
  received integer not null default 0
);
