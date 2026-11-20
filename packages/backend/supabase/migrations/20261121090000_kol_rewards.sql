-- Reward KOL berbasis view: anggaran Bisnis (escrow) -> saldo Djiwa Pay KOL.
-- Seluruh pergerakan uang lewat fungsi SQL berkunci idempoten. Ledger anggaran hanya bertambah.
-- Saldo reward adalah saldo Djiwa Pay biasa (pos.customer_wallets), tanpa sub-saldo terpisah.

create table if not exists pos.kol_businesses (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  owner_customer_id text references pos.customers(source_id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);
insert into pos.kol_businesses(name)
select 'Djiwa Tentram' where not exists (select 1 from pos.kol_businesses);

alter table pos.kol_campaigns
  add column if not exists business_id bigint references pos.kol_businesses(id),
  add column if not exists rewards_enabled boolean not null default false,
  add column if not exists reward_per_1000 integer,
  add column if not exists reward_min_views integer not null default 0,
  add column if not exists reward_max_per_content integer,
  add column if not exists reward_max_per_kol integer,
  add column if not exists reward_settle_days integer not null default 7,
  add column if not exists reward_platforms text[] not null default array['TikTok']::text[];

alter table pos.kol_campaigns drop constraint if exists kol_campaigns_reward_rules_check;
alter table pos.kol_campaigns add constraint kol_campaigns_reward_rules_check check (
  reward_min_views >= 0 and reward_settle_days between 1 and 60
  and (reward_per_1000 is null or reward_per_1000 > 0)
  and (reward_max_per_content is null or reward_max_per_content > 0)
  and (reward_max_per_kol is null or reward_max_per_kol > 0)
  and (not rewards_enabled or (reward_per_1000 is not null and reward_max_per_kol is not null and business_id is not null
       and cardinality(reward_platforms) > 0))
);

alter table pos.kol_campaign_applications add column if not exists reward_rules_snapshot jsonb;

alter table pos.kol_content_submissions
  add column if not exists video_id text,
  add column if not exists posted_at timestamptz,
  add column if not exists settle_due_at timestamptz;
create unique index if not exists idx_kol_submissions_video_id
  on pos.kol_content_submissions(video_id) where video_id is not null and status <> 'rejected';

create table if not exists pos.kol_budget_deposits (
  id text primary key,
  campaign_id bigint not null references pos.kol_campaigns(id),
  method text not null check (method in ('mayar','djiwapay','manual')),
  nominal bigint not null check (nominal >= 1000),
  fee bigint not null default 0 check (fee >= 0),
  total bigint not null check (total >= nominal),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','expired')),
  invoice_id text unique,
  invoice_url text,
  note text,
  created_by text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_kol_budget_deposits_campaign on pos.kol_budget_deposits(campaign_id, created_at desc);

-- Ledger anggaran: tiap baris menggeser saldo antar kolom; selain deposit jumlahnya nol.
create table if not exists pos.kol_budget_ledger (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references pos.kol_campaigns(id),
  kind text not null check (kind in ('deposit','reserve','release','payout','refund')),
  available_delta bigint not null default 0,
  reserved_delta bigint not null default 0,
  paid_delta bigint not null default 0,
  refunded_delta bigint not null default 0,
  ref_type text,
  ref_id text,
  note text,
  actor text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check ((kind = 'deposit' and available_delta > 0 and reserved_delta = 0 and paid_delta = 0 and refunded_delta = 0)
      or (kind <> 'deposit' and available_delta + reserved_delta + paid_delta + refunded_delta = 0))
);
create index if not exists idx_kol_budget_ledger_campaign on pos.kol_budget_ledger(campaign_id, id desc);
create index if not exists idx_kol_budget_ledger_ref on pos.kol_budget_ledger(ref_type, ref_id);

create table if not exists pos.kol_view_snapshots (
  id bigint generated always as identity primary key,
  submission_id bigint not null references pos.kol_content_submissions(id) on delete cascade,
  views integer not null check (views >= 0),
  source text not null check (source in ('manual','screenshot')),
  evidence_url text,
  note text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_kol_view_snapshots_submission on pos.kol_view_snapshots(submission_id, id desc);

create table if not exists pos.kol_reward_payouts (
  id bigint generated always as identity primary key,
  submission_id bigint not null unique references pos.kol_content_submissions(id),
  application_id bigint not null references pos.kol_campaign_applications(id),
  campaign_id bigint not null references pos.kol_campaigns(id),
  kol_id text not null references pos.kol_creators(source_id),
  views integer not null check (views >= 0),
  rate_per_1000 integer not null,
  computed_amount bigint not null check (computed_amount >= 0),
  amount bigint not null check (amount >= 0),
  released bigint not null default 0 check (released >= 0),
  wallet_ledger_key text,
  note text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_kol_reward_payouts_kol on pos.kol_reward_payouts(kol_id, created_at desc);

alter table pos.kol_businesses enable row level security;
alter table pos.kol_budget_deposits enable row level security;
alter table pos.kol_budget_ledger enable row level security;
alter table pos.kol_view_snapshots enable row level security;
alter table pos.kol_reward_payouts enable row level security;
revoke all on pos.kol_businesses, pos.kol_budget_deposits, pos.kol_budget_ledger, pos.kol_view_snapshots, pos.kol_reward_payouts
  from public, anon, authenticated;
grant select on pos.kol_businesses, pos.kol_budget_deposits, pos.kol_budget_ledger, pos.kol_view_snapshots, pos.kol_reward_payouts to service_role;

create or replace function pos.kol_reward_rules(p pos.kol_campaigns)
returns jsonb language sql immutable set search_path = pos, pg_catalog as $$
  select jsonb_build_object('ratePer1000', p.reward_per_1000, 'minViews', p.reward_min_views,
    'maxPerContent', p.reward_max_per_content, 'maxPerKol', p.reward_max_per_kol,
    'settleDays', p.reward_settle_days, 'platforms', to_jsonb(p.reward_platforms))
$$;

create or replace function pos.kol_budget_totals(p_campaign bigint)
returns table(funded bigint, available bigint, reserved bigint, paid bigint, refunded bigint)
language sql stable security definer set search_path = pos, pg_catalog as $$
  select coalesce(sum(case when kind = 'deposit' then available_delta end), 0)::bigint,
         coalesce(sum(available_delta), 0)::bigint, coalesce(sum(reserved_delta), 0)::bigint,
         coalesce(sum(paid_delta), 0)::bigint, coalesce(sum(refunded_delta), 0)::bigint
    from pos.kol_budget_ledger where campaign_id = p_campaign
$$;

-- Ringkasan reward untuk KOL: tarif, batas, dan sisa slot. Null jika kampanye tanpa reward.
create or replace function pos.kol_reward_public(p_campaign bigint)
returns jsonb language sql stable security definer set search_path = pos, pg_catalog as $$
  select case when c.rewards_enabled then jsonb_build_object(
      'ratePer1000', c.reward_per_1000, 'minViews', c.reward_min_views,
      'maxPerContent', c.reward_max_per_content, 'maxPerKol', c.reward_max_per_kol,
      'settleDays', c.reward_settle_days, 'platforms', to_jsonb(c.reward_platforms),
      'slotsTotal', floor(t.funded::numeric / nullif(c.reward_max_per_kol, 0))::int,
      'slotsLeft', greatest(0, floor(t.available::numeric / nullif(c.reward_max_per_kol, 0))::int
        - (select count(*) from pos.kol_campaign_applications ap where ap.campaign_id = c.id and ap.status = 'pending')::int))
    end
    from pos.kol_campaigns c cross join lateral pos.kol_budget_totals(c.id) t where c.id = p_campaign
$$;

-- Aturan reward dibekukan saat KOL mendaftar; pendaftar baru ditolak bila slot anggaran habis.
create or replace function pos.kol_reward_application_before()
returns trigger language plpgsql security definer set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; slots integer;
begin
  select * into cp from pos.kol_campaigns where id = new.campaign_id;
  if not found or not cp.rewards_enabled then return new; end if;
  perform pg_advisory_xact_lock(7001, new.campaign_id::integer);
  if tg_op = 'INSERT' or (old.status in ('cancelled','rejected') and new.status in ('pending','approved')) then
    new.reward_rules_snapshot := pos.kol_reward_rules(cp);
    if new.status = 'pending' then
      select floor(t.available::numeric / cp.reward_max_per_kol)::int into slots from pos.kol_budget_totals(cp.id) t;
      slots := slots - (select count(*) from pos.kol_campaign_applications
                         where campaign_id = cp.id and status = 'pending' and id is distinct from new.id)::int;
      if slots < 1 then raise exception using message = 'CAMPAIGN_FULL', errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end $$;

-- Cadangkan anggaran saat KOL disetujui; lepaskan saat ditolak atau dibatalkan.
create or replace function pos.kol_reward_application_after()
returns trigger language plpgsql security definer set search_path = pos, pg_catalog as $$
declare amt bigint; held bigint; av bigint; stamp text;
begin
  if new.reward_rules_snapshot is null then return new; end if;
  perform pg_advisory_xact_lock(7001, new.campaign_id::integer);
  amt := coalesce((new.reward_rules_snapshot ->> 'maxPerKol')::bigint, 0);
  stamp := to_char(new.applied_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  select coalesce(sum(reserved_delta), 0) into held from pos.kol_budget_ledger
   where campaign_id = new.campaign_id and ref_type = 'application' and ref_id = new.id::text;
  if new.status = 'approved' and held = 0 and amt > 0
     and not exists (select 1 from pos.kol_reward_payouts where application_id = new.id) then
    select t.available into av from pos.kol_budget_totals(new.campaign_id) t;
    if av < amt then raise exception using message = 'REWARD_BUDGET_INSUFFICIENT', errcode = 'P0001'; end if;
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (new.campaign_id, 'reserve', -amt, amt, 'application', new.id::text, 'KOL disetujui', 'system', 'reserve:' || new.id || ':' || stamp)
    on conflict (idempotency_key) do nothing;
  elsif new.status in ('rejected','cancelled') and held > 0 then
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (new.campaign_id, 'release', held, -held, 'application', new.id::text, 'Pendaftaran ' || new.status, 'system', 'release:' || new.id || ':' || stamp)
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_kol_reward_application_before on pos.kol_campaign_applications;
create trigger trg_kol_reward_application_before before insert or update of status on pos.kol_campaign_applications
for each row execute function pos.kol_reward_application_before();
drop trigger if exists trg_kol_reward_application_after on pos.kol_campaign_applications;
create trigger trg_kol_reward_application_after after insert or update of status on pos.kol_campaign_applications
for each row execute function pos.kol_reward_application_after();

-- ID video TikTok memuat waktu tayang (detik di 32 bit teratas); tenggat H+N dihitung dari sana.
create or replace function pos.kol_reward_submission_before()
returns trigger language plpgsql security definer set search_path = pos, pg_catalog as $$
declare rules jsonb; vid text; ts timestamptz; days integer;
begin
  select ap.reward_rules_snapshot into rules
    from pos.kol_campaign_assignments a
    join pos.kol_campaign_applications ap on ap.campaign_id = a.campaign_id and ap.kol_id = a.kol_id
   where a.id = new.campaign_assignment_id;
  if rules is null then return new; end if;
  if not (coalesce(new.required_platform, new.deliverable_type) in (select jsonb_array_elements_text(rules -> 'platforms'))) then return new; end if;
  vid := substring(new.content_url from '/video/([0-9]{15,22})');
  new.video_id := vid;
  if vid is not null then ts := to_timestamp((vid::bigint >> 32));
  elsif new.published_at is not null then ts := (new.published_at::timestamp at time zone 'Asia/Jakarta');
  end if;
  days := coalesce((rules ->> 'settleDays')::integer, 7);
  new.posted_at := ts;
  new.settle_due_at := case when ts is null then null else ts + make_interval(days => days) end;
  return new;
end $$;
drop trigger if exists trg_kol_reward_submission_before on pos.kol_content_submissions;
create trigger trg_kol_reward_submission_before before insert or update of content_url, published_at on pos.kol_content_submissions
for each row execute function pos.kol_reward_submission_before();

-- Deposit: dicatat pending, dijadikan anggaran hanya lewat kol_budget_deposit_settle.
create or replace function pos.kol_budget_deposit_settle(p_id text, p_actor text)
returns pos.kol_budget_deposits language plpgsql security definer set search_path = pos, pg_catalog as $$
declare d pos.kol_budget_deposits%rowtype;
begin
  select * into d from pos.kol_budget_deposits where id = p_id for update;
  if not found then raise exception using message = 'DEPOSIT_NOT_FOUND', errcode = 'P0001'; end if;
  if d.status = 'paid' then return d; end if;
  if d.status <> 'pending' then raise exception using message = 'DEPOSIT_NOT_PENDING', errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(7001, d.campaign_id::integer);
  insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, ref_type, ref_id, note, actor, idempotency_key)
  values (d.campaign_id, 'deposit', d.nominal, 'deposit', d.id, coalesce(d.note, 'Deposit ' || d.method), p_actor, 'deposit:' || d.id)
  on conflict (idempotency_key) do nothing;
  update pos.kol_budget_deposits set status = 'paid', paid_at = now() where id = d.id returning * into d;
  return d;
end $$;

create or replace function pos.kol_budget_deposit_create(p_campaign bigint, p_method text, p_nominal bigint, p_fee bigint,
  p_note text, p_actor text, p_key text)
returns pos.kol_budget_deposits language plpgsql security definer set search_path = pos, pg_catalog as $$
declare d pos.kol_budget_deposits%rowtype; cp pos.kol_campaigns%rowtype; biz pos.kol_businesses%rowtype;
        v_wallet pos.customer_wallets; v_balance bigint; v_id text;
begin
  select * into d from pos.kol_budget_deposits where idempotency_key = p_key;
  if found then return d; end if;
  select * into cp from pos.kol_campaigns where id = p_campaign;
  if not found then raise exception using message = 'CAMPAIGN_NOT_FOUND', errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(7001, p_campaign::integer);
  if cp.business_id is null then raise exception using message = 'BUSINESS_REQUIRED', errcode = 'P0001'; end if;
  if p_nominal < 1000 or p_nominal > 100000000 then raise exception using message = 'INVALID_AMOUNT', errcode = 'P0001'; end if;
  if p_method not in ('mayar','djiwapay','manual') then raise exception using message = 'INVALID_METHOD', errcode = 'P0001'; end if;
  v_id := 'kd_' || replace(gen_random_uuid()::text, '-', '');
  insert into pos.kol_budget_deposits(id, campaign_id, method, nominal, fee, total, note, created_by, idempotency_key)
  values (v_id, p_campaign, p_method, p_nominal, case when p_method = 'mayar' then greatest(p_fee, 0) else 0 end,
          p_nominal + case when p_method = 'mayar' then greatest(p_fee, 0) else 0 end, nullif(btrim(p_note), ''), p_actor, p_key)
  returning * into d;
  if p_method = 'djiwapay' then
    select * into biz from pos.kol_businesses where id = cp.business_id;
    if biz.owner_customer_id is null then raise exception using message = 'BUSINESS_WALLET_MISSING', errcode = 'P0001'; end if;
    perform pos.wallet_ensure(biz.owner_customer_id);
    select * into v_wallet from pos.customer_wallets where customer_id = biz.owner_customer_id for update;
    if v_wallet.status <> 'active' then raise exception using message = 'WALLET_BLOCKED', errcode = 'P0001'; end if;
    if v_wallet.available_balance < p_nominal then raise exception using message = 'INSUFFICIENT_BALANCE', errcode = 'P0001'; end if;
    v_balance := v_wallet.available_balance - p_nominal;
    update pos.customer_wallets set available_balance = v_balance, total_debited = total_debited + p_nominal, updated_at = now()
     where customer_id = biz.owner_customer_id;
    insert into pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type,
                                           reference_type, reference_id, idempotency_key, note, created_by)
    values (biz.owner_customer_id, p_nominal, 'debit', v_balance, 'completed', 'manual_debit', 'kol_budget', v_id,
            'kol-budget:' || v_id, 'Anggaran kampanye KOL: ' || cp.title, p_actor);
    d := pos.kol_budget_deposit_settle(v_id, p_actor);
  elsif p_method = 'manual' then
    d := pos.kol_budget_deposit_settle(v_id, p_actor);
  end if;
  return d;
end $$;

create or replace function pos.kol_view_record(p_submission bigint, p_views integer, p_source text, p_evidence text, p_note text, p_actor text)
returns pos.kol_view_snapshots language plpgsql security definer set search_path = pos, pg_catalog as $$
declare s pos.kol_view_snapshots%rowtype;
begin
  if p_views is null or p_views < 0 then raise exception using message = 'INVALID_VIEWS', errcode = 'P0001'; end if;
  if p_source not in ('manual','screenshot') then raise exception using message = 'INVALID_SOURCE', errcode = 'P0001'; end if;
  perform 1 from pos.kol_content_submissions where id = p_submission;
  if not found then raise exception using message = 'SUBMISSION_NOT_FOUND', errcode = 'P0001'; end if;
  insert into pos.kol_view_snapshots(submission_id, views, source, evidence_url, note, created_by)
  values (p_submission, p_views, p_source, nullif(btrim(p_evidence), ''), nullif(btrim(p_note), ''), p_actor) returning * into s;
  return s;
end $$;

create or replace function pos.kol_reward_settle(p_submission bigint, p_views integer, p_source text, p_evidence text,
  p_note text, p_actor text)
returns jsonb language plpgsql security definer set search_path = pos, pg_catalog as $$
declare
  s pos.kol_content_submissions%rowtype; a pos.kol_campaign_assignments%rowtype; cp pos.kol_campaigns%rowtype;
  ap pos.kol_campaign_applications%rowtype; k pos.kol_creators%rowtype; po pos.kol_reward_payouts%rowtype;
  rules jsonb; rate integer; minv integer; cap bigint; computed bigint; amt bigint; held bigint; rel bigint;
  cid text; w pos.customer_wallets; bal bigint; pid bigint; v_key text;
begin
  select * into s from pos.kol_content_submissions where id = p_submission for update;
  if not found then raise exception using message = 'SUBMISSION_NOT_FOUND', errcode = 'P0001'; end if;
  select * into po from pos.kol_reward_payouts where submission_id = p_submission;
  if found then return jsonb_build_object('ok', true, 'dedup', true, 'payoutId', po.id, 'amount', po.amount); end if;
  select * into a from pos.kol_campaign_assignments where id = s.campaign_assignment_id;
  select * into cp from pos.kol_campaigns where id = a.campaign_id;
  perform pg_advisory_xact_lock(7001, a.campaign_id::integer);
  select * into ap from pos.kol_campaign_applications where campaign_id = a.campaign_id and kol_id = a.kol_id for update;
  rules := ap.reward_rules_snapshot;
  if rules is null then raise exception using message = 'REWARD_NOT_ENABLED', errcode = 'P0001'; end if;
  if not (coalesce(s.required_platform, s.deliverable_type) in (select jsonb_array_elements_text(rules -> 'platforms'))) then
    raise exception using message = 'PLATFORM_NOT_REWARDED', errcode = 'P0001';
  end if;
  if s.status = 'rejected' then raise exception using message = 'CONTENT_REJECTED', errcode = 'P0001'; end if;
  if s.settle_due_at is null then raise exception using message = 'POSTED_AT_MISSING', errcode = 'P0001'; end if;
  if s.settle_due_at > now() then raise exception using message = 'SETTLE_NOT_DUE', errcode = 'P0001'; end if;
  if p_views is null or p_views < 0 then raise exception using message = 'INVALID_VIEWS', errcode = 'P0001'; end if;
  if p_source not in ('manual','screenshot') then raise exception using message = 'INVALID_SOURCE', errcode = 'P0001'; end if;
  if s.status <> 'approved' then perform pos.kol_review_campaign_proof(s.id, 'approved', p_actor, p_note); end if;

  rate := (rules ->> 'ratePer1000')::integer;
  minv := coalesce((rules ->> 'minViews')::integer, 0);
  cap := least(coalesce((rules ->> 'maxPerKol')::bigint, 9223372036854775807), coalesce((rules ->> 'maxPerContent')::bigint, 9223372036854775807));
  computed := case when p_views < minv then 0 else floor(p_views::numeric * rate / 1000)::bigint end;
  amt := least(computed, cap);
  select coalesce(sum(reserved_delta), 0) into held from pos.kol_budget_ledger
   where campaign_id = cp.id and ref_type = 'application' and ref_id = ap.id::text;
  if amt > held then raise exception using message = 'RESERVE_INSUFFICIENT', errcode = 'P0001'; end if;
  rel := held - amt;

  select * into k from pos.kol_creators where source_id = a.kol_id;
  cid := k.auth_user_id;
  if amt > 0 and cid is null then raise exception using message = 'KOL_NOT_LINKED', errcode = 'P0001'; end if;

  perform pos.kol_view_record(s.id, p_views, p_source, p_evidence, p_note, p_actor);
  insert into pos.kol_reward_payouts(submission_id, application_id, campaign_id, kol_id, views, rate_per_1000, computed_amount,
                                     amount, released, note, created_by)
  values (s.id, ap.id, cp.id, a.kol_id, p_views, rate, computed, amt, rel, nullif(btrim(p_note), ''), p_actor)
  returning id into pid;

  if amt > 0 then
    insert into pos.kol_budget_ledger(campaign_id, kind, reserved_delta, paid_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (cp.id, 'payout', -amt, amt, 'payout', pid::text, p_views || ' view x Rp' || rate || ' per 1.000', p_actor, 'payout:' || pid);
  end if;
  if rel > 0 then
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (cp.id, 'release', rel, -rel, 'payout', pid::text, 'Sisa cadangan dilepas', p_actor, 'release-payout:' || pid);
  end if;

  if amt > 0 then
    insert into pos.customers(source_id, name, is_active) values (cid, k.name, true) on conflict (source_id) do nothing;
    perform pos.wallet_ensure(cid);
    select * into w from pos.customer_wallets where customer_id = cid for update;
    if w.status <> 'active' then raise exception using message = 'WALLET_BLOCKED', errcode = 'P0001'; end if;
    bal := w.available_balance + amt;
    update pos.customer_wallets set available_balance = bal, total_credited = total_credited + amt, updated_at = now() where customer_id = cid;
    v_key := 'kol-reward:' || pid;
    insert into pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type,
                                           reference_type, reference_id, idempotency_key, note, created_by)
    values (cid, amt, 'credit', bal, 'completed', 'manual_credit', 'kol_reward', pid::text, v_key,
            'Reward KOL: ' || cp.title || ' · ' || p_views || ' view', p_actor);
    update pos.kol_reward_payouts set wallet_ledger_key = v_key where id = pid;
  end if;

  insert into pos.kol_notifications(kol_id, type, title, body, entity_type, entity_id, dedupe_key)
  values (a.kol_id, 'reward_paid', case when amt > 0 then 'Reward dibayar' else 'Reward tidak dibayarkan' end,
          case when amt > 0 then 'Rp' || amt || ' dari ' || cp.title || ' masuk ke saldo Djiwa Pay.'
               else 'Konten di ' || cp.title || ' belum mencapai minimal view.' end,
          'reward_payout', pid::text, 'reward-paid:' || pid)
  on conflict (dedupe_key) do nothing;
  return jsonb_build_object('ok', true, 'dedup', false, 'payoutId', pid, 'amount', amt, 'computed', computed, 'released', rel);
end $$;

-- Tutup anggaran: sisa tersedia dikembalikan ke saldo Djiwa Pay pemilik Bisnis.
create or replace function pos.kol_budget_refund(p_campaign bigint, p_actor text)
returns jsonb language plpgsql security definer set search_path = pos, pg_catalog as $$
declare cp pos.kol_campaigns%rowtype; biz pos.kol_businesses%rowtype; t record; w pos.customer_wallets; bal bigint; v_key text;
begin
  select * into cp from pos.kol_campaigns where id = p_campaign;
  if not found then raise exception using message = 'CAMPAIGN_NOT_FOUND', errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(7001, p_campaign::integer);
  if cp.status not in ('closed','archived') then raise exception using message = 'CAMPAIGN_NOT_CLOSED', errcode = 'P0001'; end if;
  select * into t from pos.kol_budget_totals(p_campaign);
  if t.reserved > 0 then raise exception using message = 'RESERVE_STILL_HELD', errcode = 'P0001'; end if;
  if t.available <= 0 then return jsonb_build_object('ok', true, 'refunded', 0); end if;
  select * into biz from pos.kol_businesses where id = cp.business_id;
  if biz.owner_customer_id is null then raise exception using message = 'BUSINESS_WALLET_MISSING', errcode = 'P0001'; end if;
  v_key := 'refund:' || p_campaign || ':' || (select count(*) from pos.kol_budget_ledger where campaign_id = p_campaign and kind = 'refund');
  insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, refunded_delta, ref_type, ref_id, note, actor, idempotency_key)
  values (p_campaign, 'refund', -t.available, t.available, 'campaign', p_campaign::text, 'Sisa anggaran dikembalikan', p_actor, v_key);
  perform pos.wallet_ensure(biz.owner_customer_id);
  select * into w from pos.customer_wallets where customer_id = biz.owner_customer_id for update;
  bal := w.available_balance + t.available;
  update pos.customer_wallets set available_balance = bal, total_credited = total_credited + t.available, updated_at = now()
   where customer_id = biz.owner_customer_id;
  insert into pos.customer_wallet_ledger(customer_id, amount, direction, balance_after, status, transaction_type,
                                         reference_type, reference_id, idempotency_key, note, created_by)
  values (biz.owner_customer_id, t.available, 'credit', bal, 'completed', 'manual_credit', 'kol_budget', p_campaign::text,
          'kol-' || v_key, 'Pengembalian anggaran KOL: ' || cp.title, p_actor);
  return jsonb_build_object('ok', true, 'refunded', t.available);
end $$;

-- Laporan integritas: ledger anggaran seimbang dan total payout sama dengan kredit di wallet KOL.
create or replace function pos.kol_reward_integrity(p_campaign bigint)
returns jsonb language sql stable security definer set search_path = pos, pg_catalog as $$
  select jsonb_build_object('funded', t.funded, 'available', t.available, 'reserved', t.reserved, 'paid', t.paid,
      'refunded', t.refunded,
      'budgetBalanced', t.funded = t.available + t.reserved + t.paid + t.refunded,
      'payoutTotal', p.total, 'walletCredited', w.total,
      'walletMatches', p.total = w.total and t.paid = p.total)
    from pos.kol_budget_totals(p_campaign) t
    cross join lateral (select coalesce(sum(amount), 0)::bigint as total from pos.kol_reward_payouts where campaign_id = p_campaign) p
    cross join lateral (select coalesce(sum(l.amount), 0)::bigint as total from pos.customer_wallet_ledger l
                         join pos.kol_reward_payouts po on po.id::text = l.reference_id
                        where l.reference_type = 'kol_reward' and po.campaign_id = p_campaign and l.direction = 'credit') w
$$;

revoke all on function pos.kol_reward_application_before(), pos.kol_reward_application_after(), pos.kol_reward_submission_before(),
  pos.kol_budget_deposit_settle(text,text), pos.kol_budget_deposit_create(bigint,text,bigint,bigint,text,text,text),
  pos.kol_view_record(bigint,integer,text,text,text,text), pos.kol_reward_settle(bigint,integer,text,text,text,text),
  pos.kol_budget_refund(bigint,text), pos.kol_budget_totals(bigint), pos.kol_reward_public(bigint), pos.kol_reward_integrity(bigint)
  from public, anon, authenticated;
grant execute on function pos.kol_budget_deposit_settle(text,text), pos.kol_budget_deposit_create(bigint,text,bigint,bigint,text,text,text),
  pos.kol_view_record(bigint,integer,text,text,text,text), pos.kol_reward_settle(bigint,integer,text,text,text,text),
  pos.kol_budget_refund(bigint,text), pos.kol_budget_totals(bigint), pos.kol_reward_public(bigint), pos.kol_reward_integrity(bigint)
  to service_role;

notify pgrst, 'reload schema';
