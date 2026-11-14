-- Manager: pengaturan bersama, kategori & draf pengeluaran (dipakai app dan bot Telegram), PO, unggahan.
create table if not exists public.mgr_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.mgr_settings (key, value) values
  ('expense_format', '{"header":"💸 Pengeluaran Tercatat!","showNo":true,"showPay":true,"showIcons":true,"footer":"","showConf":false}'),
  ('expense_policy', '{"approvalAbove":1000000,"photoMin":100000,"dup":true}'),
  ('opname_policy', '{"tolDefault":5,"tolImportant":2,"blind":true,"photoAbove":100000,"finalJournal":false,"mgrNeedsOwner":false}'),
  ('ai_config', '{"enabled":true,"model":"qwen3.7-flash","fallbackModel":"gpt-5-nano","planHourWib":6}'),
  ('payroll_policy', '{"period":"monthly","slipNeedsOwner":false,"adjustmentLimit":500000}')
on conflict (key) do nothing;

create table if not exists public.mgr_expense_categories (
  slug text primary key,
  label text not null,
  icon text not null default '📌',
  position int not null default 0,
  active boolean not null default true
);
insert into public.mgr_expense_categories (slug, label, icon, position) values
  ('bahan_minuman','Bahan Minuman','☕',1),('bahan_makanan','Bahan Makanan','🍳',2),
  ('bahan_segar','Sayur & Bahan Segar','🥬',3),('packaging','Packaging & Wadah','📦',4),
  ('cleaning','Cleaning & Sanitasi','🧹',5),('gas_energi','Gas & Energi','🔥',6),
  ('peralatan','Peralatan & Mesin','🔧',7),('gaji','Gaji & Honor','👥',8),
  ('transport','Transport & Delivery','🚗',9),('promosi','Promosi & Marketing','📢',10),
  ('sewa_wifi','Sewa & Internet','🏠',11),('operasional','Operasional Lain','📋',12),
  ('lainnya','Lainnya','📌',13)
on conflict (slug) do nothing;

create table if not exists public.mgr_expense_drafts (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'app' check (channel in ('app','telegram')),
  created_by text not null,
  created_by_name text,
  status text not null default 'draft' check (status in ('draft','saved','pending_approval','rejected')),
  photo_url text,
  merchant text,
  tx_date timestamptz not null default now(),
  payment_method text not null default 'cash',
  items jsonb not null default '[]'::jsonb,       -- [{name, qty, unit, price, total, category}]
  total numeric(18,2) not null default 0,
  raw_ocr jsonb,
  finance_source_id text,                         -- pos.financial_transactions.source_id
  decision_note text,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mgr_expense_drafts_status on public.mgr_expense_drafts (status, created_at desc);

create table if not exists public.mgr_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  supplier_name text not null,
  items jsonb not null default '[]'::jsonb,       -- [{name, qty, unit, price}]
  total numeric(18,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  note text,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['mgr_settings','mgr_expense_categories','mgr_expense_drafts','mgr_purchase_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('manager-uploads','manager-uploads', true) on conflict (id) do nothing;
  end if;
end $$;
