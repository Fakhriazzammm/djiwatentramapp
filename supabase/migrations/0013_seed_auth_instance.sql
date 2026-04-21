insert into auth.instances (
  id,
  uuid,
  raw_base_config,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  '{}'::text,
  now(),
  now()
where not exists (
  select 1 from auth.instances
);
