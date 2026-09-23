-- Bind newly submitted KOL creators to the verified Better Auth user.
-- Additive and idempotent; existing creators remain unchanged.
alter table if exists pos.kol_creators
  add column if not exists auth_user_id text;

create unique index if not exists idx_kol_creators_auth_user_id
  on pos.kol_creators(auth_user_id)
  where auth_user_id is not null;
