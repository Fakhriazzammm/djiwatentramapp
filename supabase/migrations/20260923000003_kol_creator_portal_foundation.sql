-- KOL Creator Portal foundation.
-- Additive/idempotent. Browser roles receive no direct write access.
create schema if not exists pos;

create table if not exists pos.kol_profiles (
  kol_id text primary key references pos.kol_creators(source_id) on delete cascade,
  display_name text,
  slug text,
  bio text,
  is_public boolean not null default false,
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_kol_profiles_slug
  on pos.kol_profiles (lower(btrim(slug)))
  where slug is not null and btrim(slug) <> '';

create table if not exists pos.kol_portfolio_items (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  platform text not null check (platform in ('TikTok','Instagram','YouTube','Threads','Other')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  content_url text not null check (char_length(btrim(content_url)) between 8 and 2048),
  thumbnail_url text,
  description text,
  published_at date,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_note text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_kol_portfolio_unique_url
  on pos.kol_portfolio_items (kol_id, lower(btrim(content_url)));
create index if not exists idx_kol_portfolio_public
  on pos.kol_portfolio_items (kol_id, review_status, is_public);

create table if not exists pos.kol_campaigns (
  id bigserial primary key,
  slug text not null,
  title text not null,
  description text not null default '',
  location text,
  benefit_description text not null default '',
  deliverable_summary text not null default '',
  application_deadline date,
  start_date date,
  end_date date,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index if not exists idx_kol_campaigns_slug on pos.kol_campaigns(lower(btrim(slug)));
create index if not exists idx_kol_campaigns_status_dates on pos.kol_campaigns(status, start_date, end_date);

create table if not exists pos.kol_campaign_assignments (
  id bigserial primary key,
  campaign_id bigint not null references pos.kol_campaigns(id) on delete cascade,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','accepted','declined','active','completed','cancelled')),
  assigned_by text,
  accepted_at timestamptz,
  completed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, kol_id)
);
create index if not exists idx_kol_assignments_kol on pos.kol_campaign_assignments(kol_id, status);

create table if not exists pos.kol_content_submissions (
  id bigserial primary key,
  campaign_assignment_id bigint not null references pos.kol_campaign_assignments(id) on delete cascade,
  deliverable_type text not null,
  content_url text not null check (char_length(btrim(content_url)) between 8 and 2048),
  insight_screenshot_url text,
  published_at date,
  status text not null default 'submitted' check (status in ('submitted','needs_revision','approved','rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_kol_submissions_assignment on pos.kol_content_submissions(campaign_assignment_id, status);

create table if not exists pos.kol_badges (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  icon text,
  criteria_version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pos.kol_creator_badges (
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  badge_id bigint not null references pos.kol_badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by text,
  source_event text,
  is_visible boolean not null default true,
  primary key (kol_id, badge_id)
);

create table if not exists pos.kol_visit_bookings (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  booking_date date not null,
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed','no_show')),
  visit_note text,
  admin_note text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (booking_date >= ((now() at time zone 'Asia/Jakarta')::date))
);
create unique index if not exists idx_kol_visit_one_active_per_day
  on pos.kol_visit_bookings(booking_date)
  where status in ('requested','confirmed','completed');
create unique index if not exists idx_kol_visit_one_active_per_creator
  on pos.kol_visit_bookings(kol_id)
  where status in ('requested','confirmed');
create index if not exists idx_kol_visit_calendar on pos.kol_visit_bookings(booking_date, status);

create table if not exists pos.kol_notifications (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_kol_notifications_recipient on pos.kol_notifications(kol_id, created_at desc);

create or replace function pos.kol_portal_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kol_profiles_updated on pos.kol_profiles;
create trigger trg_kol_profiles_updated before update on pos.kol_profiles for each row execute function pos.kol_portal_set_updated_at();
drop trigger if exists trg_kol_portfolio_updated on pos.kol_portfolio_items;
create trigger trg_kol_portfolio_updated before update on pos.kol_portfolio_items for each row execute function pos.kol_portal_set_updated_at();
drop trigger if exists trg_kol_campaigns_updated on pos.kol_campaigns;
create trigger trg_kol_campaigns_updated before update on pos.kol_campaigns for each row execute function pos.kol_portal_set_updated_at();
drop trigger if exists trg_kol_assignments_updated on pos.kol_campaign_assignments;
create trigger trg_kol_assignments_updated before update on pos.kol_campaign_assignments for each row execute function pos.kol_portal_set_updated_at();
drop trigger if exists trg_kol_submissions_updated on pos.kol_content_submissions;
create trigger trg_kol_submissions_updated before update on pos.kol_content_submissions for each row execute function pos.kol_portal_set_updated_at();
drop trigger if exists trg_kol_visit_updated on pos.kol_visit_bookings;
create trigger trg_kol_visit_updated before update on pos.kol_visit_bookings for each row execute function pos.kol_portal_set_updated_at();

insert into pos.kol_badges(code,name,description,icon) values
  ('verified_creator','Verified Creator','Profil KOL sudah disetujui admin.','verified'),
  ('active_partner','Active Partner','Memiliki campaign kolaborasi aktif atau diterima.','sparkles'),
  ('completed_collaboration','Completed Collaboration','Menyelesaikan minimal satu campaign.','check')
on conflict (code) do nothing;

create or replace view public.pos_kol_public_profiles
with (security_invoker=false) as
select c.source_id as id,
       coalesce(nullif(btrim(p.display_name),''), c.name) as name,
       coalesce(nullif(btrim(p.slug),''), c.username_normalized) as username,
       c.avatar_url,
       c.location,
       c.category,
       p.bio,
       jsonb_build_object(
         'platforms', coalesce((select jsonb_agg(jsonb_build_object('platform',kp.platform,'username',kp.username,'profileUrl',kp.profile_url,'followers',kp.followers) order by kp.followers desc) from pos.kol_platforms kp where kp.kol_id=c.source_id),'[]'::jsonb),
         'portfolio', coalesce((select jsonb_agg(jsonb_build_object('id',pi.id,'platform',pi.platform,'title',pi.title,'contentUrl',pi.content_url,'thumbnailUrl',pi.thumbnail_url,'description',pi.description,'publishedAt',pi.published_at) order by pi.published_at desc nulls last, pi.created_at desc) from pos.kol_portfolio_items pi where pi.kol_id=c.source_id and pi.review_status='approved' and pi.is_public=true),'[]'::jsonb),
         'badges', coalesce((select jsonb_agg(jsonb_build_object('code',b.code,'name',b.name,'description',b.description,'icon',b.icon) order by b.name) from pos.kol_creator_badges cb join pos.kol_badges b on b.id=cb.badge_id where cb.kol_id=c.source_id and cb.is_visible=true and b.is_active=true),'[]'::jsonb)
       ) as data
from pos.kol_creators c
left join pos.kol_profiles p on p.kol_id=c.source_id
where c.status not in ('Rejected') and coalesce(p.is_public,false)=true;

create or replace view public.pos_kol_visit_calendar
with (security_invoker=false) as
select v.booking_date,
       v.status,
       coalesce(nullif(btrim(p.display_name),''), c.name) as creator_name,
       c.username
from pos.kol_visit_bookings v
join pos.kol_creators c on c.source_id=v.kol_id
left join pos.kol_profiles p on p.kol_id=c.source_id
where v.status in ('requested','confirmed','completed');

revoke all on pos.kol_profiles, pos.kol_portfolio_items, pos.kol_campaigns, pos.kol_campaign_assignments, pos.kol_content_submissions, pos.kol_badges, pos.kol_creator_badges, pos.kol_visit_bookings, pos.kol_notifications from anon, authenticated;
grant usage on schema pos to service_role;
grant all on pos.kol_profiles, pos.kol_portfolio_items, pos.kol_campaigns, pos.kol_campaign_assignments, pos.kol_content_submissions, pos.kol_badges, pos.kol_creator_badges, pos.kol_visit_bookings, pos.kol_notifications to service_role;
grant usage, select on all sequences in schema pos to service_role;
revoke all on public.pos_kol_public_profiles, public.pos_kol_visit_calendar from anon, authenticated;
grant select on public.pos_kol_public_profiles, public.pos_kol_visit_calendar to anon, authenticated, service_role;

notify pgrst, 'reload schema';
