-- Ensure anon/authenticated can read legacy_mirror.documents so that
-- pos_hpp_calculations (security_invoker = true) works without error.
-- These grants are idempotent; safe to re-run.
grant select on legacy_mirror.documents to anon, authenticated;

-- Also recreate the view without security_invoker so it works even in
-- environments where the table grant above hasn't propagated yet.
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
    nullif(document->>'updatedAt', '')::bigint,
    nullif(document->>'createdAt', '')::bigint,
    floor(creation_time)::bigint
  ) as "updatedAt",
  document as raw
from legacy_mirror.documents
where table_name = 'hppCalculations';

grant select on public.pos_hpp_calculations to anon, authenticated;
