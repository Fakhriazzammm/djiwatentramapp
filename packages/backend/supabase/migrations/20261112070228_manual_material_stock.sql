-- Standalone Manual Material Stock & Central Stock Policy
-- Separates manual material availability/count tracking from legacy calculated inventory,
-- preserves historical inventory/recipes/HPP rows, and enforces DB-level guards when mode = 'manual'.

CREATE TABLE IF NOT EXISTS pos.inventory_stock_config (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  mode text NOT NULL DEFAULT 'integrated' CHECK (mode IN ('manual', 'integrated')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE pos.inventory_stock_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos.inventory_stock_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE pos.inventory_stock_config TO service_role;

INSERT INTO pos.inventory_stock_config (id, mode, updated_at, updated_by)
VALUES ('default', 'integrated', now(), 'system')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pos.current_inventory_stock_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(
    (SELECT c.mode FROM pos.inventory_stock_config c WHERE c.id = 'default'),
    'integrated'
  );
$function$;

REVOKE ALL ON FUNCTION pos.current_inventory_stock_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.current_inventory_stock_mode() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inventory_stock_mode()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT jsonb_build_object(
    'mode', pos.current_inventory_stock_mode(),
    'updatedAt', (
      SELECT floor(extract(epoch FROM c.updated_at) * 1000)::bigint
      FROM pos.inventory_stock_config c
      WHERE c.id = 'default'
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.inventory_stock_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_stock_mode() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION pos.inventory_stock_mode()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT public.inventory_stock_mode();
$function$;

REVOKE ALL ON FUNCTION pos.inventory_stock_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pos.inventory_stock_mode() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_inventory_stock_mode(p_mode text, p_actor text DEFAULT 'system')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('manual', 'integrated') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Mode stok tidak valid';
  END IF;

  INSERT INTO pos.inventory_stock_config (id, mode, updated_at, updated_by)
  VALUES ('default', p_mode, now(), COALESCE(NULLIF(btrim(p_actor), ''), 'system'))
  ON CONFLICT (id) DO UPDATE
  SET mode = EXCLUDED.mode,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  RETURN public.inventory_stock_mode();
END;
$function$;

REVOKE ALL ON FUNCTION public.set_inventory_stock_mode(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_stock_mode(text, text) TO service_role;

-- Separate manual stock state and audit trail (never seeded from legacy calculated balances)
CREATE TABLE IF NOT EXISTS pos.inventory_manual_stock (
  inventory_source_id text PRIMARY KEY REFERENCES pos.inventory(source_id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'availability' CHECK (mode IN ('availability', 'count')),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('available', 'out', 'unknown')),
  quantity integer NULL CHECK (quantity IS NULL OR quantity >= 0),
  unit text NOT NULL DEFAULT 'pcs' CHECK (unit IN ('pcs', 'pack', 'botol', 'kotak')),
  note text NULL,
  updated_at bigint NOT NULL,
  updated_by_id text NULL,
  updated_by_name text NULL,
  CONSTRAINT inventory_manual_stock_mode_quantity_check CHECK (
    (mode = 'availability' AND quantity IS NULL)
    OR (
      mode = 'count'
      AND quantity IS NOT NULL
      AND ((quantity = 0 AND status = 'out') OR (quantity > 0 AND status = 'available'))
    )
  )
);

ALTER TABLE pos.inventory_manual_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos.inventory_manual_stock FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE pos.inventory_manual_stock TO service_role;

CREATE TABLE IF NOT EXISTS pos.inventory_manual_stock_audit (
  id text PRIMARY KEY,
  inventory_source_id text NOT NULL REFERENCES pos.inventory(source_id) ON DELETE CASCADE,
  at bigint NOT NULL,
  actor_id text NULL,
  actor_name text NULL,
  note text NULL,
  before_state jsonb NULL,
  after_state jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_manual_stock_audit_item_at
  ON pos.inventory_manual_stock_audit (inventory_source_id, at DESC);

ALTER TABLE pos.inventory_manual_stock_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos.inventory_manual_stock_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE pos.inventory_manual_stock_audit TO service_role;

CREATE OR REPLACE FUNCTION public.manual_stock_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT jsonb_build_object(
    'mode', pos.current_inventory_stock_mode(),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'inventoryId', i.source_id,
          'name', i.ingredient_name,
          'mode', COALESCE(m.mode, 'availability'),
          'status', COALESCE(m.status, 'unknown'),
          'quantity', CASE WHEN COALESCE(m.mode, 'availability') = 'count' THEN m.quantity ELSE NULL END,
          'unit', COALESCE(
            NULLIF(btrim(m.unit), ''),
            CASE
              WHEN lower(btrim(COALESCE(i.operational_unit, i.display_unit, i.unit, ''))) IN ('pcs', 'pack', 'botol', 'kotak')
              THEN lower(btrim(COALESCE(i.operational_unit, i.display_unit, i.unit, '')))
              ELSE 'pcs'
            END
          ),
          'updatedAt', m.updated_at,
          'updatedBy', m.updated_by_name
        )
        ORDER BY
          CASE COALESCE(m.status, 'unknown')
            WHEN 'out' THEN 0
            WHEN 'unknown' THEN 1
            ELSE 2
          END,
          lower(i.ingredient_name),
          i.source_id
      )
      FROM pos.inventory i
      LEFT JOIN pos.inventory_manual_stock m ON m.inventory_source_id = i.source_id
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.manual_stock_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manual_stock_snapshot() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manual_stock_save(
  p_input jsonb,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_inventory pos.inventory%ROWTYPE;
  v_existing pos.inventory_manual_stock%ROWTYPE;
  v_has_existing boolean := false;
  v_inventory_id text;
  v_mode text;
  v_status text;
  v_quantity integer;
  v_unit text;
  v_note text;
  v_expected_updated_at bigint;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_actor_id text := NULLIF(btrim(COALESCE(p_actor_id, '')), '');
  v_actor_name text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'Petugas');
  v_before jsonb := NULL;
  v_after jsonb;
  v_audit_id text;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Data perubahan stok tidak valid';
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identitas petugas wajib ada';
  END IF;

  v_inventory_id := NULLIF(btrim(COALESCE(p_input->>'inventoryId', '')), '');
  IF v_inventory_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Bahan belum dipilih';
  END IF;

  SELECT * INTO v_inventory
  FROM pos.inventory i
  WHERE i.source_id = v_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Bahan tidak ditemukan';
  END IF;

  SELECT * INTO v_existing
  FROM pos.inventory_manual_stock m
  WHERE m.inventory_source_id = v_inventory_id
  FOR UPDATE;
  v_has_existing := FOUND;

  IF p_input ? 'expectedUpdatedAt' THEN
    IF jsonb_typeof(p_input->'expectedUpdatedAt') = 'null' THEN
      IF v_has_existing THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Stok bahan baru saja diperbarui oleh petugas lain. Muat ulang lalu coba lagi.';
      END IF;
    ELSIF jsonb_typeof(p_input->'expectedUpdatedAt') = 'number' AND (p_input->>'expectedUpdatedAt') ~ '^\d+$' THEN
      v_expected_updated_at := (p_input->>'expectedUpdatedAt')::bigint;
      IF NOT v_has_existing OR v_existing.updated_at IS DISTINCT FROM v_expected_updated_at THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Stok bahan baru saja diperbarui oleh petugas lain. Muat ulang lalu coba lagi.';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Versi waktu stok tidak valid';
    END IF;
  END IF;

  v_mode := NULLIF(btrim(COALESCE(p_input->>'mode', '')), '');
  IF v_mode NOT IN ('availability', 'count') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cara pencatatan stok tidak valid';
  END IF;

  v_unit := lower(COALESCE(NULLIF(btrim(COALESCE(p_input->>'unit', '')), ''), CASE WHEN v_has_existing THEN v_existing.unit ELSE 'pcs' END));
  IF v_unit NOT IN ('pcs', 'pack', 'botol', 'kotak') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Satuan stok harus pcs, pack, botol, atau kotak';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_input->>'note', '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Catatan maksimal 500 karakter';
  END IF;

  IF v_mode = 'count' THEN
    IF NOT (p_input ? 'quantity')
       OR jsonb_typeof(p_input->'quantity') <> 'number'
       OR (p_input->>'quantity') !~ '^\d+$'
       OR (p_input->>'quantity')::bigint > 2147483647 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Masukkan jumlah bilangan bulat nol atau lebih';
    END IF;
    v_quantity := (p_input->>'quantity')::integer;
    v_status := CASE WHEN v_quantity = 0 THEN 'out' ELSE 'available' END;
  ELSE
    v_quantity := NULL;
    v_status := NULLIF(btrim(COALESCE(p_input->>'status', '')), '');
    IF v_status NOT IN ('available', 'out', 'unknown') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Status stok tidak valid';
    END IF;
  END IF;

  IF v_has_existing THEN
    v_before := jsonb_build_object(
      'mode', v_existing.mode,
      'status', v_existing.status,
      'quantity', v_existing.quantity,
      'unit', v_existing.unit
    );
  END IF;

  v_after := jsonb_build_object(
    'mode', v_mode,
    'status', v_status,
    'quantity', v_quantity,
    'unit', v_unit
  );

  INSERT INTO pos.inventory_manual_stock (
    inventory_source_id, mode, status, quantity, unit, note, updated_at, updated_by_id, updated_by_name
  ) VALUES (
    v_inventory_id, v_mode, v_status, v_quantity, v_unit, v_note, v_now, v_actor_id, v_actor_name
  )
  ON CONFLICT (inventory_source_id) DO UPDATE
  SET mode = EXCLUDED.mode,
      status = EXCLUDED.status,
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      note = EXCLUDED.note,
      updated_at = EXCLUDED.updated_at,
      updated_by_id = EXCLUDED.updated_by_id,
      updated_by_name = EXCLUDED.updated_by_name;

  v_audit_id := 'ms_aud_' || md5(v_inventory_id || ':' || v_now::text || ':' || random()::text);
  INSERT INTO pos.inventory_manual_stock_audit (
    id, inventory_source_id, at, actor_id, actor_name, note, before_state, after_state
  ) VALUES (
    v_audit_id, v_inventory_id, v_now, v_actor_id, v_actor_name, v_note, v_before, v_after
  );

  RETURN jsonb_build_object(
    'inventoryId', v_inventory.source_id,
    'name', v_inventory.ingredient_name,
    'mode', v_mode,
    'status', v_status,
    'quantity', v_quantity,
    'unit', v_unit,
    'updatedAt', v_now,
    'updatedBy', v_actor_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.manual_stock_save(jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_stock_save(jsonb, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.manual_stock_history(p_inventory_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'at', x.at,
        'actorName', x.actor_name,
        'note', x.note,
        'before', x.before_state,
        'after', x.after_state
      )
      ORDER BY x.at DESC, x.id DESC
    )
    FROM (
      SELECT a.id, a.at, a.actor_name, a.note, a.before_state, a.after_state
      FROM pos.inventory_manual_stock_audit a
      WHERE a.inventory_source_id = btrim(COALESCE(p_inventory_id, ''))
      ORDER BY a.at DESC, a.id DESC
      LIMIT 50
    ) x
  ), '[]'::jsonb);
$function$;

REVOKE ALL ON FUNCTION public.manual_stock_history(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_stock_history(text) TO service_role;

CREATE OR REPLACE FUNCTION public.manual_stock_create(
  p_name text,
  p_unit text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_unit text := lower(COALESCE(NULLIF(btrim(COALESCE(p_unit, '')), ''), 'pcs'));
  v_actor_id text := NULLIF(btrim(COALESCE(p_actor_id, '')), '');
  v_actor_name text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'Petugas');
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_source_id text;
  v_after jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identitas petugas wajib ada';
  END IF;
  IF v_name IS NULL OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nama bahan wajib diisi (maksimal 120 karakter)';
  END IF;
  IF v_unit NOT IN ('pcs', 'pack', 'botol', 'kotak') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Satuan stok harus pcs, pack, botol, atau kotak';
  END IF;
  IF EXISTS (SELECT 1 FROM pos.inventory i WHERE lower(btrim(i.ingredient_name)) = lower(v_name)) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Nama bahan sudah terdaftar';
  END IF;

  v_source_id := 'inv_' || md5(v_name || ':' || v_now::text || ':' || random()::text);
  PERFORM set_config('yumi.allow_manual_material_create', 'on', true);

  INSERT INTO pos.inventory (
    source_id, ingredient_name, unit, quantity, low_stock_threshold, creation_time, raw
  ) VALUES (
    v_source_id, v_name, v_unit, 0, 0, v_now, jsonb_build_object('createdVia', 'manual_stock')
  );

  INSERT INTO pos.inventory_manual_stock (
    inventory_source_id, mode, status, quantity, unit, note, updated_at, updated_by_id, updated_by_name
  ) VALUES (
    v_source_id, 'availability', 'unknown', NULL, v_unit, 'Bahan baru ditambahkan', v_now, v_actor_id, v_actor_name
  );

  v_after := jsonb_build_object(
    'mode', 'availability',
    'status', 'unknown',
    'quantity', NULL,
    'unit', v_unit
  );

  INSERT INTO pos.inventory_manual_stock_audit (
    id, inventory_source_id, at, actor_id, actor_name, note, before_state, after_state
  ) VALUES (
    'ms_aud_' || md5(v_source_id || ':' || v_now::text),
    v_source_id,
    v_now,
    v_actor_id,
    v_actor_name,
    'Bahan baru ditambahkan',
    NULL,
    v_after
  );

  RETURN jsonb_build_object(
    'inventoryId', v_source_id,
    'name', v_name,
    'mode', 'availability',
    'status', 'unknown',
    'quantity', NULL,
    'unit', v_unit,
    'updatedAt', v_now,
    'updatedBy', v_actor_name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.manual_stock_create(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_stock_create(text, text, text, text) TO service_role;

-- Database compatibility guards when manual stock mode is active
CREATE OR REPLACE FUNCTION pos.guard_manual_stock_inventory_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    IF TG_OP = 'INSERT' AND current_setting('yumi.allow_manual_material_create', true) = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: gunakan halaman Stok Manual untuk memperbarui bahan.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_manual_stock_inventory ON pos.inventory;
CREATE TRIGGER trg_guard_manual_stock_inventory
  BEFORE INSERT OR UPDATE OR DELETE ON pos.inventory
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_inventory_write();

CREATE OR REPLACE FUNCTION pos.guard_manual_stock_legacy_table_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: fitur stok otomatis, opname shift, dan resep/HPP sementara dinonaktifkan.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_manual_stock_inventory_tx ON pos.inventory_transactions;
CREATE TRIGGER trg_guard_manual_stock_inventory_tx
  BEFORE INSERT OR UPDATE OR DELETE ON pos.inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_legacy_table_write();

DROP TRIGGER IF EXISTS trg_guard_manual_stock_inventory_movements ON pos.inventory_movements;
CREATE TRIGGER trg_guard_manual_stock_inventory_movements
  BEFORE INSERT OR UPDATE OR DELETE ON pos.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_legacy_table_write();

DROP TRIGGER IF EXISTS trg_guard_manual_stock_opname_logs ON pos.stock_opname_logs;
CREATE TRIGGER trg_guard_manual_stock_opname_logs
  BEFORE INSERT OR UPDATE OR DELETE ON pos.stock_opname_logs
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_legacy_table_write();

DROP TRIGGER IF EXISTS trg_guard_manual_stock_recipes ON pos.recipes;
CREATE TRIGGER trg_guard_manual_stock_recipes
  BEFORE INSERT OR UPDATE OR DELETE ON pos.recipes
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_legacy_table_write();

DROP TRIGGER IF EXISTS trg_guard_manual_stock_base_recipes ON pos.base_recipes;
CREATE TRIGGER trg_guard_manual_stock_base_recipes
  BEFORE INSERT OR UPDATE OR DELETE ON pos.base_recipes
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_legacy_table_write();

CREATE OR REPLACE FUNCTION pos.guard_manual_stock_mirror_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_table text := COALESCE(NEW.table_name, OLD.table_name, '');
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual'
     AND v_table IN ('hppCalculations', 'inventory', 'inventoryTransactions', 'recipes', 'baseRecipes', 'stockOpnameLogs') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: fitur resep, HPP, dan stok otomatis sementara dinonaktifkan.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_manual_stock_mirror ON legacy_mirror.documents;
CREATE TRIGGER trg_guard_manual_stock_mirror
  BEFORE INSERT OR UPDATE OR DELETE ON legacy_mirror.documents
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_mirror_write();

CREATE OR REPLACE FUNCTION pos.guard_manual_stock_financial_hpp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual'
     AND NEW.tx_type = 'expense'
     AND (
       upper(COALESCE(NEW.category, '')) = 'HPP'
       OR lower(COALESCE(NEW.transaction_kind, '')) IN ('order_cogs', 'hpp_review')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: pencatatan HPP otomatis dinonaktifkan.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_manual_stock_financial_hpp ON pos.financial_transactions;
CREATE TRIGGER trg_guard_manual_stock_financial_hpp
  BEFORE INSERT OR UPDATE ON pos.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_financial_hpp();

CREATE OR REPLACE FUNCTION pos.guard_manual_stock_product_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    NEW.quantity := OLD.quantity;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_manual_stock_product_quantity ON pos.products;
CREATE TRIGGER trg_guard_manual_stock_product_quantity
  BEFORE UPDATE ON pos.products
  FOR EACH ROW
  EXECUTE FUNCTION pos.guard_manual_stock_product_quantity();

CREATE OR REPLACE FUNCTION pos_private.adjust_ready_menu_stock(
  p_product_source_id text,
  p_delta integer,
  p_expected_quantity numeric
)
RETURNS TABLE(quantity numeric, is_available boolean, event_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  product_row pos.products%rowtype;
  next_quantity numeric;
  availability_event_id bigint;
begin
  if pos.current_inventory_stock_mode() = 'manual' then
    raise exception using errcode = 'P0001', message = 'Fitur stok porsi menu dinonaktifkan selama mode stok manual.';
  end if;

  if p_delta is null or p_delta not in (-1, 1) or p_expected_quantity is null
    or p_expected_quantity < 0 or p_expected_quantity = 'NaN'::numeric then
    raise exception using errcode = '22023', message = 'Perubahan stok tidak valid';
  end if;

  select * into product_row from pos.products p
  where p.source_id = p_product_source_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;
  if coalesce(product_row.quantity, 0) <> p_expected_quantity then
    raise exception using errcode = '40001', message = 'Stok sudah berubah. Muat ulang dan coba lagi.';
  end if;
  next_quantity := coalesce(product_row.quantity, 0) + p_delta;
  if next_quantity < 0 then
    raise exception using errcode = '23514', message = 'Stok menu tidak mencukupi';
  end if;

  update pos.products p set quantity = next_quantity,
    raw = coalesce(p.raw, '{}'::jsonb) || jsonb_build_object(
      'lastMenuStockChangedAt', extract(epoch from clock_timestamp()) * 1000,
      'lastMenuStockSource', 'pos_menu_stock',
      'previousMenuQuantity', product_row.quantity
    )
  where p.source_id = p_product_source_id;

  if next_quantity = 0 and product_row.is_available then
    select e.event_id into availability_event_id
    from pos.update_product_availability_with_event(
      p_product_source_id, false, p_source => 'pos_menu_stock'
    ) e;
  end if;
  return query select next_quantity,
    case when next_quantity = 0 then false else product_row.is_available end,
    availability_event_id;
end
$function$;

CREATE OR REPLACE FUNCTION pos.post_product_stock_movement(
  p_product_source_id text,
  p_movement_type text,
  p_quantity numeric,
  p_source_type text,
  p_source_reference_id text,
  p_idempotency_key text,
  p_actor_id text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public'
AS $function$
DECLARE
  product_row pos.products%ROWTYPE;
  policy_row pos.product_stock_policies%ROWTYPE;
  before_qty numeric;
  after_qty numeric;
  movement_id text;
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Fitur stok porsi menu dinonaktifkan selama mode stok manual.';
  END IF;

  SELECT * INTO product_row FROM pos.products
  WHERE source_id = p_product_source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found: %', p_product_source_id; END IF;

  SELECT * INTO policy_row FROM pos.product_stock_policies
  WHERE product_source_id = p_product_source_id;

  IF EXISTS (SELECT 1 FROM pos.product_stock_movements WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_applied');
  END IF;

  before_qty := COALESCE(product_row.quantity, 0);
  after_qty := before_qty + p_quantity;
  IF after_qty < 0 AND COALESCE(policy_row.allow_negative, false) = false THEN
    RAISE EXCEPTION 'product stock would become negative';
  END IF;

  movement_id := 'psm_' || md5(p_idempotency_key);
  INSERT INTO pos.product_stock_movements (
    source_id, product_source_id, movement_type, quantity,
    before_quantity, after_quantity, source_type, source_reference_id,
    idempotency_key, actor_id, notes, raw, creation_time
  ) VALUES (
    movement_id, p_product_source_id, p_movement_type, p_quantity,
    before_qty, after_qty, p_source_type, p_source_reference_id,
    p_idempotency_key, p_actor_id, p_notes, '{}'::jsonb,
    extract(epoch from now()) * 1000
  );

  UPDATE pos.products SET quantity = after_qty WHERE source_id = p_product_source_id;

  RETURN jsonb_build_object(
    'success', true, 'status', 'applied', 'movement_id', movement_id,
    'before_quantity', before_qty, 'after_quantity', after_qty
  );
END;
$function$;

CREATE OR REPLACE FUNCTION pos.apply_expense_inventory_link(p_link_id text, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public'
AS $function$
DECLARE
  link_row pos.expense_inventory_links%ROWTYPE;
  inv_row pos.inventory%ROWTYPE;
  delta numeric;
  before_qty numeric;
  after_qty numeric;
  movement_id text;
  tx_id text;
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: posting struk ke stok otomatis dinonaktifkan.';
  END IF;

  SELECT * INTO link_row
  FROM pos.expense_inventory_links
  WHERE source_id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense inventory link not found: %', p_link_id;
  END IF;

  IF link_row.status = 'applied' THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_applied',
      'movement_id', link_row.applied_movement_source_id
    );
  END IF;

  IF link_row.status <> 'approved' THEN
    RAISE EXCEPTION 'expense inventory link is not approved: %', link_row.status;
  END IF;

  IF link_row.inventory_source_id IS NULL THEN
    RAISE EXCEPTION 'inventory source is required';
  END IF;

  IF link_row.base_quantity IS NULL AND link_row.quantity IS NULL THEN
    RAISE EXCEPTION 'quantity is required';
  END IF;

  SELECT * INTO inv_row
  FROM pos.inventory
  WHERE source_id = link_row.inventory_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory item not found: %', link_row.inventory_source_id;
  END IF;

  delta := COALESCE(link_row.base_quantity, link_row.quantity);
  before_qty := COALESCE(inv_row.quantity, 0);
  after_qty := before_qty + delta;
  movement_id := 'im_' || md5(p_idempotency_key);
  tx_id := 'it_' || md5(p_idempotency_key);

  INSERT INTO pos.inventory_movements (
    source_id, inventory_source_id, movement_type, direction,
    quantity_base, unit_base, before_quantity, after_quantity,
    cost_per_base_unit, source_type, source_reference_id, actor_id,
    notes, raw, creation_time
  ) VALUES (
    movement_id, inv_row.source_id, 'purchase', 'in', delta,
    COALESCE(link_row.base_unit, inv_row.base_unit, inv_row.unit),
    before_qty, after_qty,
    CASE WHEN delta <> 0 THEN COALESCE(link_row.line_total, link_row.price) / NULLIF(delta, 0) END,
    'expense', link_row.financial_transaction_source_id, link_row.reviewed_by,
    'Expense inventory restock', jsonb_build_object('link_id', link_row.source_id),
    extract(epoch from now()) * 1000
  ) ON CONFLICT (source_id) DO NOTHING;

  INSERT INTO pos.inventory_transactions (
    source_id, inventory_source_id, quantity, tx_type,
    cost_per_unit, remaining_quantity, tx_timestamp,
    purchase_unit, purchase_quantity, line_total,
    source_transaction_id, source_label, source_fingerprint,
    creation_time, raw
  ) VALUES (
    tx_id, inv_row.source_id, delta, 'restock',
    CASE WHEN delta <> 0 THEN COALESCE(link_row.line_total, link_row.price) / NULLIF(delta, 0) END,
    after_qty, extract(epoch from now()) * 1000,
    link_row.unit, link_row.quantity, link_row.line_total,
    link_row.financial_transaction_source_id, 'expense_inventory_link', p_idempotency_key,
    extract(epoch from now()) * 1000, jsonb_build_object('link_id', link_row.source_id)
  ) ON CONFLICT (source_id) DO NOTHING;

  UPDATE pos.inventory
  SET quantity = after_qty,
      last_purchase_price = COALESCE(link_row.line_total, link_row.price, last_purchase_price),
      last_purchase_at = extract(epoch from now()) * 1000
  WHERE source_id = inv_row.source_id;

  UPDATE pos.expense_inventory_links
  SET status = 'applied',
      applied_movement_source_id = movement_id,
      updated_at = now()
  WHERE source_id = link_row.source_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'applied',
    'movement_id', movement_id,
    'inventory_id', inv_row.source_id,
    'before_quantity', before_qty,
    'after_quantity', after_qty
  );
END;
$function$;

CREATE OR REPLACE FUNCTION pos.approve_expense_inventory_link(
  p_link_id text,
  p_inventory_source_id text DEFAULT NULL::text,
  p_base_quantity numeric DEFAULT NULL::numeric,
  p_base_unit text DEFAULT NULL::text,
  p_match_method text DEFAULT 'manual'::text,
  p_confidence numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public'
AS $function$
DECLARE
  link_row pos.expense_inventory_links%ROWTYPE;
  resolved_inventory_id text;
  reviewer text;
BEGIN
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: persetujuan posting stok dari struk dinonaktifkan.';
  END IF;

  SELECT * INTO link_row
  FROM pos.expense_inventory_links
  WHERE source_id = p_link_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense inventory link not found: %', p_link_id;
  END IF;

  IF link_row.status = 'applied' THEN
    RETURN jsonb_build_object('success', true, 'status', 'already_applied', 'link_id', p_link_id);
  END IF;

  IF link_row.status NOT IN ('pending', 'needs_review', 'corrected') THEN
    RAISE EXCEPTION 'link cannot be approved from status: %', link_row.status;
  END IF;

  resolved_inventory_id := COALESCE(NULLIF(p_inventory_source_id, ''), link_row.inventory_source_id);
  IF resolved_inventory_id IS NULL THEN
    RAISE EXCEPTION 'inventory source is required before approval';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pos.inventory WHERE source_id = resolved_inventory_id) THEN
    RAISE EXCEPTION 'inventory item not found: %', resolved_inventory_id;
  END IF;

  reviewer := NULLIF(current_setting('request.jwt.claim.sub', true), '');

  UPDATE pos.expense_inventory_links
  SET inventory_source_id = resolved_inventory_id,
      base_quantity = COALESCE(p_base_quantity, base_quantity, quantity),
      base_unit = COALESCE(NULLIF(p_base_unit, ''), base_unit, unit),
      match_method = COALESCE(NULLIF(p_match_method, ''), 'manual'),
      confidence = COALESCE(p_confidence, confidence),
      status = 'approved',
      reviewed_by = reviewer,
      reviewed_at = extract(epoch from now()) * 1000,
      updated_at = now()
  WHERE source_id = p_link_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'link_id', p_link_id,
    'inventory_id', resolved_inventory_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_actions_summary(p_now double precision)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN pos.current_inventory_stock_mode() = 'manual' THEN
      jsonb_build_object(
        'stockCritical', (
          SELECT count(*)
          FROM pos.inventory_manual_stock m
          JOIN pos.inventory i ON i.source_id = m.inventory_source_id
          WHERE m.status = 'out'
        ),
        'stockItems', (
          SELECT COALESCE(
            jsonb_agg(jsonb_build_object('name', x.name, 'quantity', x.quantity, 'threshold', x.threshold)),
            '[]'::jsonb
          )
          FROM (
            SELECT i.ingredient_name AS name, COALESCE(m.quantity, 0) AS quantity, 0 AS threshold
            FROM pos.inventory_manual_stock m
            JOIN pos.inventory i ON i.source_id = m.inventory_source_id
            WHERE m.status = 'out'
            ORDER BY m.updated_at DESC, lower(i.ingredient_name)
            LIMIT 4
          ) x
        ),
        'pendingOverFifteen', (
          SELECT count(*) FROM pos.orders o
          WHERE o.status = 'pending' AND o.created_at < p_now - 15 * 60000
        )
      )
    ELSE
      jsonb_build_object(
        'stockCritical', (SELECT count(*) FROM pos.inventory i WHERE i.quantity <= i.low_stock_threshold),
        'stockItems', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'quantity', x.quantity, 'threshold', x.threshold)), '[]'::jsonb)
          FROM (
            SELECT i.ingredient_name AS name, i.quantity, i.low_stock_threshold AS threshold
            FROM pos.inventory i
            WHERE i.quantity <= i.low_stock_threshold
            ORDER BY (i.quantity - i.low_stock_threshold)
            LIMIT 4
          ) x
        ),
        'pendingOverFifteen', (
          SELECT count(*) FROM pos.orders o
          WHERE o.status = 'pending' AND o.created_at < p_now - 15 * 60000
        )
      )
  END;
$function$;
