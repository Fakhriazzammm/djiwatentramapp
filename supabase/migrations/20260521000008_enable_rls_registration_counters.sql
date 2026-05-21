-- Enable RLS on registration_counters table
-- RPC next_registration_number() is already SECURITY DEFINER, so it bypasses RLS
-- Only SELECT policy is needed for anon/authenticated to read counter values

alter table public.registration_counters enable row level security;

drop policy if exists "registration_counters_select" on public.registration_counters;

create policy "registration_counters_select"
  on public.registration_counters
  for select to anon, authenticated
  using (true);

grant select on public.registration_counters to anon, authenticated;
