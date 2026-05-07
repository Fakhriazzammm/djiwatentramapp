-- ──────────────────────────────────────────────────────────────
-- Migration: Accounting schema — Chart of Accounts + Double-Entry
-- Fase 1 dari sistem akuntansi.
-- Menambahkan tabel: chart_of_accounts, accounting_entries,
-- item_embeddings, reconciliation_logs.
-- plus backfill semua data financial_transactions yang sudah ada.
-- ──────────────────────────────────────────────────────────────

-- 1) Chart of Accounts
create table if not exists public.accounting_chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'kredit')),
  parent_id uuid references public.accounting_chart_of_accounts(id),
  is_active boolean default true,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_coa_code on public.accounting_chart_of_accounts(code);
create index if not exists idx_coa_parent on public.accounting_chart_of_accounts(parent_id);

-- 2) Seed COA untuk F&B
insert into public.accounting_chart_of_accounts (code, name, type, normal_balance, description) values
  ('1-1000', 'Kas Tunai',           'asset',   'debit',  'Uang tunai di laci kasir'),
  ('1-1100', 'Kas QRIS',            'asset',   'debit',  'Pembayaran QRIS yang belum disetor'),
  ('1-2000', 'Persediaan Bahan Baku','asset',  'debit',  'Nilai stok bahan baku di gudang'),
  ('1-3000', 'Perlengkapan',         'asset',   'debit', 'Perlengkapan toko (gelas, sendok, dll)'),
  ('3-1000', 'Modal Pemilik',        'equity',  'kredit', 'Modal awal dari pemilik'),
  ('3-2000', 'Prive',               'equity',  'debit',  'Penarikan pribadi pemilik'),
  ('3-3000', 'Laba Ditahan',         'equity',  'kredit', 'Akumulasi laba yang ditahan'),
  ('4-1000', 'Pendapatan Penjualan', 'revenue', 'kredit', 'Pendapatan dari penjualan menu'),
  ('4-2000', 'Pendapatan Lain-lain', 'revenue', 'kredit','Pendapatan di luar penjualan reguler'),
  ('5-1000', 'Beban Gaji',           'expense', 'debit',  'Gaji karyawan'),
  ('5-2000', 'Beban Bahan Baku',     'expense', 'debit',  'Pembelian bahan baku produksi'),
  ('5-2100', 'Beban Kopi & Susu',    'expense', 'debit',  'Biji kopi, susu, creamer'),
  ('5-2200', 'Beban Tepung & Roti',  'expense', 'debit',  'Tepung, roti, croissant'),
  ('5-2300', 'Beban Minuman Sirup',  'expense', 'debit',  'Sirup, soda, air mineral'),
  ('5-2400', 'Beban Packing',        'expense', 'debit',  'Kemasan, gelas, cup, lid'),
  ('5-3000', 'Beban Operasional',    'expense', 'debit',  'Biaya operasional harian'),
  ('5-3100', 'Beban Listrik & Air',  'expense', 'debit',  'Tagihan listrik dan air'),
  ('5-3200', 'Beban Sewa',           'expense', 'debit',  'Sewa tempat'),
  ('5-3300', 'Beban Transportasi',   'expense', 'debit',  'Biaya transportasi dan bensin'),
  ('5-4000', 'Beban Promosi',        'expense', 'debit',  'Biaya iklan dan promosi'),
  ('5-5000', 'Beban Penyusutan',     'expense', 'debit',  'Penyusutan aset tetap')
on conflict (code) do nothing;

-- 3) Accounting Entries (Double-Entry)
create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_source_id text not null,
  coa_id uuid not null references public.accounting_chart_of_accounts(id),
  entry_type text not null check (entry_type in ('debit', 'kredit')),
  amount numeric(18,2) not null check (amount >= 0),
  description text,
  item_index integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_acc_entries_tx on public.accounting_entries(transaction_source_id);
create index if not exists idx_acc_entries_coa on public.accounting_entries(coa_id);
create index if not exists idx_acc_entries_created on public.accounting_entries(created_at);

-- 4) Item Embeddings (untuk AI COA Classification — JSONB sementara, nanti pake pgvector)
create table if not exists public.accounting_item_embeddings (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  coa_id uuid not null references public.accounting_chart_of_accounts(id),
  embedding_json text,
  usage_count integer default 1,
  last_used_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_item_emb_name on public.accounting_item_embeddings(item_name);
create index if not exists idx_item_emb_coa on public.accounting_item_embeddings(coa_id);

-- 5) Reconciliation Logs
create table if not exists public.accounting_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  shift_source_id text not null,
  reconciled_at timestamptz default now(),
  total_debit numeric(18,2) default 0,
  total_kredit numeric(18,2) default 0,
  selisih numeric(18,2) default 0,
  cash_system numeric(18,2) default 0,
  cash_physical numeric(18,2) default 0,
  cash_selisih numeric(18,2) default 0,
  status text check (status in ('balanced', 'unbalanced')) default 'balanced',
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_recon_shift on public.accounting_reconciliation_logs(shift_source_id);
create index if not exists idx_recon_date on public.accounting_reconciliation_logs(reconciled_at);

-- 6) Grants
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- 7) RLS Policies
alter table public.accounting_chart_of_accounts enable row level security;
create policy coa_anon_select on public.accounting_chart_of_accounts
  for select to anon, authenticated using (true);

alter table public.accounting_entries enable row level security;
create policy entries_anon_select on public.accounting_entries
  for select to anon, authenticated using (true);
create policy entries_anon_insert on public.accounting_entries
  for insert to anon, authenticated with check (true);

alter table public.accounting_item_embeddings enable row level security;
create policy emb_anon_select on public.accounting_item_embeddings
  for select to anon, authenticated using (true);
create policy emb_anon_insert on public.accounting_item_embeddings
  for insert to anon, authenticated with check (true);

alter table public.accounting_reconciliation_logs enable row level security;
create policy recon_anon_select on public.accounting_reconciliation_logs
  for select to anon, authenticated using (true);
create policy recon_anon_insert on public.accounting_reconciliation_logs
  for insert to anon, authenticated with check (true);

-- 8) Updated_at trigger
create or replace function public.trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_coa
  before update on public.accounting_chart_of_accounts
  for each row
  execute function public.trigger_set_updated_at();

-- 9) Refresh PostgREST cache
notify pgrst, 'reload schema';
