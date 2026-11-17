-- Keep the customer aggregate columns consistent with the settled customer order set.
-- The admin customer page reads these fields as its base projection and enriches
-- them through the protected admin order read when a staff session is present.

BEGIN;

CREATE OR REPLACE FUNCTION pos.sync_customer_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, pg_catalog
AS $$
DECLARE
  v_customer_id text;
  v_customer_ids text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_customer_ids := array_append(v_customer_ids, NULLIF(btrim(OLD.customer_source_id), ''));
  END IF;
  v_customer_ids := array_append(v_customer_ids, NULLIF(btrim(NEW.customer_source_id), ''));

  FOR v_customer_id IN
    SELECT DISTINCT customer_id
    FROM unnest(v_customer_ids) AS ids(customer_id)
    WHERE customer_id IS NOT NULL
  LOOP
    UPDATE pos.customers AS c
    SET
      total_orders = aggregates.order_count,
      total_spent = aggregates.total_spent,
      last_order_at = aggregates.last_order_at,
      updated_at = now()
    FROM (
      SELECT
        count(*)::integer AS order_count,
        coalesce(sum(o.total_amount), 0)::numeric(12, 0) AS total_spent,
        max(to_timestamp(NULLIF(coalesce(o.created_at, o.creation_time), 0) / 1000.0)) AS last_order_at
      FROM pos.orders AS o
      WHERE o.customer_source_id = v_customer_id
        AND o.status IN ('paid', 'completed')
        AND o.source IN ('customer_self_service', 'ordermieyamin_b2b')
    ) AS aggregates
    WHERE c.source_id = v_customer_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_order_totals ON pos.orders;
CREATE TRIGGER trg_sync_customer_order_totals
AFTER INSERT OR UPDATE OF status, total_amount, customer_source_id, created_at, creation_time, source
ON pos.orders
FOR EACH ROW
EXECUTE FUNCTION pos.sync_customer_order_totals();

REVOKE ALL ON FUNCTION pos.sync_customer_order_totals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.sync_customer_order_totals() TO anon, authenticated, service_role;

-- Bounded one-time repair for the current customer set. Future writes are kept
-- correct by the trigger above, so this statement is safe to rerun.
WITH aggregates AS (
  SELECT
    c.source_id,
    count(o.source_id)::integer AS order_count,
    coalesce(sum(o.total_amount), 0)::numeric(12, 0) AS total_spent,
    max(to_timestamp(NULLIF(coalesce(o.created_at, o.creation_time), 0) / 1000.0)) AS last_order_at
  FROM pos.customers AS c
  LEFT JOIN pos.orders AS o
    ON o.customer_source_id = c.source_id
   AND o.status IN ('paid', 'completed')
   AND o.source IN ('customer_self_service', 'ordermieyamin_b2b')
  GROUP BY c.source_id
)
UPDATE pos.customers AS c
SET
  total_orders = aggregates.order_count,
  total_spent = aggregates.total_spent,
  last_order_at = aggregates.last_order_at,
  updated_at = now()
FROM aggregates
WHERE c.source_id = aggregates.source_id;

COMMIT;
