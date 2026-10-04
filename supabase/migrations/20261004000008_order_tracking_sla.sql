begin;

create table if not exists pos.order_tracking_sla_policies (
  policy_id text primary key,
  order_type text not null default '*',
  channel text not null default '*',
  sla_minutes integer not null check (sla_minutes > 0),
  starts_on_event text not null default 'paid',
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into pos.order_tracking_sla_policies
  (policy_id, order_type, channel, sla_minutes, starts_on_event)
values
  ('customer-default-30m', '*', '*', 30, 'paid')
on conflict (policy_id) do update set
  sla_minutes = excluded.sla_minutes,
  starts_on_event = excluded.starts_on_event,
  active = true,
  updated_at = now();

alter table pos.order_tracking_sla_policies enable row level security;
revoke all on pos.order_tracking_sla_policies from anon, authenticated;
grant all on pos.order_tracking_sla_policies to service_role;

commit;
