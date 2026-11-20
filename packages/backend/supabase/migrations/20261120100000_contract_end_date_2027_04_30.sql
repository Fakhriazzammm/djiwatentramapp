begin;

-- Semua kontrak karyawan berakhir 30 April 2027 (keputusan pemilik, 20 Nov 2026).
-- Hanya menambah key contractEndDate pada raw; key lain tidak berubah.
update public.yumi_users
set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('contractEndDate', '2027-04-30')
where coalesce(raw->>'contractEndDate', '') <> '2027-04-30';

commit;
