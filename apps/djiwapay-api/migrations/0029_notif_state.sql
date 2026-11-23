-- Android notification capture: when the phone last sent something (shown in the app so the person can see it works).
create table if not exists finance.notif_state (
  user_id text primary key, last_at timestamptz not null default now(), received bigint not null default 0
);
