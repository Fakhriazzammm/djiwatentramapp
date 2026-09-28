-- Fix: customer activity trigger must choose the payload field by relation OID.
-- TG_TABLE_NAME can be schema/view-dependent; using it caused order inserts to
-- read NEW.order_source_id from pos.orders, which does not have that column.
CREATE OR REPLACE FUNCTION public.try_create_customer_community_purchase_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
BEGIN
  IF TG_RELID = 'pos.orders'::regclass THEN
    PERFORM public.create_customer_community_purchase_activity(NEW.source_id);
  ELSE
    PERFORM public.create_customer_community_purchase_activity(NEW.order_source_id);
  END IF;
  RETURN NEW;
END;
$$;
