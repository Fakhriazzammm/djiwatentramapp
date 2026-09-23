-- Djiwa Run restricted reward redemption foundation.
-- Additive/idempotent. Rewards remain restricted entitlements; they are not wallet cash.

ALTER TABLE pos.run_rewards
  ADD COLUMN IF NOT EXISTS reserved_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reservation_id text,
  ADD COLUMN IF NOT EXISTS reserved_order_id text,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE pos.run_rewards
  DROP CONSTRAINT IF EXISTS run_rewards_reserved_amount_check;
ALTER TABLE pos.run_rewards
  ADD CONSTRAINT run_rewards_reserved_amount_check
  CHECK (reserved_amount >= 0 AND reserved_amount <= max_amount AND reserved_amount <= remaining_amount + reserved_amount);

CREATE UNIQUE INDEX IF NOT EXISTS run_rewards_reservation_uq
  ON pos.run_rewards(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS run_rewards_scope_status_idx
  ON pos.run_rewards(customer_source_id, campaign_id, status, expires_at);

-- Keep reward-specific state separate from the general Djiwa Pay wallet ledger.
CREATE OR REPLACE FUNCTION pos.run_reward_audit(
  p_actor_type text, p_actor_id text, p_reward_id uuid, p_action text,
  p_old jsonb DEFAULT NULL, p_new jsonb DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  INSERT INTO pos.run_audit_logs(actor_type, actor_id, entity_type, entity_id, action, old_values, new_values, reason)
  VALUES (p_actor_type, p_actor_id, 'run_reward', p_reward_id::text, p_action, p_old, p_new, p_reason);
END;
$$;

-- Grant the highest completed tier in each period scope. Amount and product limits
-- are read only from the tier; this function deliberately has no amount argument.
CREATE OR REPLACE FUNCTION pos.run_grant_reward_on_accepted_milestone(
  p_customer_source_id text, p_campaign_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_scope text;
  v_tier pos.run_tiers;
  v_reward pos.run_rewards;
  v_existing pos.run_rewards;
  v_max_amount bigint;
  v_expiry_hours integer;
  v_expires_at timestamptz;
  v_granted jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(trim(p_customer_source_id), '') = '' OR p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'Customer dan campaign wajib diisi';
  END IF;

  FOR v_scope IN SELECT unnest(ARRAY['weekly','monthly']) LOOP
    -- Highest completed target wins within this campaign scope.
    SELECT t.* INTO v_tier
    FROM pos.run_progress p
    JOIN pos.run_tiers t ON t.id = p.tier_id
    WHERE p.customer_source_id = p_customer_source_id
      AND p.campaign_id = p_campaign_id
      AND p.status IN ('completed','upgraded')
      AND t.period_scope = v_scope AND t.is_active
    ORDER BY t.target_km DESC, t.sort_order DESC, t.id DESC
    LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- A redeemed or reserved lower tier has already consumed the scope reward;
    -- never stack an upgrade on top of it.
    SELECT r.* INTO v_existing
    FROM pos.run_rewards r
    JOIN pos.run_tiers old_t ON old_t.id = r.tier_id
    WHERE r.customer_source_id = p_customer_source_id
      AND r.campaign_id = p_campaign_id
      AND old_t.period_scope = v_scope
      AND r.status IN ('reserved','redeemed')
    ORDER BY old_t.target_km DESC
    LIMIT 1;
    IF FOUND THEN CONTINUE; END IF;

    SELECT r.* INTO v_existing FROM pos.run_rewards r WHERE r.customer_source_id = p_customer_source_id AND r.campaign_id = p_campaign_id AND r.tier_id = v_tier.id FOR UPDATE;
    IF FOUND THEN
      IF v_existing.status = 'expired' AND (v_existing.expires_at IS NULL OR v_existing.expires_at > now()) THEN
        UPDATE pos.run_rewards SET status = 'unlocked', updated_at = now() WHERE id = v_existing.id;
      END IF;
      v_granted := v_granted || jsonb_build_array(jsonb_build_object('reward_id', v_existing.id, 'dedup', true, 'scope', v_scope));
      CONTINUE;
    END IF;

    -- No default or hard-coded reward amount: configuration must provide it.
    v_max_amount := COALESCE(
      v_tier.max_amount,
      CASE WHEN coalesce(v_tier.reward_config->>'max_amount','') ~ '^[0-9]+$' THEN (v_tier.reward_config->>'max_amount')::bigint END,
      CASE WHEN coalesce(v_tier.reward_config->>'amount','') ~ '^[0-9]+$' THEN (v_tier.reward_config->>'amount')::bigint END
    );
    IF v_max_amount IS NULL OR v_max_amount < 0 THEN
      INSERT INTO pos.run_audit_logs(actor_type, entity_type, entity_id, action, reason, new_values)
      VALUES ('system','run_tier',v_tier.id::text,'reward_not_granted','Tier tidak memiliki max_amount/reward_config amount',jsonb_build_object('customer_source_id',p_customer_source_id,'campaign_id',p_campaign_id));
      CONTINUE;
    END IF;
    IF v_tier.reward_category IS NULL OR jsonb_typeof(v_tier.eligible_product_ids) <> 'array' OR jsonb_array_length(v_tier.eligible_product_ids)=0 THEN
      INSERT INTO pos.run_audit_logs(actor_type, entity_type, entity_id, action, reason, new_values)
      VALUES ('system','run_tier',v_tier.id::text,'reward_not_granted','Tier reward_category dan eligible_product_ids wajib dikonfigurasi',jsonb_build_object('customer_source_id',p_customer_source_id,'campaign_id',p_campaign_id));
      CONTINUE;
    END IF;
    v_expiry_hours := COALESCE(v_tier.expiry_hours, NULLIF(v_tier.reward_config->>'expiry_hours','')::integer);
    v_expires_at := CASE WHEN v_expiry_hours IS NULL THEN NULL ELSE now() + make_interval(hours => v_expiry_hours) END;

    INSERT INTO pos.run_rewards(customer_source_id,campaign_id,tier_id,reward_category,status,max_amount,remaining_amount,eligible_product_ids,expires_at,metadata)
    VALUES (p_customer_source_id,p_campaign_id,v_tier.id,v_tier.reward_category,'unlocked',v_max_amount,v_max_amount,v_tier.eligible_product_ids,v_expires_at,jsonb_build_object('grant_source','accepted_milestone','period_scope',v_scope))
    RETURNING * INTO v_reward;
    PERFORM pos.run_reward_audit('system',NULL,v_reward.id,'grant',NULL,to_jsonb(v_reward),'accepted milestone; highest tier in scope');
    v_granted := v_granted || jsonb_build_array(jsonb_build_object('reward_id',v_reward.id,'dedup',false,'scope',v_scope,'tier_id',v_tier.id));

    -- If a lower unlocked/claimed reward exists, revoke it so the scope cannot stack.
    UPDATE pos.run_rewards r SET status='revoked', updated_at=now(), metadata=r.metadata || jsonb_build_object('revoked_by_upgrade',v_reward.id)
    FROM pos.run_tiers old_t
    WHERE r.tier_id=old_t.id AND r.customer_source_id=p_customer_source_id AND r.campaign_id=p_campaign_id
      AND old_t.period_scope=v_scope AND old_t.target_km < v_tier.target_km
      AND r.status IN ('unlocked','credited');
  END LOOP;
  RETURN jsonb_build_object('ok',true,'rewards',v_granted);
END;
$$;

CREATE OR REPLACE FUNCTION pos.run_expire_rewards()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_count bigint;
BEGIN
  WITH expired AS (
    UPDATE pos.run_rewards
    SET status='expired', updated_at=now()
    WHERE expires_at IS NOT NULL AND expires_at <= now()
      AND status IN ('unlocked','credited')
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;
  INSERT INTO pos.run_audit_logs(actor_type, entity_type, entity_id, action, reason)
  SELECT 'system','run_reward',id::text,'expire','reward expiry reached'
  FROM pos.run_rewards
  WHERE status='expired' AND expires_at IS NOT NULL AND expires_at <= now()
    AND updated_at >= now() - interval '1 second';
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pos.run_process_accepted_milestone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    PERFORM pos.run_rebuild_progress(NEW.customer_source_id, NEW.campaign_id);
    PERFORM pos.run_grant_reward_on_accepted_milestone(NEW.customer_source_id, NEW.campaign_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_run_process_accepted_milestone ON pos.run_activities;
CREATE TRIGGER trg_run_process_accepted_milestone
AFTER INSERT OR UPDATE OF status ON pos.run_activities
FOR EACH ROW EXECUTE FUNCTION pos.run_process_accepted_milestone();

CREATE OR REPLACE FUNCTION pos.run_reward_claim(
  p_reward_id uuid, p_customer_source_id text, p_claimed_by text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE r pos.run_rewards; old jsonb;
BEGIN
  PERFORM pos.run_expire_rewards();
  SELECT * INTO r FROM pos.run_rewards WHERE id=p_reward_id AND customer_source_id=p_customer_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward tidak ditemukan'; END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at <= now() THEN
    UPDATE pos.run_rewards SET status='expired', updated_at=now() WHERE id=r.id;
    PERFORM pos.run_reward_audit('system',NULL,r.id,'expire',to_jsonb(r),jsonb_build_object('status','expired'),'claim after expiry');
    RAISE EXCEPTION 'Reward sudah kedaluwarsa';
  END IF;
  IF r.status IN ('credited','reserved') THEN RETURN jsonb_build_object('ok',true,'dedup',true,'reward_id',r.id,'claim_code',r.claim_code,'status',r.status); END IF;
  IF r.status <> 'unlocked' THEN RAISE EXCEPTION 'Reward tidak dapat diklaim'; END IF;
  old := to_jsonb(r);
  UPDATE pos.run_rewards SET status='credited', claim_code=COALESCE(claim_code,'run_'||replace(gen_random_uuid()::text,'-','')), claimed_by=p_claimed_by, claimed_at=COALESCE(claimed_at,now()), updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM pos.run_reward_audit('customer',p_claimed_by,r.id,'claim',old,to_jsonb(r),NULL);
  RETURN jsonb_build_object('ok',true,'dedup',false,'reward_id',r.id,'claim_code',r.claim_code,'status',r.status,'max_amount',r.max_amount,'remaining_amount',r.remaining_amount,'eligible_product_ids',r.eligible_product_ids,'expires_at',r.expires_at);
END;
$$;

DROP FUNCTION IF EXISTS pos.run_reward_reserve(uuid,text,text,bigint,text);
CREATE OR REPLACE FUNCTION pos.run_reward_reserve(
  p_reward_id uuid, p_customer_source_id text, p_order_id text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE r pos.run_rewards; old jsonb; v_eligible bigint; v_amount bigint; v_order_customer text; v_reservation text := 'rr_'||md5(p_reward_id::text||':'||p_order_id||':'||p_idempotency_key);
BEGIN
  PERFORM pos.run_expire_rewards();
  IF coalesce(trim(p_order_id),'')='' OR coalesce(trim(p_idempotency_key),'')='' THEN RAISE EXCEPTION 'Reward reservation tidak valid'; END IF;
  SELECT customer_source_id INTO v_order_customer FROM pos.orders WHERE source_id=p_order_id;
  IF v_order_customer IS DISTINCT FROM p_customer_source_id THEN RAISE EXCEPTION 'Order bukan milik customer reward'; END IF;
  SELECT * INTO r FROM pos.run_rewards WHERE id=p_reward_id AND customer_source_id=p_customer_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward tidak ditemukan'; END IF;
  IF r.reservation_id IS NOT NULL AND r.reservation_id=v_reservation THEN RETURN jsonb_build_object('ok',true,'dedup',true,'reservation_id',r.reservation_id,'amount',r.reserved_amount,'status',r.status); END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at <= now() THEN UPDATE pos.run_rewards SET status='expired',updated_at=now() WHERE id=r.id; RAISE EXCEPTION 'Reward sudah kedaluwarsa'; END IF;
  IF r.status NOT IN ('credited','unlocked') THEN RAISE EXCEPTION 'Reward tidak tersedia untuk reservation'; END IF;
  IF jsonb_typeof(r.eligible_product_ids) <> 'array' OR jsonb_array_length(r.eligible_product_ids)=0 THEN RAISE EXCEPTION 'Reward tidak memiliki produk eligible'; END IF;
  SELECT COALESCE(SUM(oi.price * oi.quantity),0)::bigint INTO v_eligible
  FROM pos.order_items oi
  WHERE oi.order_source_id=p_order_id AND COALESCE(oi.status,'') <> 'cancelled'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.eligible_product_ids) x WHERE x=oi.product_source_id);
  IF v_eligible <= 0 THEN RAISE EXCEPTION 'Order tidak memiliki produk eligible untuk reward'; END IF;
  -- The server derives the applied amount from reward configuration and the
  -- authoritative order items. The client never supplies amount or eligibility.
  v_amount := LEAST(r.max_amount, r.remaining_amount, v_eligible);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Nominal reward tidak valid'; END IF;
  old:=to_jsonb(r);
  UPDATE pos.run_rewards SET status='reserved',remaining_amount=remaining_amount-v_amount,reserved_amount=v_amount,reservation_id=v_reservation,reserved_order_id=p_order_id,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM pos.run_reward_audit('pos',p_customer_source_id,r.id,'reserve',old,to_jsonb(r),'checkout reservation');
  RETURN jsonb_build_object('ok',true,'dedup',false,'reservation_id',r.reservation_id,'reward_id',r.id,'order_id',p_order_id,'amount',v_amount,'eligible_amount',v_eligible,'status',r.status);
END;
$$;

CREATE OR REPLACE FUNCTION pos.run_reward_release(
  p_reward_id uuid, p_customer_source_id text, p_reservation_id text, p_reason text DEFAULT 'Checkout dibatalkan'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE r pos.run_rewards; old jsonb;
BEGIN
  SELECT * INTO r FROM pos.run_rewards WHERE id=p_reward_id AND customer_source_id=p_customer_source_id AND reservation_id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation reward tidak ditemukan'; END IF;
  IF r.status='credited' AND r.reservation_id IS NULL THEN RETURN jsonb_build_object('ok',true,'dedup',true,'status','credited'); END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'Reward tidak dapat direlease'; END IF;
  old:=to_jsonb(r);
  UPDATE pos.run_rewards SET status='credited',remaining_amount=remaining_amount+reserved_amount,reserved_amount=0,reservation_id=NULL,reserved_order_id=NULL,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM pos.run_reward_audit('pos',p_customer_source_id,r.id,'release',old,to_jsonb(r),p_reason);
  RETURN jsonb_build_object('ok',true,'dedup',false,'reward_id',r.id,'status',r.status,'remaining_amount',r.remaining_amount);
END;
$$;

CREATE OR REPLACE FUNCTION pos.run_reward_finalize(
  p_reward_id uuid, p_customer_source_id text, p_reservation_id text, p_order_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE r pos.run_rewards; old jsonb;
BEGIN
  SELECT * INTO r FROM pos.run_rewards WHERE id=p_reward_id AND customer_source_id=p_customer_source_id FOR UPDATE;
  IF NOT FOUND OR r.reservation_id IS DISTINCT FROM p_reservation_id OR r.reserved_order_id IS DISTINCT FROM p_order_id THEN RAISE EXCEPTION 'Reservation reward tidak valid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pos.orders WHERE source_id=p_order_id AND customer_source_id=p_customer_source_id AND status IN ('paid','completed')) THEN RAISE EXCEPTION 'Order belum berhasil diselesaikan'; END IF;
  IF r.status='redeemed' AND r.redeemed_order_id=p_order_id THEN RETURN jsonb_build_object('ok',true,'dedup',true,'status','redeemed','order_id',p_order_id); END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'Reward tidak dapat difinalisasi'; END IF;
  old:=to_jsonb(r);
  UPDATE pos.run_rewards SET status='redeemed',redeemed_order_id=p_order_id,redeemed_at=now(),reserved_amount=0,reservation_id=NULL,reserved_order_id=NULL,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM pos.run_reward_audit('pos',p_customer_source_id,r.id,'finalize',old,to_jsonb(r),'checkout completed');
  RETURN jsonb_build_object('ok',true,'dedup',false,'reward_id',r.id,'status',r.status,'order_id',p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION pos.run_grant_reward_on_accepted_milestone(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_expire_rewards() TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_process_accepted_milestone() TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_reward_claim(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_reward_reserve(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_reward_release(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION pos.run_reward_finalize(uuid,text,text,text) TO service_role;
