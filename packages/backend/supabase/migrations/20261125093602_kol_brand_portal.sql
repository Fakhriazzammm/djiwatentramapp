-- Fixed rewards for self-service Brand campaigns. Existing view-based rewards remain separate.
create table pos.kol_brand_memberships (
  business_id bigint primary key references pos.kol_businesses(id),
  user_id text not null references public."user"(id),
  contact_email text not null,
  contact_phone text not null,
  status text not null default 'pending' check (status in ('pending','active','rejected')),
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index kol_brand_memberships_user on pos.kol_brand_memberships(user_id);
create unique index kol_brand_memberships_one_pending on pos.kol_brand_memberships(user_id) where status = 'pending';

create table pos.kol_brand_campaigns (
  campaign_id bigint primary key references pos.kol_campaigns(id),
  quota integer not null check (quota between 1 and 100),
  reward_per_kol bigint not null check (reward_per_kol between 1000 and 100000000),
  tasks jsonb not null check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) between 1 and 10)
);

create table pos.kol_brand_deliveries (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references pos.kol_campaign_assignments(id),
  application_id bigint not null references pos.kol_campaign_applications(id),
  recipient_user_id text not null,
  task_number integer not null check (task_number between 1 and 10),
  label text not null,
  platform text not null,
  amount bigint not null check (amount > 0),
  requires_screenshot boolean not null default false,
  status text not null default 'awaiting' check (status in ('awaiting','submitted','needs_revision','paid','rejected','expired')),
  post_key text,
  note text,
  dispute_note text,
  dispute_resolution text,
  updated_at timestamptz not null default now(),
  unique (assignment_id, task_number)
);
create index kol_brand_deliveries_application on pos.kol_brand_deliveries(application_id);
-- A post once paid cannot be used for another reward, including in a different Brand campaign.
create unique index kol_brand_deliveries_post on pos.kol_brand_deliveries(post_key)
  where post_key is not null and status in ('submitted','needs_revision','paid');

alter table pos.kol_content_submissions add column brand_delivery_id bigint references pos.kol_brand_deliveries(id);
create unique index kol_brand_proof_delivery on pos.kol_content_submissions(brand_delivery_id) where brand_delivery_id is not null;

create table pos.kol_brand_topups (
  deposit_id text primary key references pos.kol_budget_deposits(id),
  state text not null default 'creating' check (state in ('creating','pending','paid','expired','review','void')),
  provider_transaction_id text unique,
  provider_expires_at timestamptz,
  last_checked_at timestamptz,
  issue text,
  created_at timestamptz not null default now()
);
create index kol_brand_topups_reconcile on pos.kol_brand_topups(state, last_checked_at nulls first);

create table pos.kol_brand_refunds (
  id bigint generated always as identity primary key,
  deposit_id text not null references pos.kol_brand_topups(deposit_id),
  amount bigint not null check (amount > 0),
  external_reference text not null unique,
  recorded_by text not null,
  created_at timestamptz not null default now()
);

create table pos.kol_brand_events (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references pos.kol_brand_campaigns(campaign_id),
  entity_id text not null,
  action text not null,
  actor text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index kol_brand_events_campaign on pos.kol_brand_events(campaign_id, id desc);

alter table pos.kol_brand_memberships enable row level security;
alter table pos.kol_brand_campaigns enable row level security;
alter table pos.kol_brand_deliveries enable row level security;
alter table pos.kol_brand_topups enable row level security;
alter table pos.kol_brand_refunds enable row level security;
alter table pos.kol_brand_events enable row level security;
revoke all on pos.kol_brand_memberships, pos.kol_brand_campaigns, pos.kol_brand_deliveries,
  pos.kol_brand_topups, pos.kol_brand_refunds, pos.kol_brand_events from public, anon, authenticated;

-- Protect fixed campaigns from legacy Admin/Manager endpoints and their per-view finance operations.
-- Normal application (pending) still uses the existing campaign application function.
create function pos.kol_brand_protect() returns trigger
language plpgsql security definer set search_path = pos, pg_catalog as $$
declare campaign bigint; business bigint; campaign_fixed boolean;
begin
  if current_setting('djiwa.kol_brand_write', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'kol_campaigns' then
    if tg_op <> 'INSERT' then campaign := old.id; end if;
    if tg_op <> 'DELETE' then business := new.business_id; end if;
  elsif tg_table_name = 'kol_businesses' then
    business := old.id;
  elsif tg_table_name = 'kol_content_submissions' then
    select a.campaign_id into campaign from pos.kol_campaign_assignments a
     where a.id = case when tg_op = 'DELETE' then old.campaign_assignment_id else new.campaign_assignment_id end;
  else
    campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  end if;

  campaign_fixed := exists (select 1 from pos.kol_brand_campaigns bc where bc.campaign_id = campaign);
  if tg_table_name = 'kol_campaign_applications' and campaign_fixed and tg_op = 'INSERT' and new.status = 'pending' then
    if coalesce((pos.kol_brand_public(campaign)->>'slotsLeft')::integer, 0) < 1 then
      raise exception using errcode = 'P0001', message = 'BRAND_NO_FUNDED_SLOT';
    end if;
    return new;
  end if;
  if campaign_fixed or exists (select 1 from pos.kol_brand_memberships m where m.business_id = business) then
    raise exception using errcode = 'P0001', message = 'BRAND_WORKFLOW_REQUIRED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_kol_brand_campaign before insert or update or delete on pos.kol_campaigns
  for each row execute function pos.kol_brand_protect();
create trigger trg_kol_brand_business before update or delete on pos.kol_businesses
  for each row execute function pos.kol_brand_protect();
create trigger trg_kol_brand_application before insert or update or delete on pos.kol_campaign_applications
  for each row execute function pos.kol_brand_protect();
create trigger trg_kol_brand_assignment before insert or update or delete on pos.kol_campaign_assignments
  for each row execute function pos.kol_brand_protect();
create trigger trg_kol_brand_proof before insert or update or delete on pos.kol_content_submissions
  for each row execute function pos.kol_brand_protect();
create trigger trg_kol_brand_deposit before insert or update or delete on pos.kol_budget_deposits
  for each row execute function pos.kol_brand_protect();

create function pos.kol_brand_public(p_campaign bigint) returns jsonb
language sql stable set search_path = pos, pg_catalog as $$
  select jsonb_build_object(
    'brand', b.name, 'tasks', bc.tasks, 'total', bc.reward_per_kol, 'quota', bc.quota,
    'slotsLeft', greatest(0, least(bc.quota - accepted.total, budget.available / bc.reward_per_kol)))
  from pos.kol_brand_campaigns bc
  join pos.kol_campaigns c on c.id = bc.campaign_id
  join pos.kol_businesses b on b.id = c.business_id
  cross join lateral pos.kol_budget_totals(c.id) budget
  cross join lateral (
    select count(*) as total from pos.kol_campaign_applications a where a.campaign_id = c.id and a.status = 'approved'
  ) accepted
  where bc.campaign_id = p_campaign;
$$;

create function pos.kol_brand_actor_allowed(p_business bigint, p_actor text) returns boolean
language sql stable set search_path = pos, pg_catalog as $$
  -- Staff actors are serialized by the trusted auth-server after requireOwner. This RPC is private.
  select coalesce(p_actor like 'admin:yumi:%', false) or exists (
    select 1 from pos.kol_brand_memberships m join pos.kol_businesses b on b.id = m.business_id
    where m.business_id = p_business and p_actor = 'brand:' || m.user_id and m.status = 'active' and b.status = 'active'
  );
$$;

create function pos.kol_brand_review_application(p_campaign bigint, p_application bigint, p_approve boolean, p_actor text, p_note text)
returns jsonb language plpgsql set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; cfg pos.kol_brand_campaigns%rowtype; ap pos.kol_campaign_applications%rowtype;
  assignment bigint; recipient text; funds bigint; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into cp from pos.kol_campaigns where id = p_campaign for update;
  select * into cfg from pos.kol_brand_campaigns where campaign_id = p_campaign;
  if cfg.campaign_id is null or not pos.kol_brand_actor_allowed(cp.business_id, p_actor) then
    raise exception using errcode = 'P0001', message = 'BRAND_NOT_FOUND';
  end if;
  select * into ap from pos.kol_campaign_applications where id = p_application and campaign_id = p_campaign for update;
  if not found then raise exception using errcode = 'P0001', message = 'APPLICATION_NOT_FOUND'; end if;
  if ap.status = (case when p_approve then 'approved' else 'rejected' end) then
    return jsonb_build_object('status', ap.status);
  end if;
  if ap.status <> 'pending' then raise exception using errcode = 'P0001', message = 'APPLICATION_NOT_PENDING'; end if;

  if p_approve then
    if cp.status <> 'published' or cp.end_date < today then
      raise exception using errcode = 'P0001', message = 'CAMPAIGN_NOT_OPEN';
    end if;
    select k.auth_user_id into recipient from pos.kol_creators k
      where k.source_id = ap.kol_id and k.status <> 'Rejected' for share;
    if recipient is null or exists (select 1 from pos.kol_brand_memberships m
      where m.user_id = recipient and m.business_id = cp.business_id) then
      raise exception using errcode = 'P0001', message = 'CREATOR_NOT_ELIGIBLE';
    end if;
    select available into funds from pos.kol_budget_totals(p_campaign);
    if funds < cfg.reward_per_kol or (select count(*) from pos.kol_campaign_applications a
      where a.campaign_id = p_campaign and a.status = 'approved') >= cfg.quota then
      raise exception using errcode = 'P0001', message = 'BRAND_NO_FUNDED_SLOT';
    end if;
  end if;

  perform set_config('djiwa.kol_brand_write', 'on', true);
  ap := pos.kol_review_campaign_application(p_application, p_approve, p_actor, p_note);
  if p_approve then
    select id into strict assignment from pos.kol_campaign_assignments where campaign_id = p_campaign and kol_id = ap.kol_id;
    insert into pos.kol_brand_deliveries(assignment_id, application_id, recipient_user_id, task_number, label, platform, amount, requires_screenshot)
    select assignment, ap.id, recipient, ord, task->>'label', task->>'platform', (task->>'amount')::bigint,
      coalesce((task->>'requiresScreenshot')::boolean, false)
    from jsonb_array_elements(cfg.tasks) with ordinality as t(task, ord);
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, actor, idempotency_key)
    values (p_campaign, 'reserve', -cfg.reward_per_kol, cfg.reward_per_kol, 'application', ap.id::text, p_actor, 'brand:reserve:' || ap.id);
  end if;
  insert into pos.kol_brand_events(campaign_id, entity_id, action, actor, detail)
  values (p_campaign, ap.id::text, 'application_' || ap.status, p_actor, jsonb_build_object('note', p_note));
  insert into pos.kol_notifications(kol_id,type,title,body,entity_type,entity_id,dedupe_key)
  values (ap.kol_id, 'brand_application', case when p_approve then 'Pendaftaran kampanye diterima' else 'Pendaftaran kampanye ditolak' end,
    cp.title, 'campaign', cp.id::text, 'brand:application:' || ap.id || ':' || ap.status);
  return jsonb_build_object('status', ap.status);
end $$;

create function pos.kol_brand_submit(p_delivery bigint, p_kol text, p_user text, p_post text, p_key text, p_screenshot text)
returns jsonb language plpgsql set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; d pos.kol_brand_deliveries%rowtype;
  a pos.kol_campaign_assignments%rowtype; receipt bigint;
begin
  select aa.* into a from pos.kol_brand_deliveries dd
    join pos.kol_campaign_assignments aa on aa.id = dd.assignment_id
    join pos.kol_creators k on k.source_id = aa.kol_id
    where dd.id = p_delivery and aa.kol_id = p_kol and k.auth_user_id = p_user and k.status <> 'Rejected';
  if not found then raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_FOUND'; end if;
  select * into cp from pos.kol_campaigns where id = a.campaign_id for update;
  select * into d from pos.kol_brand_deliveries where id = p_delivery for update;
  if d.recipient_user_id is distinct from p_user then
    raise exception using errcode = 'P0001', message = 'CREATOR_NOT_ELIGIBLE';
  end if;
  if d.status = 'submitted' and d.post_key = p_key then
    return jsonb_build_object('status', d.status);
  end if;
  if cp.status not in ('published','closed') or cp.end_date < (now() at time zone 'Asia/Jakarta')::date
    or d.status not in ('awaiting','needs_revision') then
    raise exception using errcode = 'P0001', message = 'DELIVERY_CLOSED';
  end if;
  if d.requires_screenshot and p_screenshot is null then
    raise exception using errcode = 'P0001', message = 'SCREENSHOT_REQUIRED';
  end if;
  if p_key is null or split_part(p_key, ':', 1) <> lower(d.platform) then
    raise exception using errcode = 'P0001', message = 'INVALID_BRAND_POST';
  end if;
  perform set_config('djiwa.kol_brand_write', 'on', true);
  update pos.kol_brand_deliveries set status = 'submitted', post_key = p_key, note = null, updated_at = now() where id = d.id;
  insert into pos.kol_content_submissions(campaign_assignment_id, deliverable_type, content_url, insight_screenshot_url, brand_delivery_id)
  values (a.id, d.label, p_post, p_screenshot, d.id)
  on conflict (brand_delivery_id) where brand_delivery_id is not null do update
    set content_url = excluded.content_url, insight_screenshot_url = excluded.insight_screenshot_url, status = 'submitted',
      review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now()
  returning id into receipt;
  update pos.kol_campaign_assignments set status = 'active', updated_at = now() where id = a.id and status = 'accepted';
  insert into pos.kol_brand_events(campaign_id, entity_id, action, actor, detail)
  values (cp.id, d.id::text, 'report_submitted', 'kol:' || p_user, jsonb_build_object('proofId', receipt, 'post', p_post));
  return jsonb_build_object('status', 'submitted', 'proofId', receipt);
end $$;

create function pos.kol_brand_review_delivery(p_campaign bigint, p_delivery bigint, p_action text, p_actor text, p_note text, p_revision timestamptz)
returns jsonb language plpgsql set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; d pos.kol_brand_deliveries%rowtype;
  a pos.kol_campaign_assignments%rowtype; s pos.kol_content_submissions%rowtype;
  wallet pos.customer_wallets%rowtype; cid text; payout bigint; new_status text; ledger_key text; disputed boolean;
begin
  select * into cp from pos.kol_campaigns where id = p_campaign for update;
  if not exists (select 1 from pos.kol_brand_campaigns where campaign_id = p_campaign)
      or not pos.kol_brand_actor_allowed(cp.business_id, p_actor) then
    raise exception using errcode = 'P0001', message = 'BRAND_NOT_FOUND';
  end if;
  select dd.* into d from pos.kol_brand_deliveries dd join pos.kol_campaign_assignments aa on aa.id = dd.assignment_id
   where dd.id = p_delivery and aa.campaign_id = p_campaign for update of dd;
  if not found then raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_FOUND'; end if;
  select * into a from pos.kol_campaign_assignments where id = d.assignment_id;
  select * into s from pos.kol_content_submissions where brand_delivery_id = d.id;
  new_status := case p_action when 'approve' then 'paid' when 'revision' then 'needs_revision'
    when 'reject' then 'rejected' when 'expire' then 'expired' end;
  if new_status is null then raise exception using errcode = 'P0001', message = 'INVALID_REVIEW_ACTION'; end if;
  if d.status = new_status then return jsonb_build_object('status', new_status); end if;
  disputed := d.dispute_note is not null and d.dispute_resolution is null;
  if disputed and p_actor not like 'admin:yumi:%' then
    raise exception using errcode = 'P0001', message = 'REPORT_WITH_ADMIN';
  end if;
  if (p_action <> 'approve' or disputed) and nullif(btrim(p_note), '') is null then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOTE_REQUIRED';
  end if;
  if p_action = 'expire' then
    if d.status not in ('awaiting','needs_revision') or cp.end_date >= (now() at time zone 'Asia/Jakarta')::date then
      raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_EXPIRED';
    end if;
  elsif (d.status <> 'submitted' and not (disputed and d.status = 'needs_revision' and p_action in ('approve','reject')))
     or s.id is null then
    raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_IN_REVIEW';
  elsif s.updated_at is distinct from p_revision then
    raise exception using errcode = 'P0001', message = 'DELIVERY_CHANGED';
  end if;
  if p_action = 'revision' and cp.end_date < (now() at time zone 'Asia/Jakarta')::date then
    raise exception using errcode = 'P0001', message = 'DELIVERY_CLOSED';
  end if;

  perform set_config('djiwa.kol_brand_write', 'on', true);
  if new_status in ('paid','rejected','expired') and coalesce((
    select sum(reserved_delta) from pos.kol_budget_ledger where campaign_id = p_campaign
      and ref_type = 'application' and ref_id = d.application_id::text
  ), 0) < d.amount then
    raise exception using errcode = 'P0001', message = 'RESERVE_INSUFFICIENT';
  end if;

  if p_action = 'approve' then
    select auth_user_id into cid from pos.kol_creators where source_id = a.kol_id and status <> 'Rejected' for share;
    if cid is distinct from d.recipient_user_id or exists (select 1 from pos.kol_brand_memberships where business_id = cp.business_id and user_id = cid) then
      raise exception using errcode = 'P0001', message = 'CREATOR_NOT_ELIGIBLE';
    end if;
    insert into pos.customers(source_id, name, is_active)
      select cid, k.name, true from pos.kol_creators k where k.source_id = a.kol_id on conflict (source_id) do nothing;
    perform pos.wallet_ensure(cid);
    select * into wallet from pos.customer_wallets where customer_id = cid for update;
    if wallet.status is distinct from 'active' then raise exception using errcode = 'P0001', message = 'WALLET_BLOCKED'; end if;

    insert into pos.kol_reward_payouts(submission_id, application_id, campaign_id, kol_id, views, rate_per_1000,
      computed_amount, amount, created_by, note)
    values (s.id, d.application_id, p_campaign, a.kol_id, 0, 0, d.amount, d.amount, p_actor, p_note)
    returning id into payout;
    ledger_key := 'kol-reward:' || payout;
    insert into pos.kol_budget_ledger(campaign_id, kind, reserved_delta, paid_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (p_campaign, 'payout', -d.amount, d.amount, 'application', d.application_id::text, d.label, p_actor, 'brand:payout:' || d.id);
    update pos.customer_wallets set available_balance = available_balance + d.amount, total_credited = total_credited + d.amount, updated_at = now()
      where customer_id = cid;
    insert into pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type,
      reference_type, reference_id, idempotency_key, note, created_by)
    values (cid, d.amount, 'credit', wallet.available_balance + d.amount, 'completed', 'manual_credit',
      'kol_reward', payout::text, ledger_key, 'Reward KOL: ' || cp.title || ' · ' || d.label, p_actor);
    update pos.kol_reward_payouts set wallet_ledger_key = ledger_key where id = payout;
  elsif new_status in ('rejected','expired') then
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (p_campaign, 'release', d.amount, -d.amount, 'application', d.application_id::text, p_note, p_actor, 'brand:release:' || d.id);
  end if;

  update pos.kol_brand_deliveries set status = new_status, note = p_note, updated_at = now(),
    dispute_resolution = case when disputed then p_note else dispute_resolution end where id = d.id;
  if s.id is not null then
    update pos.kol_content_submissions set
      status = case new_status when 'paid' then 'approved' when 'expired' then 'rejected' else new_status end,
      review_note = p_note, reviewed_by = p_actor, reviewed_at = now(), updated_at = now()
    where id = s.id;
  end if;
  if not exists (select 1 from pos.kol_brand_deliveries where assignment_id = a.id and status in ('awaiting','submitted','needs_revision')) then
    update pos.kol_campaign_assignments set status = 'completed', completed_at = now(), updated_at = now() where id = a.id;
  end if;

  insert into pos.kol_brand_events(campaign_id, entity_id, action, actor, detail)
  values (p_campaign, d.id::text, 'report_' || new_status, p_actor, jsonb_build_object('note', p_note, 'payoutId', payout));
  insert into pos.kol_notifications(kol_id,type,title,body,entity_type,entity_id,dedupe_key)
  values (a.kol_id, case when payout is not null then 'reward_paid' else 'brand_report' end,
    case new_status when 'paid' then 'Reward masuk ke Djiwa Pay' when 'needs_revision' then 'Laporan perlu revisi'
      when 'expired' then 'Tenggat laporan berakhir' else 'Laporan ditolak' end,
    cp.title || ' · ' || d.label, case when payout is not null then 'reward_payout' else 'campaign' end,
    coalesce(payout, cp.id)::text, 'brand:report:' || d.id || ':' || new_status || ':' || coalesce(s.updated_at::text, ''));
  return jsonb_build_object('status', new_status, 'payoutId', payout);
end $$;

-- Keep the reserve intact during an escalated review. Staff decide using the same payout transaction.
create function pos.kol_brand_report_dispute(p_delivery bigint, p_kol text, p_user text, p_note text)
returns void language plpgsql set search_path = pos, pg_catalog as $$
declare campaign bigint; d pos.kol_brand_deliveries%rowtype;
begin
  select a.campaign_id into campaign from pos.kol_brand_deliveries delivery
    join pos.kol_campaign_assignments a on a.id = delivery.assignment_id
    where delivery.id = p_delivery and delivery.recipient_user_id = p_user and a.kol_id = p_kol;
  if not found then raise exception using errcode = 'P0001', message = 'DELIVERY_NOT_FOUND'; end if;
  perform 1 from pos.kol_campaigns where id = campaign for update;
  select * into d from pos.kol_brand_deliveries where id = p_delivery for update;
  if d.dispute_note is not null and d.dispute_resolution is null then return; end if;
  if d.status not in ('submitted','needs_revision') or d.dispute_note is not null
     or nullif(btrim(p_note),'') is null then
    raise exception using errcode = 'P0001', message = 'DISPUTE_UNAVAILABLE';
  end if;
  update pos.kol_brand_deliveries set dispute_note = p_note where id = d.id;
  insert into pos.kol_brand_events(campaign_id,entity_id,action,actor,detail)
  values (campaign,d.id::text,'review_escalated','kol:' || p_user,jsonb_build_object('note',p_note));
end $$;

-- Webhook data is a lookup hint. Only this stored invoice can be reconciled with Mayar.
create function pos.kol_brand_topup_target(p_invoice text) returns table(deposit_id text, invoice_id text, total bigint)
language sql stable security definer set search_path = pos, pg_catalog as $$
  select d.id, d.invoice_id, d.total from pos.kol_budget_deposits d join pos.kol_brand_topups t on t.deposit_id = d.id
  where d.invoice_id = p_invoice;
$$;

create function pos.kol_brand_topups_due(p_limit integer default 5)
returns table(deposit_id text, invoice_id text, total bigint)
language sql security definer set search_path = pos, pg_catalog as $$
  with due as (
    select t.deposit_id, d.invoice_id, d.total from pos.kol_brand_topups t
    join pos.kol_budget_deposits d on d.id = t.deposit_id
    where (t.state = 'pending' or (t.state = 'expired' and t.provider_expires_at > now() - interval '7 days'))
      and d.invoice_id is not null and (t.last_checked_at is null or t.last_checked_at < now() - interval '2 minutes')
    order by t.last_checked_at nulls first, t.created_at limit least(10, greatest(1, p_limit)) for update of t skip locked
  ), marked as (
    update pos.kol_brand_topups t set last_checked_at = now() from due where t.deposit_id = due.deposit_id returning t.deposit_id
  )
  select due.deposit_id, due.invoice_id, due.total from due join marked using (deposit_id);
$$;

create function pos.kol_brand_payment_result(p_deposit text, p_invoice text, p_total bigint, p_result text,
  p_transaction text, p_issue text)
returns jsonb language plpgsql security definer set search_path = pos, pg_catalog as $$
declare d pos.kol_budget_deposits%rowtype; t pos.kol_brand_topups%rowtype; cp pos.kol_campaigns%rowtype;
begin
  select * into d from pos.kol_budget_deposits where id = p_deposit;
  select * into cp from pos.kol_campaigns where id = d.campaign_id for update;
  select * into d from pos.kol_budget_deposits where id = p_deposit for update;
  select * into t from pos.kol_brand_topups where deposit_id = d.id for update;
  if not found or d.invoice_id is distinct from p_invoice or d.total is distinct from p_total or d.method <> 'mayar' then
    raise exception using errcode = 'P0001', message = 'BRAND_INVOICE_NOT_FOUND';
  end if;
  if t.state = 'paid' then return jsonb_build_object('status', 'paid'); end if;
  perform set_config('djiwa.kol_brand_write', 'on', true);

  if p_result = 'paid' and nullif(p_transaction,'') is not null then
    begin
      update pos.kol_brand_topups set state = 'paid', provider_transaction_id = p_transaction,
        issue = case when cp.status in ('closed','archived') then 'PAID_AFTER_CLOSE' end,
        last_checked_at = now()
        where deposit_id = t.deposit_id;
    exception when unique_violation then
      update pos.kol_brand_topups set state = 'review', issue = 'TRANSACTION_ALREADY_USED', last_checked_at = now() where deposit_id = t.deposit_id;
      return jsonb_build_object('status', 'review');
    end;
    -- An expired or previously voided checkout can still receive delayed provider confirmation.
    -- Settle it once, keeping any closed campaign balance available for Finance to refund.
    if d.status in ('expired','cancelled') then update pos.kol_budget_deposits set status = 'pending' where id = d.id; end if;
    perform pos.kol_budget_deposit_settle(d.id, 'mayar:' || p_transaction);
    insert into pos.kol_brand_events(campaign_id,entity_id,action,actor,detail)
    values (cp.id, d.id, 'deposit_paid', 'mayar', jsonb_build_object('transactionId',p_transaction,'amount',d.nominal));
  elsif p_result = 'expired' and t.state = 'pending' then
    update pos.kol_budget_deposits set status = 'expired' where id = d.id and status = 'pending';
    update pos.kol_brand_topups set state = 'expired', issue = null, last_checked_at = now() where deposit_id = t.deposit_id;
  elsif p_result = 'review' then
    update pos.kol_brand_topups set state = 'review', issue = p_issue, last_checked_at = now() where deposit_id = t.deposit_id;
  elsif p_result = 'pending' then
    update pos.kol_brand_topups set last_checked_at = now() where deposit_id = t.deposit_id;
  end if;
  return (select jsonb_build_object('status', state) from pos.kol_brand_topups where deposit_id = t.deposit_id);
end $$;

create function pos.kol_brand_record_refund(p_campaign bigint, p_deposit text, p_amount bigint, p_reference text, p_actor text)
returns bigint language plpgsql set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; d pos.kol_budget_deposits%rowtype; funds record; ref bigint; previous pos.kol_brand_refunds%rowtype;
begin
  if p_actor not like 'admin:yumi:%' then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  select * into cp from pos.kol_campaigns where id = p_campaign for update;
  select bd.* into d from pos.kol_budget_deposits bd join pos.kol_brand_topups bt on bt.deposit_id = bd.id
    where bd.id = p_deposit and bd.campaign_id = p_campaign and bd.status = 'paid' and bt.state = 'paid';
  if not found or cp.status <> 'closed' then raise exception using errcode = 'P0001', message = 'REFUND_NOT_AVAILABLE'; end if;
  select * into previous from pos.kol_brand_refunds where external_reference = p_reference;
  if found then
    if previous.deposit_id = p_deposit and previous.amount = p_amount then return previous.id; end if;
    raise exception using errcode = 'P0001', message = 'REFUND_REFERENCE_USED';
  end if;
  select * into funds from pos.kol_budget_totals(cp.id);
  if funds.reserved <> 0 or exists (
    select 1 from pos.kol_brand_topups t join pos.kol_budget_deposits dep on dep.id = t.deposit_id
    where dep.campaign_id = cp.id and t.state in ('creating','pending','review')
  ) then raise exception using errcode = 'P0001', message = 'CAMPAIGN_OBLIGATIONS_OPEN'; end if;
  if p_amount <= 0 or p_amount > funds.available or nullif(btrim(p_reference), '') is null or p_amount >
    d.nominal - coalesce((select sum(amount) from pos.kol_brand_refunds where deposit_id = p_deposit), 0) then
    raise exception using errcode = 'P0001', message = 'REFUND_AMOUNT_INVALID';
  end if;
  insert into pos.kol_brand_refunds(deposit_id, amount, external_reference, recorded_by)
  values (d.id, p_amount, p_reference, p_actor) returning id into ref;
  insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, refunded_delta, ref_type, ref_id, note, actor, idempotency_key)
  values (cp.id, 'refund', -p_amount, p_amount, 'brand_refund', ref::text, 'Refund ke sumber pembayaran', p_actor, 'brand:refund:' || ref);
  insert into pos.kol_brand_events(campaign_id,entity_id,action,actor,detail)
  values (cp.id, ref::text, 'refund_recorded', p_actor, jsonb_build_object('depositId', d.id, 'amount', p_amount, 'reference', p_reference));
  return ref;
end $$;

revoke all on function pos.kol_brand_protect(), pos.kol_brand_public(bigint), pos.kol_brand_actor_allowed(bigint,text),
  pos.kol_brand_review_application(bigint,bigint,boolean,text,text),
  pos.kol_brand_submit(bigint,text,text,text,text,text), pos.kol_brand_review_delivery(bigint,bigint,text,text,text,timestamptz),
  pos.kol_brand_report_dispute(bigint,text,text,text), pos.kol_brand_topup_target(text), pos.kol_brand_topups_due(integer),
  pos.kol_brand_payment_result(text,text,bigint,text,text,text), pos.kol_brand_record_refund(bigint,text,bigint,text,text)
  from public, anon, authenticated;
grant execute on function pos.kol_brand_topup_target(text), pos.kol_brand_topups_due(integer),
  pos.kol_brand_payment_result(text,text,bigint,text,text,text) to service_role;
notify pgrst, 'reload schema';
