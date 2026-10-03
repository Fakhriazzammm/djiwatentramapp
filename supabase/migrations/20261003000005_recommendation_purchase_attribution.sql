-- Attribute a settled member order to prior recommendation interactions.
-- Guest orders are intentionally excluded because no ownership-safe customer key exists.
CREATE OR REPLACE FUNCTION pos.attribute_product_recommendation_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) NOT IN ('paid','completed','settled') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.status, '')) IN ('paid','completed','settled') THEN RETURN NEW; END IF;
  IF NULLIF(trim(coalesce(NEW.customer_source_id, '')), '') IS NULL THEN RETURN NEW; END IF;

  INSERT INTO pos.product_recommendation_events (
    event_key, event_type, product_source_id, recommended_product_source_id,
    strategy, placement, customer_source_id, session_id, metadata, occurred_at
  )
  SELECT
    left('purchase:' || NEW.source_id || ':' || oi.product_source_id || ':' || e.id::text, 128),
    'purchase',
    e.product_source_id,
    oi.product_source_id,
    'purchase_attribution',
    'settled_order',
    NEW.customer_source_id,
    e.session_id,
    jsonb_build_object('orderSourceId', NEW.source_id, 'sourceEventId', e.id),
    now()
  FROM pos.order_items oi
  JOIN pos.product_recommendation_events e
    ON e.recommended_product_source_id = oi.product_source_id
   AND e.customer_source_id = NEW.customer_source_id
   AND e.event_type IN ('click', 'add_to_cart')
   AND e.occurred_at >= now() - interval '24 hours'
  WHERE oi.order_source_id = NEW.source_id
    AND oi.status IS DISTINCT FROM 'cancelled'
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attribute_product_recommendation_purchase ON pos.orders;
CREATE TRIGGER trg_attribute_product_recommendation_purchase
AFTER INSERT OR UPDATE OF status ON pos.orders
FOR EACH ROW
WHEN (NEW.status IN ('paid','completed','settled'))
EXECUTE FUNCTION pos.attribute_product_recommendation_purchase();

REVOKE ALL ON FUNCTION pos.attribute_product_recommendation_purchase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pos.attribute_product_recommendation_purchase() TO service_role;
