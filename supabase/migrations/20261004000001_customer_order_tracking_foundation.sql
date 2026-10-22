begin;

create table if not exists pos.order_tracking_events (
  id bigserial primary key,
  order_source_id text not null,
  order_no text,
  event_type text not null,
  from_status text,
  to_status text not null,
  group_type text,
  actor_type text not null default 'system',
  actor_id text,
  source_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists ux_order_tracking_events_idempotency
  on pos.order_tracking_events(order_source_id, event_type, source_event_id)
  where source_event_id is not null;
create index if not exists idx_order_tracking_events_order_time
  on pos.order_tracking_events(order_source_id, occurred_at desc);

create table if not exists pos.order_tracking_estimates (
  order_source_id text primary key references pos.orders(source_id) on delete cascade,
  estimated_ready_at timestamptz,
  estimate_source text,
  confidence text,
  updated_by text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_order_tracking_estimates_ready
  on pos.order_tracking_estimates(estimated_ready_at);

alter table pos.order_tracking_events enable row level security;
alter table pos.order_tracking_estimates enable row level security;
revoke all on pos.order_tracking_events from anon, authenticated;
revoke all on pos.order_tracking_estimates from anon, authenticated;
grant all on pos.order_tracking_events to service_role;
grant all on pos.order_tracking_estimates to service_role;
grant usage, select on sequence pos.order_tracking_events_id_seq to service_role;

commit;
