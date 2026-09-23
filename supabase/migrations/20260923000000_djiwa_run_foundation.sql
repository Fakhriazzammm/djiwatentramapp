-- Djiwa Run foundation: additive/idempotent campaign, proof, progress and reward ledger.
-- Customer identity is auth.users.id mirrored as pos.customers.source_id.
create schema if not exists pos;

create table if not exists pos.run_campaigns (
  id uuid primary key default gen_random_uuid(), brand_slug text not null default 'djiwa', name text not null,
  period_type text not null check (period_type in ('weekly','monthly')), starts_at timestamptz not null,
  ends_at timestamptz not null, timezone text not null default 'Asia/Jakarta',
  status text not null default 'draft' check (status in ('draft','active','ended','archived')),
  settings jsonb not null default '{}', created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists pos.run_tiers (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references pos.run_campaigns(id) on delete cascade,
  code text not null, name text not null, target_km numeric(8,2) not null check (target_km > 0),
  period_scope text not null check (period_scope in ('weekly','monthly')), sort_order integer not null default 0,
  reward_category text check (reward_category in ('coffee','breakfast','merchandise')),
  reward_config jsonb not null default '{}', eligible_product_ids jsonb not null default '[]', max_amount bigint,
  expiry_hours integer, badge_key text, upgrade_group text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(campaign_id, code)
);
create table if not exists pos.run_activities (
  id uuid primary key default gen_random_uuid(), customer_source_id text not null references pos.customers(source_id) on delete cascade,
  campaign_id uuid not null references pos.run_campaigns(id) on delete restrict, activity_date date not null,
  distance_km numeric(8,2) not null check (distance_km > 0), activity_type text not null check (activity_type in ('running','walking')),
  duration_seconds integer, pace_seconds_per_km integer, source text not null default 'screenshot_ai' check (source in ('screenshot_ai','manual','admin')),
  source_app text, proof_storage_path text, proof_sha256 text, location_lat numeric(9,6), location_lng numeric(9,6),
  location_accuracy_m numeric(8,2), geofence_distance_m numeric(8,2), geofence_radius_m numeric(8,2),
  geofence_status text not null check (geofence_status in ('inside','outside','unavailable')),
  location_checked_at timestamptz, extracted_data jsonb not null default '{}', ai_confidence numeric(5,4),
  status text not null default 'review' check (status in ('accepted','review','rejected')),
  idempotency_key text not null unique, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz, review_note text
);
create unique index if not exists run_activities_customer_proof_uq on pos.run_activities(customer_source_id, proof_sha256) where proof_sha256 is not null;
create index if not exists run_activities_customer_campaign_idx on pos.run_activities(customer_source_id, campaign_id, activity_date);
create table if not exists pos.run_progress (
  id uuid primary key default gen_random_uuid(), customer_source_id text not null references pos.customers(source_id) on delete cascade,
  campaign_id uuid not null references pos.run_campaigns(id) on delete cascade, tier_id uuid not null references pos.run_tiers(id) on delete cascade,
  distance_km numeric(8,2) not null default 0 check (distance_km >= 0), target_km numeric(8,2) not null check (target_km > 0),
  status text not null default 'in_progress' check (status in ('in_progress','completed','upgraded')),
  completed_at timestamptz, updated_at timestamptz not null default now(), unique(customer_source_id,campaign_id,tier_id)
);
create table if not exists pos.run_rewards (
  id uuid primary key default gen_random_uuid(), customer_source_id text not null references pos.customers(source_id) on delete cascade,
  campaign_id uuid not null references pos.run_campaigns(id) on delete cascade, tier_id uuid not null references pos.run_tiers(id) on delete restrict,
  reward_category text not null check (reward_category in ('coffee','breakfast','merchandise')),
  status text not null default 'unlocked' check (status in ('unlocked','credited','reserved','redeemed','expired','revoked')),
  max_amount bigint not null check (max_amount >= 0), remaining_amount bigint not null check (remaining_amount >= 0),
  eligible_product_ids jsonb not null default '[]', claim_code text unique, wallet_ledger_id text, redeemed_order_id text,
  unlocked_at timestamptz not null default now(), claimed_at timestamptz, expires_at timestamptz, redeemed_at timestamptz,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(customer_source_id,campaign_id,tier_id)
);
create table if not exists pos.run_badges (
  id uuid primary key default gen_random_uuid(), customer_source_id text not null references pos.customers(source_id) on delete cascade,
  badge_key text not null, campaign_id uuid references pos.run_campaigns(id) on delete cascade, period_label text,
  earned_at timestamptz not null default now(), metadata jsonb not null default '{}', unique(customer_source_id,badge_key,campaign_id)
);
create table if not exists pos.run_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_type text not null check (actor_type in ('customer','admin','system','pos')),
  actor_id text, entity_type text not null, entity_id text not null, action text not null, old_values jsonb, new_values jsonb,
  reason text, created_at timestamptz not null default now()
);

create index if not exists run_campaigns_active_idx on pos.run_campaigns(status, starts_at, ends_at);
create index if not exists run_progress_customer_idx on pos.run_progress(customer_source_id, updated_at desc);
create index if not exists run_rewards_customer_idx on pos.run_rewards(customer_source_id, status, expires_at);

-- Deterministic read model: only accepted, in-period activity contributes.
create or replace function pos.run_rebuild_progress(p_customer_source_id text, p_campaign_id uuid)
returns void language plpgsql security definer set search_path = pos, public as $$
declare r record; d numeric(8,2); done boolean;
begin
  for r in select t.id,t.target_km from pos.run_tiers t where t.campaign_id=p_campaign_id and t.is_active loop
    select coalesce(sum(a.distance_km),0) into d from pos.run_activities a join pos.run_campaigns c on c.id=a.campaign_id
      where a.customer_source_id=p_customer_source_id and a.campaign_id=p_campaign_id and a.status='accepted'
        and a.activity_date >= c.starts_at::date and a.activity_date <= c.ends_at::date
        and ((select period_scope from pos.run_tiers where id=r.id) = 'monthly' or true);
    done := d >= r.target_km;
    insert into pos.run_progress(customer_source_id,campaign_id,tier_id,distance_km,target_km,status,completed_at,updated_at)
    values(p_customer_source_id,p_campaign_id,r.id,round(d,2),r.target_km,case when done then 'completed' else 'in_progress' end,case when done then coalesce((select completed_at from pos.run_progress where customer_source_id=p_customer_source_id and tier_id=r.id),now()) end,now())
    on conflict(customer_source_id,campaign_id,tier_id) do update set distance_km=excluded.distance_km,target_km=excluded.target_km,status=excluded.status,completed_at=coalesce(pos.run_progress.completed_at,excluded.completed_at),updated_at=now();
  end loop;
end $$;

create or replace view public.run_active_campaigns with (security_invoker=true) as select * from pos.run_campaigns where status='active' and now() between starts_at and ends_at;
create or replace view public.run_customer_progress with (security_invoker=true) as select * from pos.run_progress where customer_source_id = coalesce(auth.uid()::text,'');
create or replace view public.run_customer_rewards with (security_invoker=true) as select * from pos.run_rewards where customer_source_id = coalesce(auth.uid()::text,'');
create or replace view public.run_customer_badges with (security_invoker=true) as select * from pos.run_badges where customer_source_id = coalesce(auth.uid()::text,'');
create or replace view public.run_activity_history with (security_invoker=true) as select id,customer_source_id,campaign_id,activity_date,distance_km,activity_type,source,source_app,extracted_data,ai_confidence,status,created_at,review_note from pos.run_activities where customer_source_id = coalesce(auth.uid()::text,'');
create or replace view public.run_admin_progress with (security_invoker=true) as select * from pos.run_progress;
create or replace view public.run_reward_operations with (security_invoker=true) as select * from pos.run_rewards;

alter table pos.run_campaigns enable row level security; alter table pos.run_tiers enable row level security; alter table pos.run_activities enable row level security; alter table pos.run_progress enable row level security; alter table pos.run_rewards enable row level security; alter table pos.run_badges enable row level security; alter table pos.run_audit_logs enable row level security;
-- Direct table access is intentionally read-only for authenticated users; mutations are server-function controlled.
do $$ declare t text; begin foreach t in array array['run_campaigns','run_tiers','run_activities','run_progress','run_rewards','run_badges','run_audit_logs'] loop execute format('drop policy if exists run_read_%s on pos.%I',t,t); end loop; end $$;
create policy run_read_run_campaigns on pos.run_campaigns for select to anon,authenticated using (status='active' or auth.role()='service_role');
create policy run_read_run_tiers on pos.run_tiers for select to anon,authenticated using (is_active or auth.role()='service_role');
create policy run_read_run_activities on pos.run_activities for select to authenticated using (customer_source_id=coalesce(auth.uid()::text,'') or auth.role()='service_role');
create policy run_read_run_progress on pos.run_progress for select to authenticated using (customer_source_id=coalesce(auth.uid()::text,'') or auth.role()='service_role');
create policy run_read_run_rewards on pos.run_rewards for select to authenticated using (customer_source_id=coalesce(auth.uid()::text,'') or auth.role()='service_role');
create policy run_read_run_badges on pos.run_badges for select to authenticated using (customer_source_id=coalesce(auth.uid()::text,'') or auth.role()='service_role');
create policy run_read_run_audit_logs on pos.run_audit_logs for select to service_role using (true);

grant usage on schema pos to anon,authenticated;
grant select on pos.run_campaigns,pos.run_tiers to anon,authenticated;
grant select on pos.run_activities,pos.run_progress,pos.run_rewards,pos.run_badges to authenticated;
grant select on public.run_active_campaigns,public.run_customer_progress,public.run_customer_rewards,public.run_customer_badges,public.run_activity_history to anon,authenticated;
grant select on public.run_admin_progress,public.run_reward_operations to authenticated;
grant execute on function pos.run_rebuild_progress(text,uuid) to service_role;

-- Private proof bucket; service-role Edge Function is the only writer/reader.
insert into storage.buckets (id, name, public)
values ('run-proofs', 'run-proofs', false)
on conflict (id) do update set public = excluded.public;
