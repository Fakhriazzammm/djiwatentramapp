-- Transition dual-write: mirror legacy inventory transaction writes into the
-- base-unit movement ledger for READY items only.
-- This preserves legacy callers while adding an auditable, idempotent ledger.

CREATE OR REPLACE FUNCTION pos.mirror_inventory_transaction_to_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_inventory pos.inventory%ROWTYPE;
  v_movement_type text;
  v_direction text;
  v_quantity numeric;
  v_source_type text;
  v_before numeric;
  v_after numeric;
  v_movement_id text;
BEGIN
  IF NEW.tx_type IN ('costing_reference', 'stock_opname_final') AND NEW.quantity = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_inventory
  FROM pos.inventory i
  WHERE i.source_id = NEW.inventory_source_id;

  IF NOT FOUND OR COALESCE(v_inventory.unit_status, 'AMBIGUOUS') <> 'READY'
     OR NULLIF(btrim(v_inventory.base_unit), '') IS NULL THEN
    RETURN NEW;
  END IF;

  v_after := COALESCE(v_inventory.quantity, 0);
  v_quantity := abs(COALESCE(NEW.quantity, 0));
  v_before := CASE
    WHEN NEW.tx_type = 'stock_opname_final' THEN v_after - NEW.quantity
    ELSE v_after - NEW.quantity
  END;

  IF NEW.tx_type IN ('add', 'restock', 'purchase', 'production') AND NEW.quantity >= 0 THEN
    v_movement_type := 'purchase';
    v_direction := 'in';
    v_source_type := 'inventory_transaction';
  ELSIF NEW.tx_type = 'usage' AND NEW.quantity < 0 THEN
    v_movement_type := CASE
      WHEN COALESCE(NEW.raw->>'orderId', NEW.raw->>'order_id', '') <> '' THEN 'sale_usage'
      ELSE 'adjustment'
    END;
    v_direction := 'out';
    v_source_type := CASE
      WHEN v_movement_type = 'sale_usage' THEN 'order'
      ELSE 'inventory_transaction'
    END;
  ELSIF NEW.tx_type IN ('stock_opname_final', 'adjust') THEN
    v_movement_type := 'adjustment';
    v_direction := 'set';
    v_source_type := 'stock_opname';
  ELSE
    RETURN NEW;
  END IF;

  v_movement_id := 'invtx_mirror_' || md5(NEW.source_id);
  INSERT INTO pos.inventory_movements (
    source_id, inventory_source_id, movement_type, direction,
    quantity_base, unit_base, before_quantity, after_quantity,
    cost_per_base_unit, source_type, source_reference_id,
    actor_id, notes, raw
  ) VALUES (
    v_movement_id, NEW.inventory_source_id, v_movement_type, v_direction,
    v_quantity, v_inventory.base_unit, v_before, v_after,
    NEW.cost_per_unit, v_source_type, NEW.source_id,
    NULL, NEW.notes, COALESCE(NEW.raw, '{}'::jsonb) || jsonb_build_object('mirroredFromInventoryTransaction', NEW.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_inventory_transaction_to_movement
  ON pos.inventory_transactions;
CREATE TRIGGER trg_mirror_inventory_transaction_to_movement
AFTER INSERT ON pos.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION pos.mirror_inventory_transaction_to_movement();

REVOKE ALL ON FUNCTION pos.mirror_inventory_transaction_to_movement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.mirror_inventory_transaction_to_movement() TO service_role;
