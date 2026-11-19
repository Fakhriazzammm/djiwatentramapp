-- Why a payment e-mail was NOT recorded. Gates used to drop mail silently, so "why is today's payment missing?" had no answer.
-- Only sender domain, a short subject (never for codes/PINs) and the reason are kept, for 14 days.
create table if not exists finance.inbound_skips (
  user_id text not null,
  message_id text not null,
  reason text not null,
  channel text not null default '',
  sender_domain text not null default '',
  subject text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists inbound_skips_recent on finance.inbound_skips (user_id, created_at desc);
