-- Migration: Stock Opname saat Clock Out
-- Menyimpan log opname stok per shift per role

create table if not exists pos.stock_opname_logs (
  source_id text primary key,
  shift_source_id text,
  staff_source_id text,
  staff_name text,
  role text not null,                  -- 'bar' atau 'kitchen'
  attendance_type text not null default 'check_out', -- clock_out / shift_close
  is_final boolean not null default false, -- true jika ini opname terakhir di role shift ini
  items jsonb not null,               -- [{inventory_source_id, ingredient_name, qty_before, qty_after, unit}]
  previous_opname_ids jsonb,          -- array source_id opname sebelumnya di shift+role yg sama
  notes text,
  creation_time double precision not null,
  raw jsonb not null
);

create index if not exists idx_pos_stock_opname_shift
  on pos.stock_opname_logs (shift_source_id, role);

create index if not exists idx_pos_stock_opname_creation
  on pos.stock_opname_logs (creation_time);

-- Grant write access to anon & authenticated
grant insert, select, update on pos.stock_opname_logs to anon, authenticated;
grant usage, select on sequence pos.stock_opname_logs_id_seq to anon, authenticated;
