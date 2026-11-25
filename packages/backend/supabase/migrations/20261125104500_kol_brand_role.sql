-- Brand is a first-class account role alongside customer, creator (kol), and admin.
-- The KOL portal lets one Google account choose Creator or Brand right after sign-in.
alter table public."user" drop constraint if exists user_user_type_check;
alter table public."user"
  add constraint user_user_type_check
  check (user_type in ('customer', 'kol', 'brand', 'admin'));
