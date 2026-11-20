-- Baris ledger payout dan release mengacu ke pendaftaran (application), sama seperti reserve,
-- sehingga cadangan yang masih ditahan per KOL dapat dihitung dari satu referensi.
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
    values (cp.id, 'payout', -amt, amt, 'application', ap.id::text, 'Payout #' || pid || ': ' || p_views || ' view x Rp' || rate || ' per 1.000', p_actor, 'payout:' || pid);
  end if;
  if rel > 0 then
    insert into pos.kol_budget_ledger(campaign_id, kind, available_delta, reserved_delta, ref_type, ref_id, note, actor, idempotency_key)
    values (cp.id, 'release', rel, -rel, 'application', ap.id::text, 'Payout #' || pid || ': sisa cadangan dilepas', p_actor, 'release-payout:' || pid);
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


-- Perbaiki baris yang sudah ada (belum ada payout produksi saat migrasi ini dibuat; aman dijalankan ulang).
update pos.kol_budget_ledger l set ref_type = 'application', ref_id = po.application_id::text,
       note = 'Payout #' || po.id || ': ' || coalesce(l.note, '')
  from pos.kol_reward_payouts po
 where l.ref_type = 'payout' and l.ref_id = po.id::text;

revoke all on function pos.kol_reward_settle(bigint,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function pos.kol_reward_settle(bigint,integer,text,text,text,text) to service_role;
notify pgrst, 'reload schema';
