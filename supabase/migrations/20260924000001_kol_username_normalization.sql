-- Normalize legacy KOL usernames to exactly one leading @ and prevent regressions.
update pos.kol_creators
set username = regexp_replace(trim(username), '^@+', '@'),
    username_normalized = lower(regexp_replace(trim(username), '^@+', ''))
where username is not null
  and (username ~ '^@@+' or username_normalized is distinct from lower(regexp_replace(trim(username), '^@+', '')));

alter table pos.kol_creators
  drop constraint if exists kol_creators_username_single_at;

alter table pos.kol_creators
  add constraint kol_creators_username_single_at
  check (username is null or username !~ '^@@+');
