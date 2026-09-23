-- Public creator timeline/discovery foundation.
-- Additive and idempotent. Browser roles receive no direct write access.
create schema if not exists pos;

alter table pos.kol_profiles
  add column if not exists public_availability text not null default 'not_set'
  check (public_availability in ('not_set', 'open', 'selective', 'unavailable'));
alter table pos.kol_profiles
  add column if not exists availability_label text;

alter table pos.kol_portfolio_items
  add column if not exists pinned_order integer
  check (pinned_order is null or pinned_order between 1 and 3);

-- Campaign visibility is explicit; completion/status alone is never a public gate.
alter table pos.kol_campaigns
  add column if not exists public_highlight boolean not null default false;

create table if not exists pos.kol_public_posts (
  id bigserial primary key,
  kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  post_type text not null check (post_type in ('text', 'portfolio', 'campaign', 'achievement')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  body text not null default '' check (char_length(body) <= 5000),
  media_url text,
  thumbnail_url text,
  source_entity_type text,
  source_entity_id text,
  visibility text not null default 'public'
    check (visibility in ('draft', 'pending', 'published', 'rejected', 'hidden')),
  moderation_status text not null default 'approved'
    check (moderation_status in ('approved', 'pending', 'rejected', 'hidden')),
  moderation_note text,
  published_at timestamptz,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (post_type <> 'text' or char_length(btrim(body)) >= 1),
  check (media_url is null or char_length(btrim(media_url)) between 8 and 2048),
  check (thumbnail_url is null or char_length(btrim(thumbnail_url)) between 8 and 2048)
);

create unique index if not exists idx_kol_public_posts_source_dedupe
  on pos.kol_public_posts(kol_id, post_type, source_entity_type, source_entity_id)
  where source_entity_type is not null and source_entity_id is not null;
create index if not exists idx_kol_public_posts_feed
  on pos.kol_public_posts(published_at desc, id desc)
  where visibility = 'published' and moderation_status = 'approved';
create index if not exists idx_kol_public_posts_creator_feed
  on pos.kol_public_posts(kol_id, published_at desc, id desc)
  where visibility = 'published' and moderation_status = 'approved';
create index if not exists idx_kol_public_posts_kol_id
  on pos.kol_public_posts(kol_id);

create table if not exists pos.kol_public_post_reports (
  id bigserial primary key,
  post_id bigint not null references pos.kol_public_posts(id) on delete cascade,
  reporter_kol_id text not null references pos.kol_creators(source_id) on delete cascade,
  reason text not null check (reason in ('spam', 'privacy', 'misleading', 'harassment', 'other')),
  note text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_kol_id)
);
create index if not exists idx_kol_public_post_reports_status
  on pos.kol_public_post_reports(status, created_at desc);
create index if not exists idx_kol_public_post_reports_post_id
  on pos.kol_public_post_reports(post_id);
create index if not exists idx_kol_public_post_reports_reporter_kol_id
  on pos.kol_public_post_reports(reporter_kol_id);

-- Reuse the existing portal timestamp function and create only the new trigger.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'pos.kol_public_posts'::regclass
      and tgname = 'trg_kol_public_posts_updated'
      and not tgisinternal
  ) then
    create trigger trg_kol_public_posts_updated
      before update on pos.kol_public_posts
      for each row execute function pos.kol_portal_set_updated_at();
  end if;
end
$$;

-- New tables are service-role-only. RLS is defense in depth; writes stay server-side.
alter table pos.kol_public_posts enable row level security;
alter table pos.kol_public_post_reports enable row level security;
revoke all on pos.kol_public_posts, pos.kol_public_post_reports from anon, authenticated;
grant all on pos.kol_public_posts, pos.kol_public_post_reports to service_role;
grant usage, select on sequence pos.kol_public_posts_id_seq, pos.kol_public_post_reports_id_seq to service_role;

-- Explicit safe projection: no contacts, application_data, public_reason, admin_note,
-- rate card, assignment fields, moderation note, or private proof/insight fields.
create or replace view public.pos_kol_public_timeline
with (security_invoker = false) as
select pp.id as post_id,
       coalesce(nullif(btrim(kp.display_name), ''), c.name) as display_name,
       coalesce(nullif(btrim(kp.slug), ''), c.username_normalized) as username,
       c.avatar_url,
       c.category,
       c.location,
       kp.public_availability,
       kp.availability_label,
       pp.post_type,
       pp.title,
       pp.body,
       pp.media_url,
       pp.thumbnail_url,
       pp.published_at,
       pp.pinned_at,
       case pp.source_entity_type
         when 'portfolio' then (
           select pi.title
           from pos.kol_portfolio_items pi
           where pi.id::text = pp.source_entity_id
             and pi.kol_id = pp.kol_id
             and pi.review_status = 'approved'
             and pi.is_public = true
         )
         when 'campaign' then (
           select kc.title
           from pos.kol_campaigns kc
           where kc.id::text = pp.source_entity_id
             and kc.status in ('published', 'closed')
             and kc.public_highlight = true
         )
         when 'achievement' then (
           select kb.name
           from pos.kol_badges kb
           where kb.id::text = pp.source_entity_id
             and kb.is_active = true
         )
         else null
       end as source_label
from pos.kol_public_posts pp
join pos.kol_creators c on c.source_id = pp.kol_id
join pos.kol_profiles kp on kp.kol_id = c.source_id
where kp.is_public = true
  and c.status <> 'Rejected'
  and pp.visibility = 'published'
  and pp.moderation_status = 'approved'
  and (
    pp.source_entity_type is null
    or (pp.source_entity_type = 'portfolio' and exists (
      select 1 from pos.kol_portfolio_items pi
      where pi.id::text = pp.source_entity_id
        and pi.kol_id = pp.kol_id
        and pi.review_status = 'approved'
        and pi.is_public = true
    ))
    or (pp.source_entity_type = 'campaign' and exists (
      select 1 from pos.kol_campaigns kc
      where kc.id::text = pp.source_entity_id
        and kc.status in ('published', 'closed')
        and kc.public_highlight = true
    ))
    or (pp.source_entity_type = 'achievement' and exists (
      select 1
      from pos.kol_creator_badges cb
      join pos.kol_badges kb on kb.id = cb.badge_id
      where cb.kol_id = pp.kol_id
        and cb.badge_id::text = pp.source_entity_id
        and cb.is_visible = true
        and kb.is_active = true
    ))
  );

grant select on public.pos_kol_public_timeline to anon, authenticated, service_role;

-- Keep the existing profile view contract and append only safe discovery metadata.
create or replace view public.pos_kol_public_profiles
with (security_invoker = false) as
select c.source_id as id,
       coalesce(nullif(btrim(p.display_name), ''), c.name) as name,
       coalesce(nullif(btrim(p.slug), ''), c.username_normalized) as username,
       c.avatar_url,
       c.location,
       c.category,
       p.bio,
       jsonb_build_object(
         'platforms', coalesce((select jsonb_agg(jsonb_build_object('platform', kp2.platform, 'username', kp2.username, 'profileUrl', kp2.profile_url, 'followers', kp2.followers) order by kp2.followers desc) from pos.kol_platforms kp2 where kp2.kol_id = c.source_id), '[]'::jsonb),
         'portfolio', coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'platform', pi.platform, 'title', pi.title, 'contentUrl', pi.content_url, 'thumbnailUrl', pi.thumbnail_url, 'description', pi.description, 'publishedAt', pi.published_at, 'pinnedOrder', pi.pinned_order) order by pi.pinned_order nulls last, pi.published_at desc nulls last, pi.created_at desc) from pos.kol_portfolio_items pi where pi.kol_id = c.source_id and pi.review_status = 'approved' and pi.is_public = true), '[]'::jsonb),
         'badges', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'description', b.description, 'icon', b.icon) order by b.name) from pos.kol_creator_badges cb join pos.kol_badges b on b.id = cb.badge_id where cb.kol_id = c.source_id and cb.is_visible = true and b.is_active = true), '[]'::jsonb)
       ) as data,
       p.public_availability,
       p.availability_label
from pos.kol_creators c
left join pos.kol_profiles p on p.kol_id = c.source_id
where c.status <> 'Rejected' and coalesce(p.is_public, false) = true;

grant select on public.pos_kol_public_profiles to anon, authenticated, service_role;

notify pgrst, 'reload schema';
