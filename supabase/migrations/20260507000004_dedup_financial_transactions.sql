-- ──────────────────────────────────────────────────────────────
-- Migration: Dedup & Unique Constraint for Financial Transactions
-- ──────────────────────────────────────────────────────────────

-- 1) Hapus duplikat yang ada: retain row dengan source_id terendah
--    untuk setiap grup (tx_type, amount, category, description, tx_date dalam 5 menit)
with dups as (
  select source_id, tx_type, amount, category, description, tx_date,
         row_number() over (
           partition by tx_type, amount, category, description,
                        floor(tx_date / 300000)  -- 5-minute bucket
           order by creation_time asc, source_id asc
         ) as rn
  from pos.financial_transactions
),
to_delete as (
  select source_id from dups where rn > 1
)
delete from pos.financial_transactions
where source_id in (select source_id from to_delete);

-- 2) Generate source_fingerprint untuk semua row lama yang null
--    Fingerprint = sha256(tx_type || amount || category || description || tx_date bucket)
update pos.financial_transactions
set source_fingerprint = encode(
  sha256(
    (tx_type || '|' || amount::text || '|' || coalesce(category,'') || '|' || coalesce(description,'') || '|' || floor(tx_date / 60000)::text)::bytea
  ),
  'hex'
)
where source_fingerprint is null;

-- 3) Add UNIQUE index on source_fingerprint
create unique index if not exists ux_financial_transactions_source_fingerprint
  on pos.financial_transactions (source_fingerprint);

-- 4) Grant access for the index (indexes are automatically accessible)
