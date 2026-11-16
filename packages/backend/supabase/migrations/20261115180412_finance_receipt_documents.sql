-- Additive only: the old receipt/items contract and historical ledger stay intact.
-- Finance API database only (Postgres Helipod), not the wallet/auth database.
set local lock_timeout = '3s';
alter table finance.receipts add column if not exists details jsonb;
alter table finance.receipts add column if not exists confirmed_at timestamptz;
