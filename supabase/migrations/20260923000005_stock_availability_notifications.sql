-- Durable menu availability events and shift stock snapshots.
-- Additive only: no historical orders or financial records are changed.

create table if not exists pos.product_availability_events (
  event_id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  product_source_id text not null,
  product_name_snapshot text not null,
  menu_number_snapshot integer,
  previous_is_available boolean not null,
  new_is_available boolean not null,
  quantity_snapshot numeric(18,4),
  source text not null default 'pos_menu_stock',
  source_action_id text,
  changed_by_user_id text,
  changed_by_name_snapshot text,
  shift_source_id text,
  changed_at double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_product_availability_events_pending
  on pos.product_availability_events (event_id);

create table if not exists pos.shift_product_availability_snapshots (
  snapshot_id bigint generated always as identity primary key,
  shift_source_id text not null,
  phase text not null check (phase in ('opening', 'closing')),
  product_source_id text not null,
  product_name_snapshot text not null,
  menu_number_snapshot integer,
  is_available boolean not null,
  quantity_snapshot numeric(18,4),
  captured_at double precision not null,
  captured_by_user_id text,
  created_at timestamptz not null default now(),
  unique (shift_source_id, phase, product_source_id)
);

create index if not exists idx_pos_shift_product_availability_snapshots_shift
  on pos.shift_product_availability_snapshots (shift_source_id, phase, snapshot_id);

create table if not exists pos.telegram_stock_notification_deliveries (
  delivery_id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  notification_type text not null,
  source_event_id text,
  chat_id text not null,
  sender text not null default 'yumi_purchasing',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  telegram_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_telegram_stock_notification_deliveries_pending
  on pos.telegram_stock_notification_deliveries (status, delivery_id);

create or replace function pos.update_product_availability_with_event(
  p_product_source_id text,
  p_new_is_available boolean,
  p_changed_by_user_id text default null,
  p_changed_by_name text default null,
  p_shift_source_id text default null,
  p_source text default 'pos_menu_stock',
  p_source_action_id text default null
)
returns table (
  product_source_id text,
  changed boolean,
  previous_is_available boolean,
  new_is_available boolean,
  event_id bigint
)
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  product_row pos.products%rowtype;
  event_key text;
  created_event_id bigint;
begin
  select * into product_row
  from pos.products
  where source_id = p_product_source_id
  for update;

  if not found then
    raise exception 'Produk tidak ditemukan: %', p_product_source_id;
  end if;

  if product_row.is_available = p_new_is_available then
    return query select product_row.source_id, false, product_row.is_available,
      product_row.is_available, null::bigint;
    return;
  end if;

  update pos.products
  set is_available = p_new_is_available,
      raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
        'lastAvailabilityChangedAt', extract(epoch from clock_timestamp()) * 1000,
        'lastAvailabilityChangedBy', p_changed_by_user_id
      )
  where source_id = product_row.source_id;

  event_key := coalesce(
    nullif(trim(p_source_action_id), '') || ':' || product_row.source_id || ':' || p_new_is_available::text,
    'availability:' || product_row.source_id || ':' || extract(epoch from clock_timestamp())::text || ':' || p_new_is_available::text
  );

  insert into pos.product_availability_events (
    dedupe_key, product_source_id, product_name_snapshot, menu_number_snapshot,
    previous_is_available, new_is_available, quantity_snapshot, source,
    source_action_id, changed_by_user_id, changed_by_name_snapshot,
    shift_source_id, changed_at
  ) values (
    event_key, product_row.source_id, product_row.name, product_row.menu_number,
    product_row.is_available, p_new_is_available, product_row.quantity,
    coalesce(nullif(trim(p_source), ''), 'pos_menu_stock'),
    p_source_action_id, p_changed_by_user_id, p_changed_by_name,
    p_shift_source_id, extract(epoch from clock_timestamp()) * 1000
  )
  on conflict (dedupe_key) do nothing
  returning product_availability_events.event_id into created_event_id;

  return query select product_row.source_id, true, product_row.is_available,
    p_new_is_available, created_event_id;
end;
$$;

create or replace function pos.capture_shift_product_availability_snapshot(
  p_shift_source_id text,
  p_phase text,
  p_captured_by_user_id text default null,
  p_captured_at double precision default null
)
returns table (
  shift_source_id text,
  phase text,
  total_products integer,
  on_products integer,
  off_products integer,
  snapshot_id_min bigint,
  snapshot_id_max bigint
)
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  capture_time double precision := coalesce(p_captured_at, extract(epoch from clock_timestamp()) * 1000);
  min_id bigint;
  max_id bigint;
begin
  if p_shift_source_id is null or trim(p_shift_source_id) = '' then
    raise exception 'shift_source_id wajib diisi';
  end if;
  if p_phase not in ('opening', 'closing') then
    raise exception 'phase harus opening atau closing';
  end if;

  insert into pos.shift_product_availability_snapshots (
    shift_source_id, phase, product_source_id, product_name_snapshot,
    menu_number_snapshot, is_available, quantity_snapshot, captured_at,
    captured_by_user_id
  )
  select p_shift_source_id, p_phase, p.source_id, p.name, p.menu_number,
    p.is_available, p.quantity, capture_time, p_captured_by_user_id
  from pos.products p
  on conflict (shift_source_id, phase, product_source_id) do nothing;

  select min(snapshot_id), max(snapshot_id)
    into min_id, max_id
  from pos.shift_product_availability_snapshots
  where shift_source_id = p_shift_source_id and phase = p_phase;

  return query
  select p_shift_source_id,
    p_phase,
    count(*)::integer,
    count(*) filter (where is_available)::integer,
    count(*) filter (where not is_available)::integer,
    min_id,
    max_id
  from pos.shift_product_availability_snapshots
  where shift_source_id = p_shift_source_id and phase = p_phase;
end;
$$;

grant usage on schema pos to anon, authenticated;
grant execute on function pos.update_product_availability_with_event(text, boolean, text, text, text, text, text) to anon, authenticated;
grant execute on function pos.capture_shift_product_availability_snapshot(text, text, text, double precision) to anon, authenticated;
grant select on pos.product_availability_events to service_role;
grant select on pos.shift_product_availability_snapshots to service_role;
create or replace function pos.claim_stock_notification(
  p_dedupe_key text,
  p_notification_type text,
  p_source_event_id text,
  p_chat_id text
)
returns boolean
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  claimed boolean := false;
begin
  insert into pos.telegram_stock_notification_deliveries (
    dedupe_key, notification_type, source_event_id, chat_id,
    sender, status, attempt_count, updated_at
  ) values (
    p_dedupe_key, p_notification_type, p_source_event_id, p_chat_id,
    'yumi_purchasing', 'pending', 0, now()
  ) on conflict (dedupe_key) do nothing;

  update pos.telegram_stock_notification_deliveries
  set status = 'sending', attempt_count = attempt_count + 1, updated_at = now()
  where dedupe_key = p_dedupe_key
    and (
      status in ('pending', 'failed')
      or (status = 'sending' and updated_at < now() - interval '10 minutes')
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function pos.mark_stock_notification(
  p_dedupe_key text,
  p_status text,
  p_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pos, public
as $$
begin
  update pos.telegram_stock_notification_deliveries
  set status = case when p_status = 'sent' then 'sent' else 'failed' end,
      telegram_message_id = coalesce(p_message_id, telegram_message_id),
      last_error = case when p_status = 'sent' then null else p_status end,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      updated_at = now()
  where dedupe_key = p_dedupe_key;
  return found;
end;
$$;

grant execute on function pos.claim_stock_notification(text, text, text, text) to service_role;
grant execute on function pos.mark_stock_notification(text, text, text) to service_role;

grant select, insert, update on pos.telegram_stock_notification_deliveries to service_role;

create or replace view public.pos_product_availability_events as
select event_id, dedupe_key, product_source_id, product_name_snapshot,
  menu_number_snapshot, previous_is_available, new_is_available,
  quantity_snapshot, source, source_action_id, changed_by_user_id,
  changed_by_name_snapshot, shift_source_id, changed_at, created_at
from pos.product_availability_events;

grant select on public.pos_product_availability_events to service_role;

grant select on public.pos_product_availability_events to anon, authenticated;

create or replace view public.pos_shift_product_availability_snapshots as
select snapshot_id, shift_source_id, phase, product_source_id,
  product_name_snapshot, menu_number_snapshot, is_available,
  quantity_snapshot, captured_at, captured_by_user_id, created_at
from pos.shift_product_availability_snapshots;

grant select on public.pos_shift_product_availability_snapshots to service_role;
grant select on public.pos_shift_product_availability_snapshots to anon, authenticated;

grant execute on function pos.claim_stock_notification(text, text, text, text) to service_role;
grant execute on function pos.mark_stock_notification(text, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_class where relname = 'product_availability_events') then
    alter table pos.product_availability_events enable row level security;
  end if;
  if exists (select 1 from pg_class where relname = 'shift_product_availability_snapshots') then
    alter table pos.shift_product_availability_snapshots enable row level security;
  end if;
  if exists (select 1 from pg_class where relname = 'telegram_stock_notification_deliveries') then
    alter table pos.telegram_stock_notification_deliveries enable row level security;
  end if;
end $$;

notify pgrst, 'reload schema';
