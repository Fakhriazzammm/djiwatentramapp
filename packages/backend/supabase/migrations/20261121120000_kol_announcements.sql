-- Pengumuman admin/manager ke KOL: tampil di Notifikasi dan banner Beranda portal KOL, dengan status baca dan konfirmasi.
create table if not exists pos.kol_announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  body text not null check (char_length(btrim(body)) between 5 and 1000),
  kind text not null default 'info' check (kind in ('info','penting','kampanye')),
  audience text not null default 'all' check (audience in ('all','campaign','selected')),
  campaign_id bigint references pos.kol_campaigns(id) on delete set null,
  target_kol_ids text[] not null default '{}',
  pinned boolean not null default false,
  require_ack boolean not null default false,
  status text not null default 'sent' check (status in ('sent','archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (audience <> 'campaign' or campaign_id is not null),
  check (audience <> 'selected' or cardinality(target_kol_ids) between 1 and 500)
);
create index if not exists idx_kol_announcements_created on pos.kol_announcements(created_at desc) where status = 'sent';

create table if not exists pos.kol_announcement_reads (
  announcement_id bigint not null references pos.kol_announcements(id) on delete cascade,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  read_at timestamptz not null default now(),
  acked_at timestamptz,
  primary key (announcement_id, kol_id)
);
create index if not exists idx_kol_announcement_reads_kol on pos.kol_announcement_reads(kol_id);

alter table pos.kol_announcements enable row level security;
alter table pos.kol_announcement_reads enable row level security;
revoke all on pos.kol_announcements, pos.kol_announcement_reads from public, anon, authenticated;
grant select on pos.kol_announcements, pos.kol_announcement_reads to service_role;

-- Penerima: semua KOL aktif, peserta satu kampanye, atau KOL pilihan.
create or replace function pos.kol_announcement_audience(a pos.kol_announcements)
returns setof text language sql stable security definer set search_path = pos, pg_catalog as $$
  select c.source_id from pos.kol_creators c
   where a.audience = 'all' and c.auth_user_id is not null and c.status <> 'Rejected'
  union
  select ap.kol_id from pos.kol_campaign_applications ap
   where a.audience = 'campaign' and ap.campaign_id = a.campaign_id and ap.status in ('pending','approved')
  union
  select s.kol_id from pos.kol_campaign_assignments s
   where a.audience = 'campaign' and s.campaign_id = a.campaign_id and s.status not in ('cancelled','declined')
  union
  select unnest(a.target_kol_ids) where a.audience = 'selected'
$$;

create or replace function pos.kol_announcement_visible(a pos.kol_announcements, p_kol text)
returns boolean language sql stable security definer set search_path = pos, pg_catalog as $$
  select exists (select 1 from pos.kol_announcement_audience(a) x where x = p_kol)
$$;

revoke all on function pos.kol_announcement_audience(pos.kol_announcements), pos.kol_announcement_visible(pos.kol_announcements, text)
  from public, anon, authenticated;
grant execute on function pos.kol_announcement_audience(pos.kol_announcements), pos.kol_announcement_visible(pos.kol_announcements, text) to service_role;

notify pgrst, 'reload schema';
