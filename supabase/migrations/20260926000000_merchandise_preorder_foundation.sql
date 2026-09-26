-- Merchandise preorder foundation.
-- Additive only: no F&B data is changed and this migration is not applied by this task.
-- A paid order is only a confirmed reservation; fulfillment remains a separate lifecycle.

CREATE SCHEMA IF NOT EXISTS pos;

CREATE TABLE IF NOT EXISTS pos.merchandise_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_source_id text NOT NULL REFERENCES pos.products(source_id),
  lifecycle text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'scheduled', 'open', 'paused', 'closed')),
  sale_window_start timestamptz NOT NULL,
  sale_window_end timestamptz NOT NULL,
  expected_dispatch_start date NOT NULL,
  expected_dispatch_end date NOT NULL,
  capacity numeric(18,4) CHECK (capacity IS NULL OR capacity > 0),
  max_per_customer numeric(18,4) CHECK (max_per_customer IS NULL OR max_per_customer > 0),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (sale_window_end > sale_window_start),
  CHECK (expected_dispatch_end >= expected_dispatch_start),
  UNIQUE (id)
);

CREATE INDEX IF NOT EXISTS ix_merchandise_campaigns_product_lifecycle
  ON pos.merchandise_campaigns (product_source_id, lifecycle);
CREATE INDEX IF NOT EXISTS ix_merchandise_campaigns_sale_window
  ON pos.merchandise_campaigns (sale_window_start, sale_window_end);
CREATE UNIQUE INDEX IF NOT EXISTS ux_merchandise_campaigns_one_open_product
  ON pos.merchandise_campaigns (product_source_id)
  WHERE lifecycle = 'open';

-- Campaigns must point to the Merchandise root or one of its descendants.
CREATE OR REPLACE FUNCTION pos.validate_merchandise_campaign_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NOT EXISTS (
    WITH RECURSIVE merchandise_categories AS (
      SELECT source_id FROM pos.categories
      WHERE name = 'Merchandise' AND parent_source_id IS NULL
      UNION ALL
      SELECT c.source_id FROM pos.categories c
      JOIN merchandise_categories parent ON parent.source_id = c.parent_source_id
    )
    SELECT 1
    FROM pos.products p
    JOIN merchandise_categories mc ON mc.source_id = p.category_source_id
    WHERE p.source_id = NEW.product_source_id
  ) THEN
    RAISE EXCEPTION 'Campaign product must belong to Merchandise or a recursive Merchandise descendant';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.product_source_id IS DISTINCT FROM OLD.product_source_id AND EXISTS (
      SELECT 1 FROM pos.merchandise_reservations r WHERE r.campaign_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Campaign product cannot change after a reservation exists';
    END IF;
    IF NEW.capacity IS NOT NULL AND NEW.capacity < coalesce((
      SELECT sum(r.quantity) FROM pos.merchandise_reservations r
      WHERE r.campaign_id = OLD.id AND r.status IN ('held', 'confirmed')
    ), 0) THEN
      RAISE EXCEPTION 'Campaign capacity cannot be below active reservations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_merchandise_campaign_product'
      AND tgrelid = 'pos.merchandise_campaigns'::regclass
  ) THEN
    CREATE TRIGGER trg_validate_merchandise_campaign_product
      BEFORE INSERT OR UPDATE OF product_source_id, capacity ON pos.merchandise_campaigns
      FOR EACH ROW EXECUTE FUNCTION pos.validate_merchandise_campaign_product();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS pos.merchandise_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pos.merchandise_campaigns(id),
  order_source_id text NOT NULL REFERENCES pos.orders(source_id),
  line_no integer NOT NULL,
  product_source_id text NOT NULL REFERENCES pos.products(source_id),
  customer_key text,
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'confirmed', 'released', 'expired')),
  fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'preparing', 'ready_to_ship', 'shipped', 'completed', 'cancelled')),
  expected_dispatch_start date NOT NULL,
  expected_dispatch_end date NOT NULL,
  held_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  released_at timestamptz,
  tracking_carrier text,
  tracking_number text,
  shipped_at timestamptz,
  completed_at timestamptz,
  updated_by text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (order_source_id, line_no),
  FOREIGN KEY (order_source_id, line_no)
    REFERENCES pos.order_items(order_source_id, line_no),
  CHECK (status <> 'held' OR expires_at > held_at),
  CHECK (status <> 'confirmed' OR confirmed_at IS NOT NULL),
  CHECK (status <> 'released' OR released_at IS NOT NULL),
  CHECK (expected_dispatch_end >= expected_dispatch_start)
);
CREATE INDEX IF NOT EXISTS ix_merchandise_reservations_campaign_status
  ON pos.merchandise_reservations (campaign_id, status, expires_at);
CREATE INDEX IF NOT EXISTS ix_merchandise_reservations_order
  ON pos.merchandise_reservations (order_source_id, line_no);
CREATE INDEX IF NOT EXISTS ix_merchandise_reservations_customer
  ON pos.merchandise_reservations (campaign_id, customer_key, status);

CREATE TABLE IF NOT EXISTS pos.merchandise_fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES pos.merchandise_reservations(id),
  order_source_id text NOT NULL REFERENCES pos.orders(source_id),
  event_type text NOT NULL CHECK (event_type IN ('status_changed', 'tracking_updated')),
  actor_source_id text NOT NULL,
  previous_status text,
  next_status text NOT NULL,
  tracking_carrier text,
  tracking_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_merchandise_fulfillment_events_reservation
  ON pos.merchandise_fulfillment_events (reservation_id, created_at);

CREATE OR REPLACE FUNCTION pos.guard_merchandise_fulfillment_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.fulfillment_status IS NOT DISTINCT FROM OLD.fulfillment_status THEN RETURN NEW; END IF;
  IF NEW.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only paid preorder reservations can change fulfillment';
  END IF;
  IF NOT (
    (OLD.fulfillment_status = 'pending' AND NEW.fulfillment_status = 'preparing') OR
    (OLD.fulfillment_status = 'preparing' AND NEW.fulfillment_status = 'ready_to_ship') OR
    (OLD.fulfillment_status = 'ready_to_ship' AND NEW.fulfillment_status = 'shipped') OR
    (OLD.fulfillment_status = 'shipped' AND NEW.fulfillment_status = 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid Merchandise fulfillment transition';
  END IF;
  IF NEW.fulfillment_status = 'shipped'
     AND (btrim(coalesce(NEW.tracking_carrier, '')) = '' OR btrim(coalesce(NEW.tracking_number, '')) = '') THEN
    RAISE EXCEPTION 'Tracking carrier and number are required when shipped';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION pos.record_merchandise_fulfillment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_event_type text;
BEGIN
  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status THEN
    v_event_type := 'status_changed';
  ELSIF OLD.tracking_carrier IS DISTINCT FROM NEW.tracking_carrier
     OR OLD.tracking_number IS DISTINCT FROM NEW.tracking_number THEN
    v_event_type := 'tracking_updated';
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO pos.merchandise_fulfillment_events (
    reservation_id, order_source_id, event_type, actor_source_id, previous_status,
    next_status, tracking_carrier, tracking_number
  ) VALUES (
    NEW.id, NEW.order_source_id, v_event_type, coalesce(NEW.updated_by, 'system'),
    OLD.fulfillment_status, NEW.fulfillment_status, NEW.tracking_carrier, NEW.tracking_number
  );
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS pos.merchandise_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES pos.merchandise_reservations(id),
  order_source_id text NOT NULL REFERENCES pos.orders(source_id),
  requested_by text NOT NULL,
  request_reason text NOT NULL CHECK (btrim(request_reason) <> ''),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'processed')),
  reviewed_by text,
  reviewed_at timestamptz,
  decision_reason text,
  refund_reference text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (status = 'pending' OR (
    reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
    AND btrim(coalesce(decision_reason, '')) <> ''
  )),
  CHECK (status <> 'processed' OR (refund_reference IS NOT NULL AND processed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_merchandise_refund_requests_reservation
  ON pos.merchandise_refund_requests (reservation_id, created_at);
CREATE INDEX IF NOT EXISTS ix_merchandise_refund_requests_status
  ON pos.merchandise_refund_requests (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_merchandise_refund_request_active_reservation
  ON pos.merchandise_refund_requests (reservation_id)
  WHERE status IN ('pending', 'approved', 'processed');

-- Append-only review history preserves the case-by-case decision trail.
CREATE TABLE IF NOT EXISTS pos.merchandise_refund_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id uuid NOT NULL REFERENCES pos.merchandise_refund_requests(id),
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'denied', 'processed', 'voided')),
  actor_source_id text NOT NULL,
  decision_reason text,
  refund_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_merchandise_refund_review_events_request
  ON pos.merchandise_refund_review_events (refund_request_id, created_at);

CREATE OR REPLACE FUNCTION pos.record_merchandise_refund_review_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'requested';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_event_type := CASE NEW.status
      WHEN 'approved' THEN 'approved'
      WHEN 'denied' THEN 'denied'
      WHEN 'processed' THEN 'processed'
      ELSE 'voided'
    END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO pos.merchandise_refund_review_events (
    refund_request_id, event_type, actor_source_id, decision_reason, refund_reference
  ) VALUES (
    NEW.id, v_event_type, coalesce(NEW.reviewed_by, NEW.requested_by),
    NEW.decision_reason, NEW.refund_reference
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION pos.prevent_merchandise_refund_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  RAISE EXCEPTION 'Merchandise refund review events are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION pos.prevent_merchandise_fulfillment_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  RAISE EXCEPTION 'Merchandise fulfillment events are append-only';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_merchandise_fulfillment_transition'
      AND tgrelid = 'pos.merchandise_reservations'::regclass
  ) THEN
    CREATE TRIGGER trg_guard_merchandise_fulfillment_transition
      BEFORE UPDATE OF fulfillment_status ON pos.merchandise_reservations
      FOR EACH ROW EXECUTE FUNCTION pos.guard_merchandise_fulfillment_transition();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_record_merchandise_fulfillment_event'
      AND tgrelid = 'pos.merchandise_reservations'::regclass
  ) THEN
    CREATE TRIGGER trg_record_merchandise_fulfillment_event
      AFTER UPDATE OF fulfillment_status, tracking_carrier, tracking_number ON pos.merchandise_reservations
      FOR EACH ROW EXECUTE FUNCTION pos.record_merchandise_fulfillment_event();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_merchandise_fulfillment_event_mutation'
      AND tgrelid = 'pos.merchandise_fulfillment_events'::regclass
  ) THEN
    CREATE TRIGGER trg_prevent_merchandise_fulfillment_event_mutation
      BEFORE UPDATE OR DELETE ON pos.merchandise_fulfillment_events
      FOR EACH ROW EXECUTE FUNCTION pos.prevent_merchandise_fulfillment_event_mutation();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_record_merchandise_refund_review_event'
      AND tgrelid = 'pos.merchandise_refund_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_record_merchandise_refund_review_event
      AFTER INSERT OR UPDATE OF status ON pos.merchandise_refund_requests
      FOR EACH ROW EXECUTE FUNCTION pos.record_merchandise_refund_review_event();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_merchandise_refund_event_mutation'
      AND tgrelid = 'pos.merchandise_refund_review_events'::regclass
  ) THEN
    CREATE TRIGGER trg_prevent_merchandise_refund_event_mutation
      BEFORE UPDATE OR DELETE ON pos.merchandise_refund_review_events
      FOR EACH ROW EXECUTE FUNCTION pos.prevent_merchandise_refund_event_mutation();
  END IF;
END;
$$;

CREATE OR REPLACE VIEW pos.merchandise_campaign_public AS
SELECT c.id, c.product_source_id, p.name AS product_name, c.lifecycle,
       c.sale_window_start, c.sale_window_end,
       c.expected_dispatch_start, c.expected_dispatch_end
FROM pos.merchandise_campaigns c
JOIN pos.products p ON p.source_id = c.product_source_id
WHERE c.lifecycle IN ('scheduled', 'open', 'paused', 'closed');

-- Parse common Mayar/Djiwa Pay invoice expiry fields without trusting browser input.
CREATE OR REPLACE FUNCTION pos.merchandise_invoice_expiry(p_gateway jsonb)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v text; n numeric;
BEGIN
  v := COALESCE(p_gateway->>'expiresAt', p_gateway->>'expiry', p_gateway->>'expiredAt', p_gateway->>'expiration');
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  IF v ~ '^[0-9]+(\.[0-9]+)?$' THEN
    n := v::numeric;
    IF n > 100000000000 THEN n := n / 1000; END IF;
    RETURN to_timestamp(n);
  END IF;
  BEGIN RETURN v::timestamptz; EXCEPTION WHEN others THEN RETURN NULL; END;
END;
$$;

CREATE OR REPLACE FUNCTION pos.reserve_merchandise_preorder(
  p_order_source_id text,
  p_line_no integer,
  p_hold_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_item pos.order_items;
  v_product pos.products;
  v_campaign pos.merchandise_campaigns;
  v_existing pos.merchandise_reservations;
  v_customer_key text;
  v_invoice_expiry timestamptz;
  v_expires_at timestamptz;
  v_used numeric(18,4);
  v_customer_used numeric(18,4);
  v_merchandise boolean;
  v_reopen_existing boolean := false;
BEGIN
  IF coalesce(btrim(p_order_source_id), '') = '' OR p_line_no IS NULL THEN
    RAISE EXCEPTION 'Order and line are required';
  END IF;
  SELECT * INTO v_order FROM pos.orders WHERE source_id = p_order_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF lower(coalesce(v_order.brand_slug, '')) <> 'merchandise'
     OR coalesce(v_order.source, '') <> 'customer_self_service' THEN
    RAISE EXCEPTION 'Only customer_self_service Merchandise orders may reserve preorder items';
  END IF;
  IF lower(coalesce(v_order.status, '')) NOT IN ('pending', 'created') THEN
    RAISE EXCEPTION 'Only unpaid pending Merchandise orders may reserve preorder items';
  END IF;
  IF lower(coalesce(v_order.payment_method, '')) NOT IN ('qris', 'mayar', 'wallet', 'djiwa_pay') THEN
    RAISE EXCEPTION 'Merchandise preorder requires Mayar QRIS or Djiwa Pay';
  END IF;
  SELECT * INTO v_item FROM pos.order_items
  WHERE order_source_id = p_order_source_id AND line_no = p_line_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line not found'; END IF;
  SELECT * INTO v_product FROM pos.products WHERE source_id = v_item.product_source_id;
  IF NOT FOUND OR NOT v_product.is_available THEN RAISE EXCEPTION 'Product is unavailable'; END IF;

  WITH RECURSIVE merchandise_categories AS (
    SELECT source_id FROM pos.categories WHERE name = 'Merchandise' AND parent_source_id IS NULL
    UNION ALL SELECT c.source_id FROM pos.categories c
      JOIN merchandise_categories p ON p.source_id = c.parent_source_id
  )
  SELECT EXISTS (SELECT 1 FROM merchandise_categories WHERE source_id = v_product.category_source_id)
  INTO v_merchandise;
  IF NOT v_merchandise THEN RAISE EXCEPTION 'Product is not in the Merchandise category tree'; END IF;
  IF coalesce(v_item.product_source_id, '') = '' THEN RAISE EXCEPTION 'Order line has no product'; END IF;
  IF v_product.variations IS NOT NULL
     AND v_product.variations NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb) THEN
    RAISE EXCEPTION 'Product variations cannot be priced safely by this reservation RPC';
  END IF;
  IF v_item.price IS DISTINCT FROM v_product.price THEN
    RAISE EXCEPTION 'Order line price does not match the canonical product price';
  END IF;
  IF v_item.quantity <= 0 THEN RAISE EXCEPTION 'Reservation quantity must be positive'; END IF;

  v_invoice_expiry := coalesce(p_hold_expires_at, pos.merchandise_invoice_expiry(v_order.payment_gateway));
  IF p_hold_expires_at IS NOT NULL AND p_hold_expires_at > now() + interval '24 hours 1 minute' THEN
    RAISE EXCEPTION 'Requested preorder hold exceeds the maximum invoice duration';
  END IF;
  v_expires_at := least(
    now() + CASE WHEN lower(coalesce(v_order.payment_method, '')) = 'wallet'
      THEN interval '30 minutes' ELSE interval '24 hours' END,
    coalesce(v_invoice_expiry,
      now() + CASE WHEN lower(coalesce(v_order.payment_method, '')) = 'wallet'
        THEN interval '30 minutes' ELSE interval '24 hours' END)
  );
  IF v_expires_at <= now() THEN RAISE EXCEPTION 'Payment invoice has expired'; END IF;

  SELECT * INTO v_existing FROM pos.merchandise_reservations
  WHERE order_source_id = p_order_source_id AND line_no = p_line_no
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'held' AND v_existing.expires_at > now() THEN
      IF v_expires_at > v_existing.expires_at THEN
        UPDATE pos.merchandise_reservations SET expires_at = v_expires_at
        WHERE id = v_existing.id AND status = 'held';
      END IF;
      RETURN jsonb_build_object('ok', true, 'deduplicated', true, 'reservation_id', v_existing.id, 'status', v_existing.status, 'expires_at', greatest(v_existing.expires_at, v_expires_at));
    ELSIF v_existing.status = 'held'
      AND p_hold_expires_at > now()
      AND lower(coalesce(v_order.payment_gateway->>'status', '')) = 'replacement_pending' THEN
      UPDATE pos.merchandise_reservations SET expires_at = v_expires_at
      WHERE id = v_existing.id AND status = 'held';
      RETURN jsonb_build_object('ok', true, 'deduplicated', true, 'reservation_id', v_existing.id, 'status', 'held', 'expires_at', v_expires_at);
    ELSIF v_existing.status = 'held' THEN
      RAISE EXCEPTION 'Preorder hold has elapsed; verify provider status before retrying payment';
    ELSIF v_existing.status = 'confirmed' THEN
      RETURN jsonb_build_object('ok', true, 'deduplicated', true, 'reservation_id', v_existing.id, 'status', v_existing.status);
    ELSIF v_existing.status = 'expired'
      AND p_hold_expires_at > now()
      AND lower(coalesce(v_order.payment_gateway->>'status', '')) IN ('expired', 'cancelled', 'canceled', 'void') THEN
      v_reopen_existing := true;
    ELSE
      RAISE EXCEPTION 'Preorder reservation cannot be retried until its current provider invoice is verified final';
    END IF;
  END IF;

  SELECT * INTO v_campaign FROM pos.merchandise_campaigns
  WHERE product_source_id = v_item.product_source_id
    AND lifecycle = 'open' AND now() >= sale_window_start AND now() < sale_window_end
  ORDER BY sale_window_start DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open Merchandise campaign for this product'; END IF;

  v_customer_key := coalesce(
    to_jsonb(v_order)->>'customer_source_id',
    v_order.raw->>'customerSourceId', v_order.raw->>'customer_source_id', v_order.raw->>'customerId');
  IF v_campaign.max_per_customer IS NOT NULL AND coalesce(btrim(v_customer_key), '') = '' THEN
    RAISE EXCEPTION 'Customer identity is required for this campaign limit';
  END IF;

  SELECT coalesce(sum(quantity), 0) INTO v_used FROM pos.merchandise_reservations
  WHERE campaign_id = v_campaign.id AND status IN ('held', 'confirmed');
  IF v_campaign.capacity IS NOT NULL AND v_used + v_item.quantity > v_campaign.capacity THEN
    RAISE EXCEPTION 'Campaign capacity exceeded';
  END IF;
  IF v_campaign.max_per_customer IS NOT NULL THEN
    SELECT coalesce(sum(quantity), 0) INTO v_customer_used FROM pos.merchandise_reservations
    WHERE campaign_id = v_campaign.id AND customer_key = v_customer_key
      AND status IN ('held', 'confirmed');
    IF v_customer_used + v_item.quantity > v_campaign.max_per_customer THEN
      RAISE EXCEPTION 'Per-customer campaign limit exceeded';
    END IF;
  END IF;
  INSERT INTO pos.merchandise_reservations (
    campaign_id, order_source_id, line_no, product_source_id, customer_key, quantity,
    expected_dispatch_start, expected_dispatch_end, expires_at
  ) VALUES (
    v_campaign.id, p_order_source_id, p_line_no, v_item.product_source_id, v_customer_key,
    v_item.quantity, v_campaign.expected_dispatch_start, v_campaign.expected_dispatch_end, v_expires_at
  )
  ON CONFLICT (order_source_id, line_no) DO UPDATE SET
    campaign_id = excluded.campaign_id, product_source_id = excluded.product_source_id,
    customer_key = excluded.customer_key, quantity = excluded.quantity,
    expected_dispatch_start = excluded.expected_dispatch_start,
    expected_dispatch_end = excluded.expected_dispatch_end,
    status = 'held', fulfillment_status = 'pending', held_at = now(), expires_at = excluded.expires_at,
    confirmed_at = NULL, released_at = NULL;
  IF v_reopen_existing THEN
    UPDATE pos.orders
    SET payment_gateway = (coalesce(payment_gateway, '{}'::jsonb) - 'invoiceId' - 'transactionId' - 'invoiceUrl')
      || jsonb_build_object(
        'status', 'replacement_pending',
        'replacementAt', now(),
        'previousInvoices', coalesce(payment_gateway->'previousInvoices', '[]'::jsonb)
          || CASE WHEN coalesce(payment_gateway->>'invoiceId', '') <> '' THEN jsonb_build_array(jsonb_build_object(
            'invoiceId', payment_gateway->>'invoiceId',
            'transactionId', payment_gateway->>'transactionId',
            'status', payment_gateway->>'status',
            'verifiedAt', payment_gateway->>'providerStatusVerifiedAt'
          )) ELSE '[]'::jsonb END
      )
    WHERE source_id = p_order_source_id;
  END IF;
  UPDATE pos.orders
  SET receipt_meta = jsonb_set(
    coalesce(receipt_meta, '{}'::jsonb),
    '{merchandiseDispatchEstimates}',
    coalesce(receipt_meta->'merchandiseDispatchEstimates', '{}'::jsonb)
      || jsonb_build_object(v_item.product_source_id, jsonb_build_object(
        'start', v_campaign.expected_dispatch_start,
        'end', v_campaign.expected_dispatch_end
      )),
    true
  )
  WHERE source_id = p_order_source_id;
  SELECT * INTO v_existing FROM pos.merchandise_reservations WHERE order_source_id = p_order_source_id AND line_no = p_line_no;
  RETURN jsonb_build_object('ok', true, 'deduplicated', false, 'reservation_id', v_existing.id, 'status', v_existing.status, 'expires_at', v_existing.expires_at);
END;
$$;

-- Reserve every non-cancelled line in one PostgREST transaction. An exception on any
-- product/capacity check rolls the whole order reservation back, avoiding partial holds.
CREATE OR REPLACE FUNCTION pos.reserve_merchandise_preorder_order(
  p_order_source_id text,
  p_hold_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_line record;
  v_count integer := 0;
BEGIN
  IF coalesce(btrim(p_order_source_id), '') = '' THEN
    RAISE EXCEPTION 'Order is required';
  END IF;
  FOR v_line IN
    SELECT line_no FROM pos.order_items
    WHERE order_source_id = p_order_source_id
      AND coalesce(status, '') <> 'cancelled' AND quantity > 0
    ORDER BY line_no
  LOOP
    PERFORM pos.reserve_merchandise_preorder(p_order_source_id, v_line.line_no, p_hold_expires_at);
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'Merchandise order has no reservable items'; END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_source_id, 'reserved_lines', v_count);
END;
$$;

-- Call only after a trusted server-side provider lookup confirms the invoice can no longer settle.
-- Expiry timestamps alone never free capacity: a late payment must not become paid without a hold.
CREATE OR REPLACE FUNCTION pos.release_expired_merchandise_preorder(
  p_order_source_id text,
  p_verified_provider_status text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE
  v_order pos.orders;
  v_provider_status text := lower(coalesce(btrim(p_verified_provider_status), ''));
  v_invoice_expiry timestamptz;
  v_released integer;
BEGIN
  IF v_provider_status NOT IN ('expired', 'cancelled', 'canceled', 'void') THEN
    RAISE EXCEPTION 'Provider status must confirm an invoice that cannot settle';
  END IF;
  SELECT * INTO v_order FROM pos.orders WHERE source_id = p_order_source_id FOR UPDATE;
  IF NOT FOUND OR lower(coalesce(v_order.brand_slug, '')) <> 'merchandise'
     OR coalesce(v_order.source, '') <> 'customer_self_service' THEN
    RAISE EXCEPTION 'Merchandise self-service order not found';
  END IF;
  IF lower(coalesce(v_order.status, '')) NOT IN ('pending', 'cancelled', 'canceled') THEN
    RAISE EXCEPTION 'Only unpaid Merchandise orders can release preorder holds';
  END IF;
  v_invoice_expiry := pos.merchandise_invoice_expiry(v_order.payment_gateway);
  IF v_invoice_expiry IS NULL OR v_invoice_expiry > now() THEN
    RAISE EXCEPTION 'Invoice has no verified elapsed expiry';
  END IF;

  UPDATE pos.merchandise_reservations
  SET status = 'expired', released_at = coalesce(released_at, now())
  WHERE order_source_id = p_order_source_id AND status = 'held' AND expires_at <= now();
  GET DIAGNOSTICS v_released = ROW_COUNT;
  UPDATE pos.orders
  SET payment_gateway = coalesce(payment_gateway, '{}'::jsonb)
    || jsonb_build_object('status', v_provider_status, 'providerStatusVerifiedAt', now())
  WHERE source_id = p_order_source_id;
  RETURN v_released;
END;
$$;

-- Prevent a verified payment event from settling after the hold elapsed or was released.
CREATE OR REPLACE FUNCTION pos.guard_merchandise_payment_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF lower(coalesce(NEW.brand_slug, '')) = 'merchandise'
     AND NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM pos.order_items i
      WHERE i.order_source_id = NEW.source_id
        AND coalesce(i.status, '') <> 'cancelled' AND i.quantity > 0
    ) OR EXISTS (
      SELECT 1 FROM pos.order_items i
      WHERE i.order_source_id = NEW.source_id
        AND coalesce(i.status, '') <> 'cancelled' AND i.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM pos.merchandise_reservations r
          WHERE r.order_source_id = i.order_source_id AND r.line_no = i.line_no
            AND r.product_source_id = i.product_source_id AND r.quantity = i.quantity
            AND r.status = 'held' AND r.expires_at > now()
        )
    ) THEN
      RAISE EXCEPTION 'Merchandise order cannot settle without an active matching preorder reservation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Payment/cancellation integration is intentionally narrow: it never marks fulfillment complete.
CREATE OR REPLACE FUNCTION pos.sync_merchandise_reservations_for_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE pos.merchandise_reservations SET status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), expires_at = coalesce(expires_at, now())
    WHERE order_source_id = NEW.source_id AND status = 'held';
  ELSIF lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled', 'void')
        AND OLD.status IS DISTINCT FROM NEW.status
        AND lower(coalesce(NEW.brand_slug, '')) = 'merchandise'
        AND lower(coalesce(NEW.payment_method, '')) IN ('wallet', 'djiwa_pay') THEN
    UPDATE pos.merchandise_reservations SET status = 'released', released_at = coalesce(released_at, now())
    WHERE order_source_id = NEW.source_id AND status = 'held';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_merchandise_payment_confirmation'
      AND tgrelid = 'pos.orders'::regclass
  ) THEN
    CREATE TRIGGER trg_guard_merchandise_payment_confirmation
      BEFORE UPDATE OF status ON pos.orders FOR EACH ROW
      EXECUTE FUNCTION pos.guard_merchandise_payment_confirmation();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_merchandise_reservations_for_order'
      AND tgrelid = 'pos.orders'::regclass
  ) THEN
    CREATE TRIGGER trg_sync_merchandise_reservations_for_order
      AFTER UPDATE OF status ON pos.orders FOR EACH ROW
      EXECUTE FUNCTION pos.sync_merchandise_reservations_for_order();
  END IF;
END;
$$;

ALTER TABLE pos.merchandise_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_refund_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_refund_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_refund_review_events FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.merchandise_fulfillment_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE pos.merchandise_campaigns, pos.merchandise_reservations,
  pos.merchandise_refund_requests, pos.merchandise_refund_review_events,
  pos.merchandise_fulfillment_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON pos.merchandise_campaign_public TO anon, authenticated, service_role;
GRANT ALL ON TABLE pos.merchandise_campaigns, pos.merchandise_reservations,
  pos.merchandise_refund_requests, pos.merchandise_refund_review_events,
  pos.merchandise_fulfillment_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE pos.merchandise_refund_review_events,
  pos.merchandise_fulfillment_events FROM service_role;
REVOKE ALL ON FUNCTION pos.reserve_merchandise_preorder(text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.reserve_merchandise_preorder_order(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.release_expired_merchandise_preorder(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.merchandise_invoice_expiry(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.validate_merchandise_campaign_product() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.record_merchandise_refund_review_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.prevent_merchandise_refund_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.sync_merchandise_reservations_for_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.guard_merchandise_payment_confirmation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.guard_merchandise_fulfillment_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.record_merchandise_fulfillment_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pos.prevent_merchandise_fulfillment_event_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.reserve_merchandise_preorder(text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION pos.reserve_merchandise_preorder_order(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION pos.release_expired_merchandise_preorder(text, text) TO service_role;
GRANT USAGE ON SCHEMA pos TO anon, authenticated, service_role;
