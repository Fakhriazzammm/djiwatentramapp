-- Djiwa Run v2: GPS sessions, wallet rewards, streak, leaderboard, teams. Additive and idempotent.
create schema if not exists pos;

alter table pos.run_activities drop constraint if exists run_activities_source_check;
alter table pos.run_activities add constraint run_activities_source_check
  check (source in ('screenshot_ai','manual','admin','gps'));
alter table pos.run_activities drop constraint if exists run_activities_geofence_status_check;
alter table pos.run_activities add constraint run_activities_geofence_status_check
  check (geofence_status in ('inside','outside','unavailable','not_required'));

alter table pos.run_rewards drop constraint if exists run_rewards_reward_category_check;
alter table pos.run_rewards add constraint run_rewards_reward_category_check
  check (reward_category in ('coffee','breakfast','merchandise','wallet'));
alter table pos.run_tiers drop constraint if exists run_tiers_reward_category_check;
alter table pos.run_tiers add constraint run_tiers_reward_category_check
  check (reward_category is null or reward_category in ('coffee','breakfast','merchandise','wallet'));

create table if not exists pos.run_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_source_id text not null references pos.customers(source_id) on delete cascade,
  campaign_id uuid not null references pos.run_campaigns(id) on delete restrict,
  activity_type text not null default 'running' check (activity_type in ('running','walking')),
  status text not null default 'active' check (status in ('active','accepted','review','rejected','abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  points jsonb not null default '[]',
  stats jsonb not null default '{}',
  flags jsonb not null default '[]',
  activity_id uuid references pos.run_activities(id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists run_sessions_customer_idx on pos.run_sessions(customer_source_id, started_at desc);
create unique index if not exists run_sessions_one_active_uq on pos.run_sessions(customer_source_id) where status = 'active';

create table if not exists pos.run_teams (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references pos.run_campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  created_by text not null references pos.customers(source_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, name)
);
create table if not exists pos.run_team_members (
  team_id uuid not null references pos.run_teams(id) on delete cascade,
  campaign_id uuid not null references pos.run_campaigns(id) on delete cascade,
  customer_source_id text not null references pos.customers(source_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, customer_source_id),
  unique (campaign_id, customer_source_id)
);

alter table pos.run_sessions enable row level security;
alter table pos.run_teams enable row level security;
alter table pos.run_team_members enable row level security;
drop policy if exists run_read_sessions on pos.run_sessions;
create policy run_read_sessions on pos.run_sessions for select to authenticated
  using (customer_source_id = coalesce(auth.uid()::text,'') or auth.role() = 'service_role');
drop policy if exists run_read_teams on pos.run_teams;
create policy run_read_teams on pos.run_teams for select to authenticated using (true);
drop policy if exists run_read_team_members on pos.run_team_members;
create policy run_read_team_members on pos.run_team_members for select to authenticated using (true);
grant select on pos.run_sessions, pos.run_teams, pos.run_team_members to authenticated;

-- Wallet reward: credited once per (customer, campaign, tier); amount comes from tier config only.
create or replace function pos.run_grant_wallet_rewards(p_customer_source_id text, p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = pos, public as $$
declare t record; v_amount bigint; v_reward_id uuid; v_wallet pos.customer_wallets; v_balance bigint;
        v_key text; v_granted jsonb := '[]'::jsonb;
begin
  for t in
    select tr.* from pos.run_progress p join pos.run_tiers tr on tr.id = p.tier_id
    where p.customer_source_id = p_customer_source_id and p.campaign_id = p_campaign_id
      and p.status in ('completed','upgraded') and tr.is_active
      and tr.reward_config->>'type' = 'wallet'
  loop
    v_amount := case when coalesce(t.reward_config->>'amount','') ~ '^[0-9]+$' then (t.reward_config->>'amount')::bigint end;
    if v_amount is null or v_amount <= 0 then
      insert into pos.run_audit_logs(actor_type,entity_type,entity_id,action,reason)
      values ('system','run_tier',t.id::text,'wallet_reward_not_granted','reward_config.amount wajib > 0');
      continue;
    end if;
    insert into pos.run_rewards(customer_source_id,campaign_id,tier_id,reward_category,status,max_amount,remaining_amount,claimed_at,metadata)
    values (p_customer_source_id,p_campaign_id,t.id,'wallet','unlocked',v_amount,0,now(),jsonb_build_object('grant_source','wallet_tier'))
    on conflict (customer_source_id,campaign_id,tier_id) do nothing
    returning id into v_reward_id;
    if v_reward_id is null then continue; end if;   -- already granted
    v_key := 'run-reward:' || v_reward_id::text;
    perform pos.wallet_ensure(p_customer_source_id);
    select * into v_wallet from pos.customer_wallets where customer_id = p_customer_source_id for update;
    if v_wallet.status <> 'active' then
      update pos.run_rewards set metadata = metadata || jsonb_build_object('blocked','wallet_inactive') where id = v_reward_id;
      continue;
    end if;
    v_balance := v_wallet.available_balance + v_amount;
    update pos.customer_wallets set available_balance = v_balance, total_credited = total_credited + v_amount, updated_at = now()
      where customer_id = p_customer_source_id;
    insert into pos.customer_wallet_ledger(customer_id,amount,direction,balance_after,status,transaction_type,reference_type,reference_id,idempotency_key,note,created_by)
    values (p_customer_source_id,v_amount,'credit',v_balance,'completed','manual_credit','djiwa_run_reward',v_reward_id::text,v_key,'Reward Djiwa Run: '||t.name,'djiwa-run');
    update pos.run_rewards set status='credited', wallet_ledger_id=v_key, updated_at=now() where id = v_reward_id;
    v_granted := v_granted || jsonb_build_array(jsonb_build_object('reward_id',v_reward_id,'amount',v_amount,'tier',t.code));
  end loop;
  return jsonb_build_object('ok',true,'credited',v_granted);
end $$;
grant execute on function pos.run_grant_wallet_rewards(text,uuid) to service_role;

-- Streak: consecutive Asia/Jakarta days with >=1 accepted activity, ending today or yesterday.
create or replace function pos.run_streak(p_customer_source_id text)
returns integer language sql stable security definer set search_path = pos, public as $$
  with d as (select distinct activity_date from pos.run_activities where customer_source_id = p_customer_source_id and status = 'accepted'),
  today as (select (now() at time zone 'Asia/Jakarta')::date as t),
  s as (select activity_date, activity_date - (row_number() over (order by activity_date))::int as grp from d)
  select coalesce((select count(*)::int from s where grp = (select grp from s order by activity_date desc limit 1)
    and (select max(activity_date) from d) >= (select t from today) - 1), 0)
$$;
grant execute on function pos.run_streak(text) to service_role;

-- Leaderboard: first name only, accepted activity inside the campaign period.
create or replace function pos.run_leaderboard(p_campaign_id uuid, p_scope text, p_limit int default 20)
returns table(rank bigint, customer_source_id text, display_name text, distance_km numeric)
language sql stable security definer set search_path = pos, public as $$
  with c as (select starts_at::date s, ends_at::date e from pos.run_campaigns where id = p_campaign_id),
  win as (select case when p_scope = 'week' then greatest((select s from c), date_trunc('week', now() at time zone 'Asia/Jakarta')::date) else (select s from c) end as from_d),
  agg as (
    select a.customer_source_id, sum(a.distance_km) as km from pos.run_activities a
    where a.campaign_id = p_campaign_id and a.status = 'accepted'
      and a.activity_date >= (select from_d from win) and a.activity_date <= (select e from c)
    group by a.customer_source_id)
  select rank() over (order by agg.km desc), agg.customer_source_id,
         coalesce(nullif(split_part(trim(cu.name), ' ', 1), ''), 'Pelari'), round(agg.km, 2)
  from agg left join pos.customers cu on cu.source_id = agg.customer_source_id
  order by agg.km desc limit least(greatest(p_limit,1),100)
$$;
grant execute on function pos.run_leaderboard(uuid,text,int) to service_role;

create or replace function pos.run_team_leaderboard(p_campaign_id uuid, p_limit int default 20)
returns table(rank bigint, team_id uuid, team_name text, members bigint, distance_km numeric)
language sql stable security definer set search_path = pos, public as $$
  select rank() over (order by coalesce(sum(a.distance_km),0) desc), t.id, t.name, count(distinct m.customer_source_id), round(coalesce(sum(a.distance_km),0),2)
  from pos.run_teams t join pos.run_team_members m on m.team_id = t.id
  left join pos.run_activities a on a.customer_source_id = m.customer_source_id and a.campaign_id = t.campaign_id and a.status = 'accepted'
  where t.campaign_id = p_campaign_id group by t.id, t.name
  order by 5 desc limit least(greatest(p_limit,1),100)
$$;
grant execute on function pos.run_team_leaderboard(uuid,int) to service_role;
