-- Additive, disabled-by-default inventory movement RPC.
-- The function is not called by legacy flows until unit_status is READY.

CREATE OR REPLACE FUNCTION pos.record_inventory_movement(
  p_source_id text,
  p_inventory_source_id text,
  p_movement_type text,
  p_direction text,
  p_quantity_base numeric,
  p_unit_base text,
  p_source_type text,
  p_source_reference_id text,
  p_actor_id text DEFAULT NULL,
  p_cost_per_base_unit numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_raw jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  movement_source_id text,
  inventory_source_id text,
  before_quantity numeric,
  after_quantity numeric,
  inserted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pos, public
AS $$
DECLARE
  v_before numeric;
  v_after numeric;
  v_base_unit text;
  v_status text;
  v_row_count integer := 0;
BEGIN
  IF p_source_id IS NULL OR p_source_id = '' THEN
    RAISE EXCEPTION 'movement source_id wajib diisi';
  END IF;
  IF p_source_type IS NULL OR p_source_type = '' OR p_source_reference_id IS NULL OR p_source_reference_id = '' THEN
    RAISE EXCEPTION 'source_type dan source_reference_id wajib diisi';
  END IF;
  IF p_quantity_base IS NULL OR p_quantity_base < 0 THEN
    RAISE EXCEPTION 'quantity_base tidak valid';
  END IF;
  IF p_movement_type NOT IN ('purchase','sale_usage','stock_opname','waste','adjustment') THEN
    RAISE EXCEPTION 'movement_type tidak valid: %', p_movement_type;
  END IF;
  IF p_direction NOT IN ('in','out','set') THEN
    RAISE EXCEPTION 'direction tidak valid: %', p_direction;
  END IF;

  -- Idempotency check before locking/updating inventory.
  IF EXISTS (SELECT 1 FROM pos.inventory_movements m WHERE m.source_id = p_source_id) THEN
    SELECT m.source_id, m.inventory_source_id, m.before_quantity, m.after_quantity
      INTO movement_source_id, inventory_source_id, before_quantity, after_quantity
    FROM pos.inventory_movements m WHERE m.source_id = p_source_id;
    inserted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT i.quantity, i.base_unit, i.unit_status
    INTO v_before, v_base_unit, v_status
  FROM pos.inventory i
  WHERE i.source_id = p_inventory_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory tidak ditemukan: %', p_inventory_source_id;
  END IF;
  IF COALESCE(v_status, 'AMBIGUOUS') <> 'READY' OR v_base_unit IS NULL OR v_base_unit = '' THEN
    RAISE EXCEPTION 'inventory % belum READY untuk base-unit movement', p_inventory_source_id;
  END IF;
  IF p_unit_base <> v_base_unit THEN
    RAISE EXCEPTION 'unit movement % berbeda dari base unit %', p_unit_base, v_base_unit;
  END IF;

  IF p_direction = 'set' THEN
    v_after := p_quantity_base;
  ELSIF p_direction = 'in' THEN
    v_after := COALESCE(v_before, 0) + p_quantity_base;
  ELSE
    v_after := COALESCE(v_before, 0) - p_quantity_base;
    IF v_after < 0 THEN
      RAISE EXCEPTION 'stok tidak cukup: tersedia %, diminta %', COALESCE(v_before, 0), p_quantity_base;
    END IF;
  END IF;

  UPDATE pos.inventory
  SET quantity = v_after
  WHERE source_id = p_inventory_source_id;

  INSERT INTO pos.inventory_movements (
    source_id, inventory_source_id, movement_type, direction,
    quantity_base, unit_base, before_quantity, after_quantity,
    cost_per_base_unit, source_type, source_reference_id,
    actor_id, notes, raw
  ) VALUES (
    p_source_id, p_inventory_source_id, p_movement_type, p_direction,
    p_quantity_base, p_unit_base, v_before, v_after,
    p_cost_per_base_unit, p_source_type, p_source_reference_id,
    p_actor_id, p_notes, COALESCE(p_raw, '{}'::jsonb)
  ) ON CONFLICT (source_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  movement_source_id := p_source_id;
  inventory_source_id := p_inventory_source_id;
  before_quantity := v_before;
  after_quantity := v_after;
  inserted := (v_row_count > 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION pos.record_inventory_movement(text,text,text,text,numeric,text,text,text,text,numeric,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.record_inventory_movement(text,text,text,text,numeric,text,text,text,text,numeric,text,jsonb) TO service_role;
