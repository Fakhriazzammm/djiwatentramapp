-- Gerbang kasir: cek menu saat buka shift dan opname bahan saat tutup shift.
-- Opname memakai sistem stok manual (availability / count) yang sudah ada, dan menggantikan opname di absensi.

-- Bahan yang masuk opname kasir. Tabel terpisah karena pos.inventory dijaga trigger mode stok manual.
CREATE TABLE IF NOT EXISTS pos.shift_opname_materials (
  inventory_source_id text PRIMARY KEY REFERENCES pos.inventory(source_id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('bar', 'kitchen'))
);

ALTER TABLE pos.shift_opname_materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos.shift_opname_materials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE pos.shift_opname_materials TO service_role;

-- Awal: bahan yang dulu masuk opname absensi bar/dapur. Manajer dapat mengubah daftar ini.
INSERT INTO pos.shift_opname_materials (inventory_source_id, area)
SELECT i.source_id, 'bar' FROM pos.inventory i
WHERE btrim(i.ingredient_name) IN (
    'Air Galon','Apple Juice','Arabica Beans','Beans Robusta','C1000 Apple','Es Batu','Freshmilk Greenfield',
    'Gula Aren','Le Mineral','Lemon Tea Max Tea','Matcha Powder','Peach Tea Max Tea','Robusta Beans',
    'SKM Carnation','Sirup Green Apple','Sirup Peach','Soda Water Schweppes','Sprite','Sunquick Lemon',
    'Susu Coconut','Susu Kental Manis'
  )
ON CONFLICT (inventory_source_id) DO NOTHING;

INSERT INTO pos.shift_opname_materials (inventory_source_id, area)
SELECT i.source_id, 'kitchen' FROM pos.inventory i
WHERE btrim(i.ingredient_name) IN (
    'Barbeque Sauce','Baso Sapi','Bawang Daun','Bawang Goreng','Beras','Biji Wijen','Butter','Coklat Powder',
    'Daging Ayam','Garam','Gula Pasir Putih','Kecap Ikan','Kecap Manis','Kemangi Instant','Kentang','Kerupuk',
    'Kulit Pangsit (Cap Jempol)','Mayonaise','Merica','Micin','Minyak Bawang Putih','Mix Vegetable',
    'Nasi Ayam Chasiu Sauce','Nasi Ayam Mentega Sauce','Nasi Ayam Rempah Kemangi Sauce','Nasi Goreng Sauce',
    'Nasi Telor Omega Pontianak Sauce','Patty Hamburg','Pisang','Roti (Bread Co)','Saus Sambel (Del Monte)',
    'Saus Tiram (Mahsuri)','Saus Tomat (Del Monte)','Selada (Ibu Teti Pasar)','Sosis (Salam)',
    'Telor Omega (Happy Egg)','Telur Ayam','Tepung Terigu','Timun','Tongcai','Ubi Cilembu','Yamin Base'
  )
ON CONFLICT (inventory_source_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pos.shift_checks (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('open_menu', 'close_opname')),
  shift_source_id text NULL,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_checks_shift ON pos.shift_checks (shift_source_id, kind, created_at DESC);

ALTER TABLE pos.shift_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pos.shift_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE pos.shift_checks TO service_role;

-- Daftar bahan opname shift beserta catatan stok manual terakhir (aman dibaca publik, seperti manual_stock_snapshot).
CREATE OR REPLACE FUNCTION public.shift_opname_items()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'inventoryId', i.source_id,
        'name', btrim(i.ingredient_name),
        'group', o.area,
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
        'updatedAt', m.updated_at
      )
      ORDER BY CASE o.area WHEN 'bar' THEN 0 ELSE 1 END, lower(btrim(i.ingredient_name)), i.source_id
    )
    FROM pos.shift_opname_materials o
    JOIN pos.inventory i ON i.source_id = o.inventory_source_id
    LEFT JOIN pos.inventory_manual_stock m ON m.inventory_source_id = i.source_id
  ), '[]'::jsonb);
$function$;

REVOKE ALL ON FUNCTION public.shift_opname_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_opname_items() TO anon, authenticated, service_role;

-- Simpan seluruh opname shift secara atomik: setiap bahan lewat manual_stock_save, lalu satu catatan audit shift.
CREATE OR REPLACE FUNCTION public.shift_opname_submit(
  p_items jsonb,
  p_shift_source_id text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_log jsonb := '[]'::jsonb;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_actor_id text := NULLIF(btrim(COALESCE(p_actor_id, '')), '');
  v_actor_name text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'Petugas');
  v_out int := 0;
  v_flagged int := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identitas petugas wajib ada';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Data opname kosong';
  END IF;
  IF jsonb_array_length(p_items) > 400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Data opname terlalu banyak';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_results := v_results || jsonb_build_array(
      public.manual_stock_save(
        jsonb_build_object(
          'inventoryId', v_item->>'inventoryId',
          'mode', v_item->>'mode',
          'status', v_item->>'status',
          'quantity', CASE WHEN v_item->>'mode' = 'count' THEN v_item->'quantity' ELSE NULL END,
          'unit', v_item->>'unit',
          'note', COALESCE(NULLIF(btrim(v_item->>'note'), ''), 'Opname tutup kasir')
        ),
        v_actor_id,
        v_actor_name
      )
    );
    IF (v_item->>'status') = 'out' THEN v_out := v_out + 1; END IF;
    IF COALESCE((v_item->>'flagged')::boolean, false) THEN v_flagged := v_flagged + 1; END IF;
    v_log := v_log || jsonb_build_array(jsonb_build_object(
      'inventoryId', v_item->>'inventoryId',
      'name', v_item->>'name',
      'mode', v_item->>'mode',
      'status', v_item->>'status',
      'quantity', v_item->'quantity',
      'previousQuantity', v_item->'previousQuantity',
      'unit', v_item->>'unit',
      'flagged', COALESCE((v_item->>'flagged')::boolean, false),
      'note', NULLIF(btrim(v_item->>'note'), '')
    ));
  END LOOP;

  INSERT INTO pos.shift_checks (id, kind, shift_source_id, actor_id, actor_name, summary, items, created_at)
  VALUES (
    'shc_' || md5(random()::text || v_now::text),
    'close_opname',
    NULLIF(btrim(COALESCE(p_shift_source_id, '')), ''),
    v_actor_id,
    v_actor_name,
    jsonb_build_object('total', jsonb_array_length(p_items), 'out', v_out, 'flagged', v_flagged),
    v_log,
    v_now
  );

  RETURN jsonb_build_object('saved', jsonb_array_length(v_results), 'out', v_out, 'flagged', v_flagged);
END;
$function$;

REVOKE ALL ON FUNCTION public.shift_opname_submit(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_opname_submit(jsonb, text, text, text) TO service_role;

-- Catatan cek menu saat buka shift (status sudah diterapkan lewat RPC ketersediaan produk yang ada).
CREATE OR REPLACE FUNCTION public.shift_menu_check_record(
  p_items jsonb,
  p_shift_source_id text,
  p_actor_id text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_actor_id text := NULLIF(btrim(COALESCE(p_actor_id, '')), '');
  v_actor_name text := COALESCE(NULLIF(btrim(COALESCE(p_actor_name, '')), ''), 'Petugas');
  v_total int;
  v_out int;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identitas petugas wajib ada';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Data cek menu kosong';
  END IF;
  IF jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Data cek menu terlalu banyak';
  END IF;
  v_total := jsonb_array_length(p_items);
  SELECT count(*) INTO v_out FROM jsonb_array_elements(p_items) e WHERE (e->>'available') = 'false';

  INSERT INTO pos.shift_checks (id, kind, shift_source_id, actor_id, actor_name, summary, items, created_at)
  VALUES (
    'shc_' || md5(random()::text || v_now::text),
    'open_menu',
    NULLIF(btrim(COALESCE(p_shift_source_id, '')), ''),
    v_actor_id,
    v_actor_name,
    jsonb_build_object('total', v_total, 'out', v_out),
    p_items,
    v_now
  );
  RETURN jsonb_build_object('total', v_total, 'out', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.shift_menu_check_record(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_menu_check_record(jsonb, text, text, text) TO service_role;
