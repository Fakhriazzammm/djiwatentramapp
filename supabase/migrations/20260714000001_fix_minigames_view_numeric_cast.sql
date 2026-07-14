-- Fix pos_minigames & pos_minigame_entries: toleran angka desimal (Convex float).
-- Dokumen miniGames menyimpan angka spt "1.0" / "...944.39"; cast langsung
-- ::integer / ::bigint ditolak Postgres. Pakai ::numeric dulu (pola sama dgn
-- 20260515000002_fix_hpp_view_bigint_cast.sql).

create or replace view public.pos_minigames as
select
  d.document_id as _id,
  coalesce(nullif(d.document->>'brandSlug', ''), '') as "brandSlug",
  coalesce(nullif(d.document->>'name', ''), 'Mini Game') as name,
  coalesce(nullif(d.document->>'slug', ''), '') as slug,
  nullif(d.document->>'description', '') as description,
  coalesce((d.document->>'isActive')::boolean, false) as "isActive",
  coalesce((d.document->>'requireUniqueContact')::boolean, true) as "requireUniqueContact",
  coalesce(nullif(d.document->>'maxSpinsPerContact','')::numeric, 1)::integer as "maxSpinsPerContact",
  nullif(d.document->>'startAt', '')::numeric::bigint as "startAt",
  nullif(d.document->>'endAt', '')::numeric::bigint as "endAt",
  coalesce(nullif(d.document->>'spinDurationMs','')::numeric, 5200)::integer as "spinDurationMs",
  nullif(d.document->>'thankYouMessage', '') as "thankYouMessage",
  coalesce(d.document->'prizes', '[]'::jsonb) as prizes,
  coalesce(nullif(d.document->>'createdAt','')::numeric::bigint, floor(d.creation_time)::bigint) as "createdAt",
  coalesce(nullif(d.document->>'updatedAt','')::numeric::bigint, floor(d.creation_time)::bigint) as "updatedAt",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'miniGames';
alter view public.pos_minigames set (security_invoker = false);

create or replace view public.pos_minigame_entries as
select
  d.document_id as _id,
  nullif(d.document->>'gameId', '') as "gameId",
  coalesce(nullif(d.document->>'brandSlug', ''), '') as "brandSlug",
  nullif(d.document->>'fullName', '') as "fullName",
  nullif(d.document->>'email', '') as email,
  nullif(d.document->>'whatsapp', '') as whatsapp,
  nullif(d.document->>'instagram', '') as instagram,
  nullif(d.document->>'prizeId', '') as "prizeId",
  nullif(d.document->>'prizeLabel', '') as "prizeLabel",
  nullif(d.document->>'prizeDescription', '') as "prizeDescription",
  nullif(d.document->>'voucherCode', '') as "voucherCode",
  nullif(d.document->>'spinAngle', '')::numeric as "spinAngle",
  coalesce(nullif(d.document->>'contactStatus', ''), 'new') as "contactStatus",
  nullif(d.document->>'adminNotes', '') as "adminNotes",
  coalesce(nullif(d.document->>'createdAt','')::numeric::bigint, floor(d.creation_time)::bigint) as "createdAt",
  coalesce(nullif(d.document->>'updatedAt','')::numeric::bigint, floor(d.creation_time)::bigint) as "updatedAt",
  d.document as raw
from legacy_mirror.documents d
where d.table_name = 'miniGameEntries';
alter view public.pos_minigame_entries set (security_invoker = false);

grant select on public.pos_minigames to anon, authenticated;
grant select on public.pos_minigame_entries to anon, authenticated;
