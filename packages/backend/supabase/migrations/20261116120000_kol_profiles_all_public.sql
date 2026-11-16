-- Semua profil creator publik: tidak ada lagi konsep profil privat.
-- 1) default publik, 2) semua creator punya baris profil, 3) creator baru otomatis dapat profil publik,
-- 4) view publik tidak lagi bergantung pada flag is_public (creator berstatus Rejected tetap disembunyikan).

alter table pos.kol_profiles alter column is_public set default true;

-- Baris profil untuk creator yang belum punya. Slug = username ternormalisasi (sama dengan fallback view publik).
insert into pos.kol_profiles(kol_id, display_name, slug, is_public)
select c.source_id, c.name, c.username_normalized, true
  from pos.kol_creators c
 where not exists (select 1 from pos.kol_profiles p where p.kol_id = c.source_id)
on conflict do nothing;

-- Bila slug bentrok dengan creator lain, beri akhiran pendek agar tetap unik.
insert into pos.kol_profiles(kol_id, display_name, slug, is_public)
select c.source_id, c.name, c.username_normalized || '-' || substr(md5(c.source_id), 1, 4), true
  from pos.kol_creators c
 where not exists (select 1 from pos.kol_profiles p where p.kol_id = c.source_id)
on conflict do nothing;

update pos.kol_profiles set is_public = true where is_public is not true;

create or replace function pos.kol_ensure_public_profile() returns trigger
language plpgsql as $$
begin
  insert into pos.kol_profiles(kol_id, display_name, slug, is_public)
  values (new.source_id, new.name, new.username_normalized, true)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_kol_creators_ensure_profile on pos.kol_creators;
create trigger trg_kol_creators_ensure_profile after insert on pos.kol_creators
  for each row execute function pos.kol_ensure_public_profile();

create or replace view public.pos_kol_public_profiles with (security_invoker = false) as
 SELECT c.source_id AS id,
    COALESCE(NULLIF(btrim(p.display_name), ''::text), c.name) AS name,
    COALESCE(NULLIF(btrim(p.slug), ''::text), c.username_normalized) AS username,
    c.avatar_url,
    c.location,
    c.category,
    p.bio,
    jsonb_build_object('platforms', COALESCE(( SELECT jsonb_agg(jsonb_build_object('platform', kp2.platform, 'username', kp2.username, 'profileUrl', kp2.profile_url, 'followers', kp2.followers) ORDER BY kp2.followers DESC)
           FROM pos.kol_platforms kp2
          WHERE kp2.kol_id = c.source_id), '[]'::jsonb), 'portfolio', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', pi.id, 'platform', pi.platform, 'title', pi.title, 'contentUrl', pi.content_url, 'thumbnailUrl', pi.thumbnail_url, 'description', pi.description, 'publishedAt', pi.published_at, 'pinnedOrder', pi.pinned_order) ORDER BY pi.pinned_order, pi.published_at DESC NULLS LAST, pi.created_at DESC)
           FROM pos.kol_portfolio_items pi
          WHERE pi.kol_id = c.source_id AND pi.review_status = 'approved'::text AND pi.is_public = true), '[]'::jsonb), 'badges', COALESCE(( SELECT jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'description', b.description, 'icon', b.icon) ORDER BY b.name)
           FROM pos.kol_creator_badges cb
             JOIN pos.kol_badges b ON b.id = cb.badge_id
          WHERE cb.kol_id = c.source_id AND cb.is_visible = true AND b.is_active = true), '[]'::jsonb)) AS data,
    p.public_availability,
    p.availability_label
   FROM pos.kol_creators c
     LEFT JOIN pos.kol_profiles p ON p.kol_id = c.source_id
  WHERE c.status <> 'Rejected'::text;

notify pgrst, 'reload schema';
