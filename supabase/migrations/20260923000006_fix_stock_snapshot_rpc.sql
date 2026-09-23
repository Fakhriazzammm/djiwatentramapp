-- Fix ambiguous PL/pgSQL OUT parameter names in the stock snapshot RPC.

drop function if exists pos.capture_shift_product_availability_snapshot(text, text, text, double precision);

create or replace function pos.capture_shift_product_availability_snapshot(
  p_shift_source_id text,
  p_phase text,
  p_captured_by_user_id text default null,
  p_captured_at double precision default null
)
returns table (
  result_shift_source_id text,
  result_phase text,
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
  from pos.products as p
  on conflict on constraint shift_product_availability_sn_shift_source_id_phase_product_key do nothing;

  select min(s.snapshot_id), max(s.snapshot_id)
    into min_id, max_id
  from pos.shift_product_availability_snapshots as s
  where s.shift_source_id = p_shift_source_id and s.phase = p_phase;

  return query
  select p_shift_source_id,
    p_phase,
    count(*)::integer,
    count(*) filter (where s.is_available)::integer,
    count(*) filter (where not s.is_available)::integer,
    min_id,
    max_id
  from pos.shift_product_availability_snapshots as s
  where s.shift_source_id = p_shift_source_id and s.phase = p_phase;
end;
$$;

grant execute on function pos.capture_shift_product_availability_snapshot(text, text, text, double precision) to anon, authenticated;
notify pgrst, 'reload schema';
