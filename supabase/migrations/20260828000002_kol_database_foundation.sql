-- Djiwa Tentram KOL Database foundation.
-- Additive, idempotent, and separates public profile data from private/admin data.
create schema if not exists pos;

create table if not exists pos.kol_creators (
  source_id text primary key,
  name text not null check (char_length(trim(name)) between 2 and 120),
  username text not null,
  username_normalized text not null,
  avatar_url text,
  location text not null check (char_length(trim(location)) between 2 and 120),
  category text not null check (category in ('Food & Beverage','Coffee','Lifestyle','Travel','Fashion','Beauty','Entertainment','Other')),
  status text not null default 'Potential' check (status in ('Potential','Belum Dihubungi','Sudah Dihubungi','Negotiation','Scheduled Visit','Collaboration','Completed','Rejected')),
  public_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists pos.kol_platforms (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  platform text not null check (platform in ('TikTok','Instagram','YouTube','Threads','Other')),
  username text not null,
  username_normalized text not null,
  profile_url text,
  followers bigint not null default 0 check (followers >= 0),
  engagement_rate numeric(6,3) check (engagement_rate is null or engagement_rate >= 0),
  created_at timestamptz not null default now()
);
create table if not exists pos.kol_private_contacts (
  kol_id text primary key references pos.kol_creators(source_id) on delete cascade,
  whatsapp text,
  email text,
  manager_name text,
  manager_contact text,
  updated_at timestamptz not null default now()
);
create table if not exists pos.kol_collaborations (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  status text not null default 'Potential' check (status in ('Potential','Belum Dihubungi','Sudah Dihubungi','Negotiation','Scheduled Visit','Collaboration','Completed','Rejected')),
  rate_card text,
  last_contacted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_kol_platform_identity on pos.kol_platforms(platform, username_normalized);
create index if not exists idx_kol_creators_search on pos.kol_creators using gin (to_tsvector('simple', name || ' ' || username || ' ' || location || ' ' || category));
create index if not exists idx_kol_platforms_kol on pos.kol_platforms(kol_id);

create or replace view public.pos_kol_public with (security_invoker=false) as
select c.source_id as id, c.name, c.username, c.avatar_url, c.location, c.category, c.status, c.created_at, c.updated_at,
  coalesce((select jsonb_agg(jsonb_build_object('platform',p.platform,'username',p.username,'profileUrl',p.profile_url,'followers',p.followers) order by p.followers desc) from pos.kol_platforms p where p.kol_id=c.source_id),'[]'::jsonb) as platforms
from pos.kol_creators c;

revoke all on pos.kol_creators, pos.kol_platforms, pos.kol_private_contacts, pos.kol_collaborations from anon, authenticated;
grant usage on schema pos to anon, authenticated, service_role;
grant select on public.pos_kol_public to anon, authenticated, service_role;
grant all on pos.kol_creators, pos.kol_platforms, pos.kol_private_contacts, pos.kol_collaborations to service_role;
grant usage, select on all sequences in schema pos to service_role;

create or replace function pos.kol_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_kol_creators_updated on pos.kol_creators;
create trigger trg_kol_creators_updated before update on pos.kol_creators for each row execute function pos.kol_set_updated_at();

-- ROLLBACK (manual and destructive; only with explicit approval): drop view public.pos_kol_public; drop table pos.kol_collaborations, pos.kol_private_contacts, pos.kol_platforms, pos.kol_creators cascade;
