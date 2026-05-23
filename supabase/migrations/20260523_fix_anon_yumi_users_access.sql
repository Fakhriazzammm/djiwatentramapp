-- Fix anon access to yumi_users for attendance flow
-- home_pin_fingerprint dan raw dibutuhkan untuk PIN/face verification
-- UPDATE dibutuhkan untuk face enrollment

begin;

-- Tambah home_pin_fingerprint ke anon SELECT grant
-- (kolom individual grant, tidak mempengaruhi grant yang sudah ada)
grant select (home_pin_fingerprint) on public.yumi_users to anon, authenticated;

-- Tambah raw ke anon SELECT grant
grant select (raw) on public.yumi_users to anon, authenticated;

-- Re-add UPDATE untuk anon (dibutuhkan untuk face enrollment, PIN update)
-- INSERT dan DELETE tetap restricted (admin only dari 20260523)
grant update on public.yumi_users to anon;

commit;
