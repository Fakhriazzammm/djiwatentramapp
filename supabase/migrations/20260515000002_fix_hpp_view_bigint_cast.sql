-- Fix pos_hpp_calculations: updatedAt cast to numeric first then bigint
-- Data tersimpan sebagai "1775555061239.0" (float string), ::bigint langsung gagal
-- Pakai ::numeric::bigint agar konversi toleran terhadap format desimal

create or replace view public.pos_hpp_calculations as
select
  document_id as _id,
  nullif(document->>'productId', '') as "productId",
  coalesce(nullif(document->>'name', ''), 'HPP Calculation') as name,
  coalesce(nullif(document->>'sellingPrice', '')::numeric, 0) as "sellingPrice",
  coalesce(nullif(document->>'servingsPerBatch', '')::numeric, 1) as "servingsPerBatch",
  coalesce(document->'ingredients', '[]'::jsonb) as ingredients,
  coalesce(document->'overheadCosts', '[]'::jsonb) as "overheadCosts",
  coalesce(
    nullif(nullif(document->>'updatedAt', '')::numeric::bigint, 0),
    nullif(nullif(document->>'createdAt', '')::numeric::bigint, 0),
    floor(creation_time)::bigint
  ) as "updatedAt",
  document as raw
from legacy_mirror.documents
where table_name = 'hppCalculations';

-- security_invoker = false agar view bisa akses legacy_mirror tanpa expose base table
alter view public.pos_hpp_calculations set (security_invoker = false);
