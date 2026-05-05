-- Migration: Buat table order_status untuk tracking status order
-- Digunakan oleh Yumi Supervisor Agent dan halaman /admin/bar & /admin/kitchen

create table if not exists pos.order_status (
    id bigserial primary key,
    order_no text not null,
    group_type text not null check (group_type in ('barista', 'kitchen')),
    status text not null default 'new' check (status in ('new', 'dibuat', 'selesai')),
    order_type text,
    customer_name text,
    items jsonb default '[]'::jsonb,
    struk_line text,
    dibuat_by text,
    selesai_by text,
    dibuat_at timestamptz,
    selesai_at timestamptz,
    message_id bigint,
    chat_id bigint,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(order_no, group_type)
);

-- Index untuk query cepat
create index if not exists idx_order_status_group_type on pos.order_status(group_type);
create index if not exists idx_order_status_status on pos.order_status(status);
create index if not exists idx_order_status_updated on pos.order_status(updated_at desc);

-- Trigger auto update updated_at
create or replace function pos.update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_status_updated_at on pos.order_status;
create trigger trg_order_status_updated_at
    before update on pos.order_status
    for each row execute function pos.update_updated_at();

-- RLS: allow all authenticated users (sesuai pola existing)
alter table pos.order_status enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pos' AND tablename = 'order_status' AND policyname = 'Allow all authenticated'
  ) THEN
    CREATE POLICY "Allow all authenticated" ON pos.order_status
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;
