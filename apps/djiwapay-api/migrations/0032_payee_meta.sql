-- What the person told us about a payee (a person, shop or service you pay or are paid by): its kind and a label.
-- Kept per account so every device agrees; the newest answer per payee wins. A cleared answer stays as an empty row so the clearing reaches the other devices too.
create table if not exists finance.payee_meta (
  user_id text not null, key text not null,
  kind text check (kind in ('orang','toko','layanan')), label text,
  at timestamptz not null default now(),
  primary key (user_id, key)
);
