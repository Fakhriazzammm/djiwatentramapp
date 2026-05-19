-- Atomic sequential counter per category/prefix for human-friendly external IDs
create table if not exists public.registration_counters (
  category text primary key,       -- 'registration', 'employee', or role_code like 'BRT'
  prefix text not null,            -- 'REG', 'EMP', 'BRT', 'KSR', etc.
  year_prefix text not null default to_char(now(), 'YYYY'),
  counter integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Function to atomically increment and return next number
create or replace function public.next_registration_number(p_category text, p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_counter integer;
  v_formatted text;
begin
  -- Try to insert new counter; if category+year exists, increment
  insert into public.registration_counters (category, prefix, year_prefix, counter)
  values (p_category, p_prefix, v_year, 1)
  on conflict (category) do update
    set counter = case
      when registration_counters.year_prefix = v_year then registration_counters.counter + 1
      else 1
    end,
    year_prefix = case
      when registration_counters.year_prefix = v_year then registration_counters.year_prefix
      else v_year
    end,
    prefix = case
      when registration_counters.year_prefix = v_year then registration_counters.prefix
      else p_prefix
    end,
    updated_at = now()
  returning counter into v_counter;

  v_formatted := p_prefix || '-' || v_year || '-' || lpad(v_counter::text, 4, '0');
  return v_formatted;
end;
$$;
