-- Which banks, e-wallets and billers the person's mailbox has transaction mail from. Only the sender kind and the latest date are kept, never a subject or a body.
create table if not exists finance.mailbox_seen (
  user_id text not null, issuer_id text not null, last_at timestamptz not null default now(), seen_at timestamptz not null default now(), approx int not null default 1,
  primary key (user_id, issuer_id)
);
