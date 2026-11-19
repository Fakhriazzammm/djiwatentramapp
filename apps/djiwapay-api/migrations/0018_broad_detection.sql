-- Detecting money movements from senders that are not on the bank / e-wallet list. Opt-in per user, and everything found this way
-- waits for the person to say whether it was income or spending.
alter table finance.inbound_sources add column if not exists broad boolean not null default false;
alter table finance.inbound_hooks add column if not exists script_version integer not null default 1;
-- What the person answered last time for a sender, offered as the suggestion next time (never applied without a tap).
create table if not exists finance.sender_hints (
  user_id text not null,
  sender_domain text not null,
  direction text not null check (direction in ('in','out')),
  uses integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, sender_domain)
);
