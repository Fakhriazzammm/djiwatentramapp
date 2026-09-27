-- Real customer purchase activity for Community.
-- Additive only: does not alter historical orders or financial transactions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE pos.customers
  ADD COLUMN IF NOT EXISTS share_purchase_activity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_activity_name_mode text NOT NULL DEFAULT 'first_name';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_customers_purchase_activity_name_mode_check'
      AND conrelid = 'pos.customers'::regclass
  ) THEN
    ALTER TABLE pos.customers
      ADD CONSTRAINT pos_customers_purchase_activity_name_mode_check
      CHECK (purchase_activity_name_mode IN ('first_name', 'full_name'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_community_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_source_id text NOT NULL,
  order_source_id text NOT NULL,
  product_source_id text NOT NULL,
  activity_type text NOT NULL DEFAULT 'order_completed',
  display_name_snapshot text NOT NULL,
  display_mode text NOT NULL DEFAULT 'first_name',
  product_name_snapshot text NOT NULL,
  product_image_snapshot text,
  price_snapshot numeric(18,2),
  nutrition_snapshot jsonb,
  order_settled_at timestamptz NOT NULL,
  visible_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  visibility text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'active',
  source_payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT customer_community_activity_type_check
    CHECK (activity_type = 'order_completed'),
  CONSTRAINT customer_community_activity_visibility_check
    CHECK (visibility IN ('public', 'aggregate_only', 'private')),
  CONSTRAINT customer_community_activity_status_check
    CHECK (status IN ('active', 'hidden', 'revoked', 'expired')),
  CONSTRAINT customer_community_activity_unique_order_product
    UNIQUE (order_source_id, product_source_id, activity_type)
);

CREATE INDEX IF NOT EXISTS customer_community_activity_feed_idx
  ON public.customer_community_activity_events (visible_at DESC, id DESC)
  WHERE status = 'active' AND visibility = 'public';

CREATE INDEX IF NOT EXISTS customer_community_activity_product_idx
  ON public.customer_community_activity_events (product_source_id, visible_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS customer_community_activity_customer_idx
  ON public.customer_community_activity_events (customer_source_id, created_at DESC);

ALTER TABLE public.customer_community_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_community_activity_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_community_activity_events TO service_role;

CREATE OR REPLACE VIEW public.pos_customers_view AS
SELECT
  c.source_id,
  c.email,
  c.name,
  c.phone,
  c.photo_url,
  c.total_points,
  c.lifetime_points,
  c.total_orders,
  c.total_spent,
  c.last_order_at,
  c.created_at,
  COALESCE(w.available_balance, 0)::bigint AS wallet_balance,
  COALESCE(w.held_balance, 0)::bigint AS wallet_held_balance,
  COALESCE(w.total_credited, 0)::bigint AS wallet_total_credited,
  COALESCE(w.total_debited, 0)::bigint AS wallet_total_debited,
  COALESCE(w.status, 'active') AS wallet_status,
  c.nickname,
  c.birth_date,
  c.gender,
  c.address,
  c.city,
  c.province,
  c.postal_code,
  c.marketing_consent,
  c.profile_completed_at,
  c.customer_description,
  c.last_active_at,
  c.djiwaapp_visit_count,
  c.username,
  c.membership_expires_at,
  c.share_purchase_activity,
  c.purchase_activity_name_mode
FROM pos.customers c
LEFT JOIN pos.customer_wallets w ON w.customer_id = c.source_id
WHERE c.is_active = true;

GRANT SELECT ON public.pos_customers_view TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_customer_community_purchase_activity(p_order_source_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_order pos.orders;
  v_customer pos.customers;
  v_financial_exists boolean;
  v_wallet_settled boolean;
  v_gateway_status text;
  v_inserted integer := 0;
  v_settled_at timestamptz;
  v_name text;
  v_mode text;
  v_item record;
BEGIN
  IF coalesce(btrim(p_order_source_id), '') = '' THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_order
  FROM pos.orders
  WHERE source_id = p_order_source_id
  FOR SHARE;

  IF NOT FOUND OR coalesce(v_order.customer_source_id, '') = '' THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_customer
  FROM pos.customers
  WHERE source_id = v_order.customer_source_id
    AND is_active = true
  FOR SHARE;

  IF NOT FOUND OR v_customer.share_purchase_activity IS NOT TRUE
     OR nullif(btrim(v_customer.name), '') IS NULL THEN
    RETURN 0;
  END IF;

  v_gateway_status := lower(coalesce(v_order.payment_gateway ->> 'status', ''));
  v_financial_exists := EXISTS (
    SELECT 1
    FROM pos.financial_transactions ft
    WHERE ft.order_source_id = v_order.source_id
      AND ft.tx_type = 'income'
      AND ft.status = 'completed'
  );

  v_wallet_settled := EXISTS (
    SELECT 1
    FROM pos.customer_wallet_ledger ledger
    JOIN pos.customer_wallet_holds hold
      ON hold.order_id = v_order.source_id
     AND hold.customer_id = ledger.customer_id
    WHERE ledger.customer_id = v_order.customer_source_id
      AND ledger.reference_id = v_order.source_id
      AND ledger.transaction_type = 'order_debit'
      AND ledger.status = 'completed'
      AND ledger.direction = 'debit'
      AND hold.status = 'captured'
  );

  IF NOT (
    (
      v_order.payment_receipt_kind = 'gateway_paid'
      AND v_order.status IN ('paid', 'completed')
      AND v_gateway_status = 'paid'
      AND v_financial_exists
    ) OR (
      v_order.payment_receipt_kind = 'wallet_paid'
      AND v_order.status = 'paid'
      AND v_wallet_settled
      AND v_financial_exists
    ) OR (
      v_order.payment_receipt_kind = 'cashier'
      AND v_order.status = 'paid'
      AND lower(coalesce(v_order.payment_method, '')) IN ('cash', 'tunai', 'cashier')
      AND v_financial_exists
    )
  ) THEN
    RETURN 0;
  END IF;

  v_settled_at := to_timestamp(
    coalesce(v_order.created_at, v_order.creation_time, extract(epoch FROM now()) * 1000) / 1000.0
  );
  v_mode := coalesce(v_customer.purchase_activity_name_mode, 'first_name');
  v_name := CASE
    WHEN v_mode = 'full_name' THEN btrim(v_customer.name)
    ELSE split_part(btrim(v_customer.name), ' ', 1)
  END;

  FOR v_item IN
    SELECT
      oi.product_source_id,
      oi.product_name,
      oi.price,
      p.image AS product_image,
      p.nutrition
    FROM pos.order_items oi
    LEFT JOIN pos.products p ON p.source_id = oi.product_source_id
    WHERE oi.order_source_id = v_order.source_id
      AND coalesce(oi.quantity, 0) > 0
      AND coalesce(lower(oi.status), '') <> 'cancelled'
      AND p.source_id IS NOT NULL
  LOOP
    INSERT INTO public.customer_community_activity_events (
      customer_source_id,
      order_source_id,
      product_source_id,
      display_name_snapshot,
      display_mode,
      product_name_snapshot,
      product_image_snapshot,
      price_snapshot,
      nutrition_snapshot,
      order_settled_at,
      visible_at,
      expires_at,
      source_payment_method
    ) VALUES (
      v_order.customer_source_id,
      v_order.source_id,
      v_item.product_source_id,
      v_name,
      v_mode,
      coalesce(nullif(btrim(v_item.product_name), ''), 'Menu Djiwa'),
      v_item.product_image,
      v_item.price,
      CASE
        WHEN jsonb_typeof(v_item.nutrition) = 'object'
          AND coalesce(v_item.nutrition ->> 'status', 'verified') <> 'draft'
        THEN v_item.nutrition
        ELSE NULL
      END,
      v_settled_at,
      v_settled_at + make_interval(mins => 2 + floor(random() * 9)::integer),
      v_settled_at + interval '48 hours',
      lower(coalesce(v_order.payment_method, ''))
    )
    ON CONFLICT (order_source_id, product_source_id, activity_type) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_community_purchase_activity(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_community_purchase_activity(text) TO service_role;

CREATE OR REPLACE FUNCTION public.try_create_customer_community_purchase_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  PERFORM public.create_customer_community_purchase_activity(
    CASE WHEN TG_TABLE_NAME = 'orders' THEN NEW.source_id ELSE NEW.order_source_id END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_community_activity_after_order_settlement ON pos.orders;
CREATE TRIGGER customer_community_activity_after_order_settlement
AFTER INSERT OR UPDATE OF status, payment_gateway, payment_receipt_kind, payment_method ON pos.orders
FOR EACH ROW EXECUTE FUNCTION public.try_create_customer_community_purchase_activity();

DROP TRIGGER IF EXISTS customer_community_activity_after_financial_settlement ON pos.financial_transactions;
CREATE TRIGGER customer_community_activity_after_financial_settlement
AFTER INSERT OR UPDATE OF status, order_source_id ON pos.financial_transactions
FOR EACH ROW
WHEN (NEW.order_source_id IS NOT NULL AND NEW.tx_type = 'income')
EXECUTE FUNCTION public.try_create_customer_community_purchase_activity();

CREATE OR REPLACE FUNCTION public.sync_customer_community_activity_privacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  IF NEW.share_purchase_activity IS DISTINCT FROM OLD.share_purchase_activity
     OR NEW.purchase_activity_name_mode IS DISTINCT FROM OLD.purchase_activity_name_mode THEN
    UPDATE public.customer_community_activity_events
    SET display_mode = coalesce(NEW.purchase_activity_name_mode, 'first_name'),
        display_name_snapshot = CASE
          WHEN coalesce(NEW.purchase_activity_name_mode, 'first_name') = 'full_name' THEN coalesce(nullif(btrim(NEW.name), ''), 'Member')
          ELSE coalesce(nullif(split_part(btrim(coalesce(NEW.name, '')), ' ', 1), ''), 'Member')
        END,
        visibility = CASE WHEN NEW.share_purchase_activity THEN 'public' ELSE 'private' END,
        status = CASE WHEN NEW.share_purchase_activity THEN 'active' ELSE 'hidden' END,
        revoked_at = CASE WHEN NEW.share_purchase_activity THEN NULL ELSE now() END
    WHERE customer_source_id = NEW.source_id
      AND status IN ('active', 'hidden');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_community_activity_privacy_sync ON pos.customers;
CREATE TRIGGER customer_community_activity_privacy_sync
AFTER UPDATE OF share_purchase_activity, purchase_activity_name_mode, name ON pos.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_community_activity_privacy();

COMMENT ON TABLE public.customer_community_activity_events IS
  'Server-created, consented, settled customer purchase activity for Community; no browser writes.';
COMMENT ON COLUMN pos.customers.share_purchase_activity IS
  'Explicit consent to show the customer name in Community purchase activity.';
COMMENT ON COLUMN pos.customers.purchase_activity_name_mode IS
  'Real profile-name projection: first_name or full_name.';
