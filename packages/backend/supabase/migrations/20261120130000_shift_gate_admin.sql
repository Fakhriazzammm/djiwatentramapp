-- Admin untuk gerbang kasir: atur bahan yang masuk opname shift dan baca hasil cek menu / opname per shift.

ALTER TABLE pos.shift_opname_materials ADD COLUMN IF NOT EXISTS updated_at bigint NULL;
ALTER TABLE pos.shift_opname_materials ADD COLUMN IF NOT EXISTS updated_by_name text NULL;

CREATE OR REPLACE FUNCTION public.shift_opname_admin_list()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'inventoryId', i.source_id,
      'name', btrim(i.ingredient_name),
      'area', o.area,
      'mode', COALESCE(m.mode, 'availability'),
      'status', COALESCE(m.status, 'unknown'),
      'quantity', CASE WHEN COALESCE(m.mode, 'availability') = 'count' THEN m.quantity ELSE NULL END,
      'unit', COALESCE(NULLIF(btrim(m.unit), ''), 'pcs'),
      'updatedAt', o.updated_at,
      'updatedBy', o.updated_by_name
    )
    ORDER BY (o.area IS NULL), CASE o.area WHEN 'bar' THEN 0 WHEN 'kitchen' THEN 1 ELSE 2 END, lower(btrim(i.ingredient_name)), i.source_id
  ), '[]'::jsonb)
  FROM pos.inventory i
  LEFT JOIN pos.shift_opname_materials o ON o.inventory_source_id = i.source_id
  LEFT JOIN pos.inventory_manual_stock m ON m.inventory_source_id = i.source_id;
$function$;

REVOKE ALL ON FUNCTION public.shift_opname_admin_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_opname_admin_list() TO service_role;

CREATE OR REPLACE FUNCTION public.shift_opname_admin_set(p_inventory_id text, p_area text, p_actor_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_id text := NULLIF(btrim(COALESCE(p_inventory_id, '')), '');
  v_area text := NULLIF(btrim(COALESCE(p_area, '')), '');
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
BEGIN
  IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM pos.inventory WHERE source_id = v_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Bahan tidak ditemukan';
  END IF;
  IF v_area IS NULL THEN
    DELETE FROM pos.shift_opname_materials WHERE inventory_source_id = v_id;
  ELSIF v_area IN ('bar', 'kitchen') THEN
    INSERT INTO pos.shift_opname_materials (inventory_source_id, area, updated_at, updated_by_name)
    VALUES (v_id, v_area, v_now, COALESCE(NULLIF(btrim(p_actor_name), ''), 'Admin'))
    ON CONFLICT (inventory_source_id) DO UPDATE
    SET area = EXCLUDED.area, updated_at = EXCLUDED.updated_at, updated_by_name = EXCLUDED.updated_by_name;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Area harus bar, kitchen, atau kosong';
  END IF;
  RETURN jsonb_build_object('inventoryId', v_id, 'area', v_area);
END;
$function$;

REVOKE ALL ON FUNCTION public.shift_opname_admin_set(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_opname_admin_set(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.shift_checks_for_shift(p_shift_source_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', c.id, 'kind', c.kind, 'actorName', c.actor_name, 'createdAt', c.created_at, 'summary', c.summary, 'items', c.items)
    ORDER BY c.created_at
  ), '[]'::jsonb)
  FROM pos.shift_checks c
  WHERE c.shift_source_id = btrim(COALESCE(p_shift_source_id, ''));
$function$;

REVOKE ALL ON FUNCTION public.shift_checks_for_shift(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_checks_for_shift(text) TO service_role;
