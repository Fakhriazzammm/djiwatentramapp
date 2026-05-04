-- Supplier Directory — imported from Google Sheet DATA SUPPLIER
create table if not exists pos.suppliers (
  id bigint primary key generated always as identity,
  name text not null,
  category text not null,
  grade text,
  price_range text,
  address text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_name_idx on pos.suppliers (name);
create index if not exists suppliers_category_idx on pos.suppliers (category);
create index if not exists suppliers_grade_idx on pos.suppliers (grade);

-- RLS
alter table pos.suppliers enable row level security;
create policy "suppliers_public_all" on pos.suppliers for all to anon, authenticated using (true) with check (true);
grant all on pos.suppliers to anon, authenticated;
grant usage on sequence pos.suppliers_id_seq to anon, authenticated;
