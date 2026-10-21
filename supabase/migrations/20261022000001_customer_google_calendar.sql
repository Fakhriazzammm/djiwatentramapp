create table if not exists public.customer_google_calendar_connections (
  customer_id text primary key references public."user"(id) on delete cascade,
  google_account_email text,
  calendar_id text not null default 'primary',
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_google_calendar_oauth_states (
  state_hash text primary key,
  customer_id text not null references public."user"(id) on delete cascade,
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_google_calendar_oauth_states_expiry_idx
  on public.customer_google_calendar_oauth_states (expires_at);

alter table public.customer_google_calendar_connections enable row level security;
alter table public.customer_google_calendar_oauth_states enable row level security;
