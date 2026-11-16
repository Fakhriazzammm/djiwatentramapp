-- Salinan foto profil creator (mis. dari Google) disimpan di database sendiri agar avatar tidak bergantung
-- pada URL pihak ketiga yang bisa berubah atau kedaluwarsa. Hanya service_role (API) yang boleh menyentuhnya.
create table if not exists pos.kol_avatars (
  kol_id text primary key references pos.kol_creators(source_id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  data bytea not null check (octet_length(data) between 200 and 1000000),
  source_url text,
  updated_at timestamptz not null default now()
);
revoke all on pos.kol_avatars from public, anon, authenticated;
grant all on pos.kol_avatars to service_role;
notify pgrst, 'reload schema';
