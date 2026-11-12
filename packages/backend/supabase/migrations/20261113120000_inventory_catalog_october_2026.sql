-- Inventaris bahan baku dari struk Oktober 2026.
-- Sumber: reports/inventaris-oktober-2026 (rincian-seluruh-item.csv).
-- Aditif dan idempoten: tidak menghapus, tidak mengganti nama, tidak menyentuh
-- riwayat stok/resep/pesanan. Hanya menambah bahan baru, memperkaya alias,
-- mencatat audit, dan memperbarui antrean review kandidat.
--
-- Jalankan di DB produksi setelah backup. Bisa saat mode stok 'integrated'
-- maupun 'manual': guard diberi jalur khusus migrasi katalog yang hanya
-- berlaku dalam transaksi ini.

BEGIN;

SELECT set_config('yumi.allow_manual_material_create', 'on', true);
SELECT set_config('yumi.allow_inventory_catalog_write', 'on', true);

-- 0. Jalur migrasi katalog pada guard mode stok manual -------------------
CREATE OR REPLACE FUNCTION pos.guard_manual_stock_inventory_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF current_setting('yumi.allow_inventory_catalog_write', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
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

-- 1. Jejak audit permanen ------------------------------------------------
CREATE TABLE IF NOT EXISTS pos.inventory_catalog_update_log (
  id bigserial PRIMARY KEY,
  inventory_source_id text,
  ingredient_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('alias_added', 'material_created', 'alias_unchanged')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'oktober-2026-receipts',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE pos.inventory_catalog_update_log IS
  'Jejak perubahan katalog bahan baku. Baris tidak pernah dihapus.';

-- 2. Snapshot sebelum perubahan (sekali saja) ----------------------------
CREATE TABLE IF NOT EXISTS pos.inventory_oct2026_snapshot AS
SELECT i.*, now() AS snapshot_at FROM pos.inventory i;
COMMENT ON TABLE pos.inventory_oct2026_snapshot IS
  'Salinan pos.inventory sebelum pembaruan katalog Oktober 2026.';

-- 3. Cegah duplikasi nama bahan -----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS inventory_ingredient_name_unique
  ON pos.inventory (lower(btrim(ingredient_name)));

-- 4. Bahan baku baru -----------------------------------------------------
WITH baru(ingredient_name, unit, display_unit, aliases, note) AS (
  VALUES
    
    ('Panir Mix', 'kg', 'kg', '["Panir Mix", "Panir mix"]', 'Tepung panir/roti. 3 struk: 2026-10-04, 2026-10-15, 2026-10-25.'),
    ('Thyme', 'pcs', 'gram', '["Thyme", "THYME", "YOA Thyme", "Thyme Yoa"]', 'Herba kering YOA Thyme 24g, struk 2026-10-26.'),
    ('Kecap Anggur', 'botol', 'botol', '["Kecap Anggur", "Kecap Anggur Manis", "Kecap anggur manis", "kecap anggur manis"]', 'Kecap anggur manis, 4 baris struk. Belum ada di inventaris.'),
    ('Saus Tiram Panda', 'botol', 'botol', '["Saus Tiram Panda", "Saos tiram Panda", "Saus tiram Panda"]', 'Merek Panda, berbeda dari Saus Tiram (Mahsuri). 3 baris struk.'),
    ('Kemangi Segar', 'kg', 'kg', '["Kemangi Segar", "Kemangi", "kemangi"]', 'Kemangi segar (kg). Berbeda dari Kemangi Instant yang sudah ada.'),
    ('Freshmilk Diamond', 'pcs', 'liter', '["Freshmilk Diamond", "FM Diamond", "fm D."]', 'Susu segar merek Diamond; berbeda dari Freshmilk Greenfield.'),
    ('Minyak Bimoli', 'botol', 'liter', '["Minyak Bimoli", "BIMOLI"]', 'Minyak goreng merek Bimoli; inventaris memisahkan merek (Sunco, Tropical, Rizki).')
)
INSERT INTO pos.inventory (
  source_id, ingredient_name, unit, quantity, low_stock_threshold,
  display_unit, aliases, category, unit_status, creation_time, raw
)
SELECT
  'inv_oct26_' || substr(md5(lower(btrim(b.ingredient_name))), 1, 24),
  b.ingredient_name,
  b.unit,
  0,
  0,
  b.display_unit,
  b.aliases::jsonb,
  'kitchen',
  'AMBIGUOUS',
  extract(epoch FROM now()) * 1000,
  jsonb_build_object(
    'source', 'oktober-2026-receipts',
    'report', 'reports/inventaris-oktober-2026',
    'note', b.note
  )
FROM baru b
WHERE NOT EXISTS (
  SELECT 1 FROM pos.inventory i
  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name))
)
ON CONFLICT (source_id) DO NOTHING;

INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)
SELECT i.source_id, i.ingredient_name, 'material_created',
       jsonb_build_object('unit', i.unit, 'displayUnit', i.display_unit)
FROM pos.inventory i
WHERE i.source_id LIKE 'inv_oct26_%'
  AND NOT EXISTS (
    SELECT 1 FROM pos.inventory_catalog_update_log l
    WHERE l.inventory_source_id = i.source_id AND l.action = 'material_created'
  );

-- 5. Perkaya alias tanpa menghapus alias lama ---------------------------
CREATE OR REPLACE FUNCTION pg_temp.merge_alias(p_existing jsonb, p_add text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (lower(btrim(a))) a, ord
    FROM (
      SELECT value AS a, row_number() OVER () AS ord
      FROM jsonb_array_elements_text(coalesce(p_existing, '[]'::jsonb))
      UNION ALL
      SELECT x AS a, 100000 + row_number() OVER () AS ord
      FROM unnest(p_add) AS x
    ) merged
    WHERE btrim(a) <> ''
    ORDER BY lower(btrim(a)), ord
  ) dedup;
$$;

WITH tambahan(ingredient_name, aliases) AS (
  VALUES
    
    ('Angkak', ARRAY['ANGKAK/KG']::text[]),
    ('Apple Juice', ARRAY['Jungle apel', 'JUNGLE JC APPLE']::text[]),
    ('Ayam Cincang', ARRAY['Cincang Ayam']::text[]),
    ('Bakso', ARRAY['baso']::text[]),
    ('Bawang Bombai', ARRAY['B. Bmbai']::text[]),
    ('Bawang Daun', ARRAY['B. Daun', 'B. Jain', 'B.Jmn']::text[]),
    ('Bawang Goreng', ARRAY['B.goreng']::text[]),
    ('Bawang Putih', ARRAY['B-putih kupas', 'B. putih kupas']::text[]),
    ('Beras', ARRAY['Beras DT', 'Beras OT']::text[]),
    ('Bernardi Horeca Sosis', ARRAY['BERNARDI HORECA SOSIS SAPI']::text[]),
    ('Biji Wijen', ARRAY['biji wijen', 'Biji wijen', 'bj wijen']::text[]),
    ('Butter', ARRAY['ORCHID BTR UNSALT200']::text[]),
    ('C1000 Apple', ARRAY['YOU C1000 APPLE 140']::text[]),
    ('Cabe Domba', ARRAY['c. domba']::text[]),
    ('Cabe Keriting Merah', ARRAY['Kriting M']::text[]),
    ('Cabe Rawit', ARRAY['Cengek']::text[]),
    ('Coklat Powder', ARRAY['Coklat', 'Dripp Powder coklat']::text[]),
    ('Cream', ARRAY['Gold label', 'Gold Label', 'Goldlabel']::text[]),
    ('Delmonte Saus Cabe', ARRAY['Del hot', 'DEL MONTE EXTRA HOT CHILLI SAUCE']::text[]),
    ('Freshmilk Diamond', ARRAY['fm D.', 'FM Diamond', 'Freshmilk Diamond']::text[]),
    ('Gas 3 Kg', ARRAY['Gas']::text[]),
    ('Gula Aren', ARRAY['Gula merah']::text[]),
    ('Gula Pasir Putih', ARRAY['Gula putih']::text[]),
    ('Jeruk Limau', ARRAY['j. lamo', 'J. limo', 'J. lmo', 'Jeruk Lemo', 'Jeruk Limo']::text[]),
    ('Kecap Anggur', ARRAY['Kecap Anggur', 'Kecap anggur manis', 'kecap anggur manis', 'Kecap Anggur Manis']::text[]),
    ('Kecap Asin ABC', ARRAY['ABC KECAP ASIN', 'kecap asin abc']::text[]),
    ('Kecap Manis', ARRAY['Kecap Bango']::text[]),
    ('Kemangi Segar', ARRAY['kemangi', 'Kemangi', 'Kemangi Segar']::text[]),
    ('Kentang Shoestring', ARRAY['IDAHO SHOESTRING']::text[]),
    ('Kerupuk', ARRAY['Krupuk Oren']::text[]),
    ('Kulit Pangsit (Cap Jempol)', ARRAY['Pangsit', 'pangsit', 'pangst']::text[]),
    ('Lada Bubuk', ARRAY['LADAKU GROUND W100']::text[]),
    ('Lada Hitam Bubuk', ARRAY['LADA HTM BBK35GR']::text[]),
    ('Matcha Powder', ARRAY['Drip Matcha']::text[]),
    ('Mayonaise', ARRAY['Mayones']::text[]),
    ('Minyak Bimoli', ARRAY['BIMOLI', 'Minyak Bimoli']::text[]),
    ('Mix Vegetable', ARRAY['GOLD FARM MIX VEG500', 'GOLDEN FARM MIXED VEGETABLES']::text[]),
    ('Panir Mix', ARRAY['Panir Mix', 'Panir mix']::text[]),
    ('Paprika Powder', ARRAY['PAPRIKA POWDER/KG']::text[]),
    ('Peach Tea Max Tea', ARRAY['Max tea Peach tea']::text[]),
    ('Roti Tawar Gandum', ARRAY['YB TAWAR GANDUM']::text[]),
    ('Sapi Cincang', ARRAY['Daging Sapi Cincang']::text[]),
    ('Saus Tiram Panda', ARRAY['Saos tiram Panda', 'Saus tiram Panda', 'Saus Tiram Panda']::text[]),
    ('Saus Tomat (Del Monte)', ARRAY['Del tomat', 'Saos Tomet']::text[]),
    ('Selada (Ibu Teti Pasar)', ARRAY['Selada']::text[]),
    ('Sirup Green Apple', ARRAY['Tofico Green Apel']::text[]),
    ('Soda Water Schweppes', ARRAY['SCHWEPPES SDWATER250', 'SCHWEPPES SOWATER250']::text[]),
    ('Sunquick Lemon', ARRAY['Sq Lemon']::text[]),
    ('Telor Omega (Happy Egg)', ARRAY['Telor Omega', 'Telor Omega 30 butir']::text[]),
    ('Tepung Jagung', ARRAY['MAIZENAKU']::text[]),
    ('Thyme', ARRAY['Thyme', 'THYME', 'Thyme Yoa', 'YOA Thyme']::text[]),
    ('Tongcai', ARRAY['TONG CAI CLJ']::text[]),
    ('Ubi Cilembu', ARRAY['UBI', 'Ubi']::text[])
)
UPDATE pos.inventory i
SET aliases = pg_temp.merge_alias(i.aliases, t.aliases)
FROM tambahan t
WHERE lower(btrim(i.ingredient_name)) = lower(btrim(t.ingredient_name))
  AND i.aliases IS DISTINCT FROM pg_temp.merge_alias(i.aliases, t.aliases);

INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)
SELECT i.source_id, i.ingredient_name, 'alias_added',
       jsonb_build_object('aliases', i.aliases)
FROM pos.inventory i
WHERE EXISTS (
  SELECT 1 FROM (VALUES
    
    ('Angkak', ARRAY['ANGKAK/KG']::text[]),
    ('Apple Juice', ARRAY['Jungle apel', 'JUNGLE JC APPLE']::text[]),
    ('Ayam Cincang', ARRAY['Cincang Ayam']::text[]),
    ('Bakso', ARRAY['baso']::text[]),
    ('Bawang Bombai', ARRAY['B. Bmbai']::text[]),
    ('Bawang Daun', ARRAY['B. Daun', 'B. Jain', 'B.Jmn']::text[]),
    ('Bawang Goreng', ARRAY['B.goreng']::text[]),
    ('Bawang Putih', ARRAY['B-putih kupas', 'B. putih kupas']::text[]),
    ('Beras', ARRAY['Beras DT', 'Beras OT']::text[]),
    ('Bernardi Horeca Sosis', ARRAY['BERNARDI HORECA SOSIS SAPI']::text[]),
    ('Biji Wijen', ARRAY['biji wijen', 'Biji wijen', 'bj wijen']::text[]),
    ('Butter', ARRAY['ORCHID BTR UNSALT200']::text[]),
    ('C1000 Apple', ARRAY['YOU C1000 APPLE 140']::text[]),
    ('Cabe Domba', ARRAY['c. domba']::text[]),
    ('Cabe Keriting Merah', ARRAY['Kriting M']::text[]),
    ('Cabe Rawit', ARRAY['Cengek']::text[]),
    ('Coklat Powder', ARRAY['Coklat', 'Dripp Powder coklat']::text[]),
    ('Cream', ARRAY['Gold label', 'Gold Label', 'Goldlabel']::text[]),
    ('Delmonte Saus Cabe', ARRAY['Del hot', 'DEL MONTE EXTRA HOT CHILLI SAUCE']::text[]),
    ('Freshmilk Diamond', ARRAY['fm D.', 'FM Diamond', 'Freshmilk Diamond']::text[]),
    ('Gas 3 Kg', ARRAY['Gas']::text[]),
    ('Gula Aren', ARRAY['Gula merah']::text[]),
    ('Gula Pasir Putih', ARRAY['Gula putih']::text[]),
    ('Jeruk Limau', ARRAY['j. lamo', 'J. limo', 'J. lmo', 'Jeruk Lemo', 'Jeruk Limo']::text[]),
    ('Kecap Anggur', ARRAY['Kecap Anggur', 'Kecap anggur manis', 'kecap anggur manis', 'Kecap Anggur Manis']::text[]),
    ('Kecap Asin ABC', ARRAY['ABC KECAP ASIN', 'kecap asin abc']::text[]),
    ('Kecap Manis', ARRAY['Kecap Bango']::text[]),
    ('Kemangi Segar', ARRAY['kemangi', 'Kemangi', 'Kemangi Segar']::text[]),
    ('Kentang Shoestring', ARRAY['IDAHO SHOESTRING']::text[]),
    ('Kerupuk', ARRAY['Krupuk Oren']::text[]),
    ('Kulit Pangsit (Cap Jempol)', ARRAY['Pangsit', 'pangsit', 'pangst']::text[]),
    ('Lada Bubuk', ARRAY['LADAKU GROUND W100']::text[]),
    ('Lada Hitam Bubuk', ARRAY['LADA HTM BBK35GR']::text[]),
    ('Matcha Powder', ARRAY['Drip Matcha']::text[]),
    ('Mayonaise', ARRAY['Mayones']::text[]),
    ('Minyak Bimoli', ARRAY['BIMOLI', 'Minyak Bimoli']::text[]),
    ('Mix Vegetable', ARRAY['GOLD FARM MIX VEG500', 'GOLDEN FARM MIXED VEGETABLES']::text[]),
    ('Panir Mix', ARRAY['Panir Mix', 'Panir mix']::text[]),
    ('Paprika Powder', ARRAY['PAPRIKA POWDER/KG']::text[]),
    ('Peach Tea Max Tea', ARRAY['Max tea Peach tea']::text[]),
    ('Roti Tawar Gandum', ARRAY['YB TAWAR GANDUM']::text[]),
    ('Sapi Cincang', ARRAY['Daging Sapi Cincang']::text[]),
    ('Saus Tiram Panda', ARRAY['Saos tiram Panda', 'Saus tiram Panda', 'Saus Tiram Panda']::text[]),
    ('Saus Tomat (Del Monte)', ARRAY['Del tomat', 'Saos Tomet']::text[]),
    ('Selada (Ibu Teti Pasar)', ARRAY['Selada']::text[]),
    ('Sirup Green Apple', ARRAY['Tofico Green Apel']::text[]),
    ('Soda Water Schweppes', ARRAY['SCHWEPPES SDWATER250', 'SCHWEPPES SOWATER250']::text[]),
    ('Sunquick Lemon', ARRAY['Sq Lemon']::text[]),
    ('Telor Omega (Happy Egg)', ARRAY['Telor Omega', 'Telor Omega 30 butir']::text[]),
    ('Tepung Jagung', ARRAY['MAIZENAKU']::text[]),
    ('Thyme', ARRAY['Thyme', 'THYME', 'Thyme Yoa', 'YOA Thyme']::text[]),
    ('Tongcai', ARRAY['TONG CAI CLJ']::text[]),
    ('Ubi Cilembu', ARRAY['UBI', 'Ubi']::text[])
  ) AS t(ingredient_name, aliases)
  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(t.ingredient_name))
)
AND NOT EXISTS (
  SELECT 1 FROM pos.inventory_catalog_update_log l
  WHERE l.inventory_source_id = i.source_id AND l.action = 'alias_added'
);

-- 6. Antrean review kandidat (tidak menimpa keputusan manusia) ----------
WITH kandidat(source_id, normalized_name, match_status, target_name, raw_variants, mention_count) AS (
  VALUES
    
    ('receipt_candidate_2fb86053926aa365206cdc5fa18e5720', 'abc kecap asin', 'ALIAS_MATCH', 'Kecap Asin ABC', '["ABC KECAP ASIN"]', 1),
    ('receipt_candidate_5dc1843ebc5c39e803ed90d1964b16bb', 'air galon', 'EXACT_MATCH', 'Air Galon', '["Air Galon"]', 4),
    ('receipt_candidate_36162a31d2d325f51b0e456ebefea353', 'air mineral', 'EXACT_MATCH', 'Air Mineral', '["Air Mineral"]', 1),
    ('receipt_candidate_da1edb8a476165af5f0c59ba1efdd2da', 'angkak kg', 'ALIAS_MATCH', 'Angkak', '["ANGKAK/KG"]', 1),
    ('receipt_candidate_3502e01cd10ea725198ff9c83e4e1ad6', 'aquaproof', 'IGNORE', NULL, '["Aquaproof"]', 1),
    ('receipt_candidate_be64b47852adcfc2d0b0740a57c3f2ab', 'arabica fullwash halu', 'REVIEW', NULL, '["Arabica Fullwash Halu"]', 1),
    ('receipt_candidate_df029ff1adf2fa11ba5c9752c2d74f9b', 'arabika bali kintamani', 'REVIEW', NULL, '["Arabika Bali kintamani"]', 1),
    ('receipt_candidate_e9bb84466bf60d1d0548486873e6a11a', 'b bmbai', 'ALIAS_MATCH', 'Bawang Bombai', '["B. Bmbai"]', 1),
    ('receipt_candidate_dc1b13557521dac0294a051a56fde6a8', 'b daun', 'ALIAS_MATCH', 'Bawang Daun', '["B. Daun"]', 3),
    ('receipt_candidate_3d8d9846c601290b09175ad0ebdf06af', 'b goreng', 'ALIAS_MATCH', 'Bawang Goreng', '["B.goreng"]', 1),
    ('receipt_candidate_4d628a71463ea4900fcd1193f0cbfbf6', 'b jain', 'ALIAS_MATCH', 'Bawang Daun', '["B. Jain"]', 1),
    ('receipt_candidate_7ebd8ae7d0833a34eca98f09a19410cb', 'b jmn', 'ALIAS_MATCH', 'Bawang Daun', '["B.Jmn"]', 1),
    ('receipt_candidate_363ef8ee43640c21e50366d05aeda8b9', 'b puar', 'REVIEW', NULL, '["B. puar"]', 1),
    ('receipt_candidate_0e864f649eb0742f2c1560067426ac1c', 'b putih kupas', 'ALIAS_MATCH', 'Bawang Putih', '["B-putih kupas", "B. putih kupas"]', 2),
    ('receipt_candidate_6ed72815e65b51b6697eeae2eb466098', 'baso', 'ALIAS_MATCH', 'Bakso', '["baso"]', 1),
    ('receipt_candidate_03d46cd2515b9a6224e411ecc0277464', 'bawang merah', 'EXACT_MATCH', 'Bawang Merah', '["Bawang Merah"]', 2),
    ('receipt_candidate_26861d1d2b48002ecdd30addf2977df8', 'bcp gram', 'REVIEW', NULL, '["Bcp. gram"]', 1),
    ('receipt_candidate_26e6be60c463cb51a56ef7a30f163479', 'beras dt', 'ALIAS_MATCH', 'Beras', '["Beras DT"]', 6),
    ('receipt_candidate_10ee553e1af967c4846bfb3810a0104c', 'beras ot', 'ALIAS_MATCH', 'Beras', '["Beras OT"]', 1),
    ('receipt_candidate_336c8ef7237690205ac8cc3bd0d3da1b', 'bernardi horeca sosis sapi', 'ALIAS_MATCH', 'Bernardi Horeca Sosis', '["BERNARDI HORECA SOSIS SAPI"]', 5),
    ('receipt_candidate_e024a37056687ab3edd936369c0d570a', 'biji wijen', 'ALIAS_MATCH', 'Biji Wijen', '["Biji wijen", "biji wijen"]', 2),
    ('receipt_candidate_01e7bf1aff670f8a5275b88a6583f90d', 'bikin yamin', 'EXACT_MATCH', 'Bikin Yamin', '["Bikin Yamin"]', 3),
    ('receipt_candidate_48fb68da4ea9823d995205c7965df61e', 'bimoli', 'ALIAS_MATCH', 'Minyak Bimoli', '["BIMOLI"]', 1),
    ('receipt_candidate_f0d085f46d2ff7d11fc0448cdf1fc982', 'bj wijen', 'ALIAS_MATCH', 'Biji Wijen', '["bj wijen"]', 1),
    ('receipt_candidate_1462fe8688993b3480eab61c1e3d6e6d', 'blp', 'REVIEW', NULL, '["BLP", "Blp."]', 2),
    ('receipt_candidate_d9f2babb167353d055843c7d537e6a66', 'bowl', 'IGNORE', NULL, '["Bowl"]', 2),
    ('receipt_candidate_3936a1273dac91a0a27f57d775e9b06b', 'bowl 500', 'IGNORE', NULL, '["Bowl 500"]', 1),
    ('receipt_candidate_ef8ec46e189a1e4373b59dbdbc70df51', 'c domba', 'ALIAS_MATCH', 'Cabe Domba', '["c. domba"]', 2),
    ('receipt_candidate_700b3709eab9499f9683ff6c1bcb437e', 'c1000 apple', 'EXACT_MATCH', 'C1000 Apple', '["C1000 Apple"]', 1),
    ('receipt_candidate_3c37ac81aa9f84947b608955e96eadab', 'cabe kering', 'EXACT_MATCH', 'Cabe Kering', '["Cabe Kering"]', 1),
    ('receipt_candidate_b77b32c2af630debf6d10848973b0982', 'cementea', 'REVIEW', NULL, '["Cementea"]', 1),
    ('receipt_candidate_55a774bb6be65683a1c99fa656e87236', 'cengek', 'ALIAS_MATCH', 'Cabe Rawit', '["Cengek"]', 1),
    ('receipt_candidate_6a2aa0c6d59894cb6b32eea95c47de53', 'cincang ayam', 'ALIAS_MATCH', 'Ayam Cincang', '["Cincang Ayam"]', 9),
    ('receipt_candidate_414ba36094dc4727e1e1c9b1ebc20bc4', 'clear pkc lvndr 400', 'IGNORE', NULL, '["CLEAR PKC LVNDR 400"]', 1),
    ('receipt_candidate_3ca9f800fecbcf8d442535170a5f4a04', 'cling pk ungu r400', 'IGNORE', NULL, '["CLING PK UNGU R400"]', 1),
    ('receipt_candidate_9c0d8fe31de04613a6e5974d65c25e73', 'coklat', 'ALIAS_MATCH', 'Coklat Powder', '["Coklat"]', 1),
    ('receipt_candidate_f3a22c1ce8e0a5a96393703806e4ad0b', 'cream', 'EXACT_MATCH', 'Cream', '["Cream"]', 4),
    ('receipt_candidate_c6171781d65f3ccce1135e3c89850cfb', 'cup', 'IGNORE', NULL, '["Cup"]', 1),
    ('receipt_candidate_3982ceecaa0b72efbcfcbdb364fc4b67', 'cup saus', 'IGNORE', NULL, '["Cup saus"]', 1),
    ('receipt_candidate_f36f867bbaa294a02664743f24fa7b3b', 'daging sapi cincang', 'ALIAS_MATCH', 'Sapi Cincang', '["Daging Sapi Cincang"]', 9),
    ('receipt_candidate_06567799a78f6f0364dd4331c813e2af', 'dahlia tcb 3s', 'IGNORE', NULL, '["DAHLIA TCB 3S"]', 1),
    ('receipt_candidate_154fe6cf7318c86626d71ffda41e59f4', 'del bbq', 'REVIEW', NULL, '["Del bbq"]', 2),
    ('receipt_candidate_981324f5083b2ec9cb7bc5a9daffbfe8', 'del hot', 'ALIAS_MATCH', 'Delmonte Saus Cabe', '["Del hot"]', 2),
    ('receipt_candidate_a2cd8c5846076b930b31b613c1080ddd', 'del monte extra hot chilli sauce', 'ALIAS_MATCH', 'Delmonte Saus Cabe', '["DEL MONTE EXTRA HOT CHILLI SAUCE"]', 1),
    ('receipt_candidate_afb56540b3979c4c5caf7db94350e671', 'del tomat', 'ALIAS_MATCH', 'Saus Tomat (Del Monte)', '["Del tomat"]', 1),
    ('receipt_candidate_c2cb2c6d8eac033ed068a7cf35092782', 'desakubwgpti hbbk', 'REVIEW', NULL, '["DESAKUBWGPTI HBBK"]', 1),
    ('receipt_candidate_46bfb7e84c601065549ce557de27d376', 'desakubwgptihbk100g', 'REVIEW', NULL, '["DESAKUBWGPTIHBK100G"]', 1),
    ('receipt_candidate_a50ca3b11702b3851f8a4dbed24e7c02', 'drip matcha', 'ALIAS_MATCH', 'Matcha Powder', '["Drip Matcha"]', 2),
    ('receipt_candidate_38a23a2d6c0c04ff8d96db7a627020c2', 'dripp powder coklat', 'ALIAS_MATCH', 'Coklat Powder', '["Dripp Powder coklat"]', 1),
    ('receipt_candidate_07531a27e6a12f1fe6537d1d66c7c7d2', 'ebi 500gr', 'EXACT_MATCH', 'Ebi (500gr)', '["Ebi (500gr)"]', 1),
    ('receipt_candidate_2c74c20acfaf3f86417bac64e7ba0394', 'ekonomi pp jnp r1550', 'IGNORE', NULL, '["EKONOMI PP JNP R1550"]', 1),
    ('receipt_candidate_21ce395ec777ed541031c2f48517910f', 'es batu', 'EXACT_MATCH', 'Es Batu', '["Es Batu"]', 4),
    ('receipt_candidate_e18cc8d6d73a35f37f15b1adcd4667e2', 'eterna skb nylon 414', 'IGNORE', NULL, '["ETERNA SKB NYLON 414"]', 1),
    ('receipt_candidate_714d7cce82f8576e4c38c7353714c020', 'fm d', 'ALIAS_MATCH', 'Freshmilk Diamond', '["fm D."]', 1),
    ('receipt_candidate_a35c7e9691cf015b75bf0a6725f8bae2', 'fm diamond', 'ALIAS_MATCH', 'Freshmilk Diamond', '["FM Diamond"]', 1),
    ('receipt_candidate_735f699e314d3dfc6c5b2c9cc805909e', 'fm ef', 'REVIEW', NULL, '["Fm Ef"]', 2),
    ('receipt_candidate_f23df5f21b71c95e7199e510bcc811a4', 'freshmilk greenfield', 'EXACT_MATCH', 'Freshmilk Greenfield', '["Freshmilk Greenfield"]', 2),
    ('receipt_candidate_825b586d787d88efe6f309af40107c47', 'frisianflag coconut delight', 'EXACT_MATCH', 'Frisianflag Coconut Delight', '["Frisianflag Coconut Delight"]', 1),
    ('receipt_candidate_2fe840e13244a9d748883574c1f1b7b1', 'gas', 'ALIAS_MATCH', 'Gas 3 Kg', '["Gas"]', 2),
    ('receipt_candidate_883ae9601c90c5eb7da73099cdca1b91', 'gold farm mix veg500', 'ALIAS_MATCH', 'Mix Vegetable', '["GOLD FARM MIX VEG500"]', 1),
    ('receipt_candidate_035e43daf7f63545a02465f96f8d445a', 'gold label', 'ALIAS_MATCH', 'Cream', '["Gold Label", "Gold label"]', 5),
    ('receipt_candidate_364aa2a1b49314ce5d8f2601b43b5eff', 'golden farm mixed vegetables', 'ALIAS_MATCH', 'Mix Vegetable', '["GOLDEN FARM MIXED VEGETABLES"]', 2),
    ('receipt_candidate_d15e27b0ba7ad2f799e43eaa9693b943', 'goldlabel', 'ALIAS_MATCH', 'Cream', '["Goldlabel"]', 5),
    ('receipt_candidate_051493b2dd4072f33f648e9910735f99', 'gula aren', 'EXACT_MATCH', 'Gula Aren', '["Gula aren"]', 3),
    ('receipt_candidate_ecae432e0e603daa0051b08bdb9f474d', 'gula merah', 'ALIAS_MATCH', 'Gula Aren', '["Gula merah"]', 1),
    ('receipt_candidate_445dc3ca2ac5621fdf27ed2a93a5a279', 'gula putih', 'ALIAS_MATCH', 'Gula Pasir Putih', '["Gula putih"]', 2),
    ('receipt_candidate_a2090bf521a6454490cf416e9efaf296', 'hh1015', 'REVIEW', NULL, '["HH1015"]', 1),
    ('receipt_candidate_215b6e95f9d311be3ce350982feb28c3', 'hit ae lavender600ml', 'IGNORE', NULL, '["HIT AE LAVENDER600ML"]', 1),
    ('receipt_candidate_7f5d1618e7d28cc7bf32788672be04c2', 'hot', 'REVIEW', NULL, '["Hot"]', 1),
    ('receipt_candidate_33ea78007b433335dd4b08345f5be58a', 'idaho shoestring', 'ALIAS_MATCH', 'Kentang Shoestring', '["IDAHO SHOESTRING"]', 1),
    ('receipt_candidate_75e6e76c33471741a4ad2baedd714357', 'idola 15', 'REVIEW', NULL, '["Idola 15"]', 1),
    ('receipt_candidate_b6e0865063adc7182b6c23fab32bd58d', 'idola 26', 'REVIEW', NULL, '["Idola 26"]', 1),
    ('receipt_candidate_d746405c54af643295bccdb7778286e3', 'j lamo', 'ALIAS_MATCH', 'Jeruk Limau', '["j. lamo"]', 1),
    ('receipt_candidate_11a41c7940278a1d7ab9e3e0f93e1bba', 'j limo', 'ALIAS_MATCH', 'Jeruk Limau', '["J. limo"]', 1),
    ('receipt_candidate_67cf3bc89f4e2df5286a5b7a791ee2de', 'j lmo', 'ALIAS_MATCH', 'Jeruk Limau', '["J. lmo"]', 1),
    ('receipt_candidate_4dd9dabf358fe1aa75a5d24669c06f30', 'jcho', 'REVIEW', NULL, '["Jcho"]', 1),
    ('receipt_candidate_208536f1e940656d4e0dbebcc649bdcd', 'jeruk lemo', 'ALIAS_MATCH', 'Jeruk Limau', '["Jeruk Lemo"]', 1),
    ('receipt_candidate_4fc5bd45eb08035d485682c03d5d82e2', 'jeruk limo', 'ALIAS_MATCH', 'Jeruk Limau', '["Jeruk Limo"]', 1),
    ('receipt_candidate_db59afbda2f2ccb95bc9f6f1a6efb065', 'juho', 'REVIEW', NULL, '["Juho"]', 1),
    ('receipt_candidate_71322f6ad50a2d7d9d1fe42d4edaa83b', 'jungle apel', 'ALIAS_MATCH', 'Apple Juice', '["Jungle apel"]', 1),
    ('receipt_candidate_682f505ca56f8a5890834bd2ef6ba161', 'jungle jc apple', 'ALIAS_MATCH', 'Apple Juice', '["JUNGLE JC APPLE"]', 1),
    ('receipt_candidate_3df05b0667c077d7e152bdd65ba92fa9', 'kantong plastik besar u35', 'IGNORE', NULL, '["KANTONG PLASTIK BESAR U35"]', 1),
    ('receipt_candidate_fdf0085588b86fd5c2609f771c7be3bc', 'kantong plastik sedang u24', 'IGNORE', NULL, '["KANTONG PLASTIK SEDANG U24"]', 5),
    ('receipt_candidate_b14b1e9fee2076a2372e01c40132cdd3', 'kecap anggur', 'ALIAS_MATCH', 'Kecap Anggur', '["Kecap Anggur"]', 1),
    ('receipt_candidate_78a8a85d36d05ad716a7d8337962fa8f', 'kecap anggur manis', 'ALIAS_MATCH', 'Kecap Anggur', '["Kecap Anggur Manis", "Kecap anggur manis", "kecap anggur manis"]', 4),
    ('receipt_candidate_8f14c86a60a088f4c9b24c8fa3af36f0', 'kecap asin abc', 'ALIAS_MATCH', 'Kecap Asin ABC', '["kecap asin abc"]', 1),
    ('receipt_candidate_c7d93ba6770e780a77be0edd8165fe65', 'kecap bango', 'ALIAS_MATCH', 'Kecap Manis', '["Kecap Bango"]', 1),
    ('receipt_candidate_8eac0570d9c8f9a4f480146e75962b19', 'kecap manis', 'EXACT_MATCH', 'Kecap Manis', '["Kecap Manis"]', 1),
    ('receipt_candidate_22e308647a7f913132c14f96fee4016b', 'kemangi', 'ALIAS_MATCH', 'Kemangi Segar', '["Kemangi", "kemangi"]', 4),
    ('receipt_candidate_641ff0b88ba3bbb8e6f1cc1e5f05dd34', 'kemiri', 'EXACT_MATCH', 'Kemiri', '["Kemiri"]', 1),
    ('receipt_candidate_84ee0172f84551fc46f021a5ba099faf', 'kentang', 'EXACT_MATCH', 'Kentang', '["Kentang", "kentang"]', 7),
    ('receipt_candidate_c215bbcd33e2e1bd010078469dc4635e', 'kentang 2 sky', 'REVIEW', NULL, '["Kentang 2.sky"]', 1),
    ('receipt_candidate_8b1bc84ba92abd0371e495f0abd06bdc', 'kresek hd 22 polos', 'IGNORE', NULL, '["KRESEK HD 22 POLOS"]', 2),
    ('receipt_candidate_2532f6fa07601efb93593f09a9ca4f0d', 'kresek hd 28 polos', 'IGNORE', NULL, '["KRESEK HD 28 POLOS"]', 1),
    ('receipt_candidate_5d76db3551de865198723395cb8a781f', 'kresek hd28', 'IGNORE', NULL, '["KRESEK HD28"]', 1),
    ('receipt_candidate_40fb5735d3b2d4af5432426f39abd8c9', 'kresek hd28 0 25', 'IGNORE', NULL, '["KRESEK HD28 0.25"]', 5),
    ('receipt_candidate_99b6baf55bfca0df25a2600b21a9a4fa', 'kriting m', 'ALIAS_MATCH', 'Cabe Keriting Merah', '["Kriting M"]', 1),
    ('receipt_candidate_b422435964de29d3c032ac3fe085f7c5', 'krupuk oren', 'ALIAS_MATCH', 'Kerupuk', '["Krupuk Oren"]', 1),
    ('receipt_candidate_d2a863a651257c0f312ff8acd753abe7', 'lada htm bbk35gr', 'ALIAS_MATCH', 'Lada Hitam Bubuk', '["LADA HTM BBK35GR"]', 1),
    ('receipt_candidate_8e25375717fca6539c15a032d61c7af3', 'ladaku ground w100', 'ALIAS_MATCH', 'Lada Bubuk', '["LADAKU GROUND W100"]', 1),
    ('receipt_candidate_8492e88c64eff43b576e75872ebb2687', 'listrik dapina', 'IGNORE', NULL, '["Listrik Dapina"]', 1),
    ('receipt_candidate_8e9e0f2e40404ec84b696e6bfb6fda64', 'maizenaku', 'ALIAS_MATCH', 'Tepung Jagung', '["MAIZENAKU"]', 1),
    ('receipt_candidate_a9370f23e16aa2864c6ca1bfa4d51c4f', 'mangandri', 'EXACT_MATCH', 'Mangandri', '["Mangandri"]', 1),
    ('receipt_candidate_7d7dcb17eb484db0b233953946a5b43d', 'margarine filma', 'EXACT_MATCH', 'Margarine (Filma)', '["Margarine (Filma)"]', 2),
    ('receipt_candidate_0b5a2eb73351081db59c958758f856cf', 'max tea peach tea', 'ALIAS_MATCH', 'Peach Tea Max Tea', '["Max tea Peach tea"]', 1),
    ('receipt_candidate_b492bcb4d808e3dbae7bc203bda936b9', 'mayones', 'ALIAS_MATCH', 'Mayonaise', '["Mayones"]', 2),
    ('receipt_candidate_6769824ac36e7c5fdb166131adbea708', 'mbtfd', 'REVIEW', NULL, '["MBTFD"]', 1),
    ('receipt_candidate_c61772ee61818cd45d3ac49097fabeaf', 'minyak wijen', 'EXACT_MATCH', 'Minyak Wijen', '["Minyak Wijen"]', 1),
    ('receipt_candidate_c8d57f0ea506ac5880d2b49921cd8d9e', 'multi mp08', 'IGNORE', NULL, '["MULTI MP08"]', 3),
    ('receipt_candidate_6aee3151da230f4dbfb912c9b5bb68ee', 'nice fac tissue 1000', 'IGNORE', NULL, '["NICE FAC TISSUE 1000"]', 1),
    ('receipt_candidate_726baccd5bf4fef4d15600c8eac6f51a', 'ongkir', 'EXACT_MATCH', 'Ongkir', '["Ongkir"]', 3),
    ('receipt_candidate_f740b1f1eae1b1121a66b54b5fc9e051', 'orchid btr unsalt200', 'ALIAS_MATCH', 'Butter', '["ORCHID BTR UNSALT200"]', 1),
    ('receipt_candidate_2f662f8dd46ad065a17be94899138900', 'paket baskom', 'IGNORE', NULL, '["Paket baskom"]', 1),
    ('receipt_candidate_1d6b5fc8351479dae8103c0b4a0399f4', 'paket lap', 'IGNORE', NULL, '["Paket lap"]', 1),
    ('receipt_candidate_244a8519c566a7307bbf530c78ee5945', 'pangsit', 'ALIAS_MATCH', 'Kulit Pangsit (Cap Jempol)', '["Pangsit", "pangsit"]', 2),
    ('receipt_candidate_d3da7e07b079d923bb117722e156bf10', 'pangst', 'ALIAS_MATCH', 'Kulit Pangsit (Cap Jempol)', '["pangst"]', 1),
    ('receipt_candidate_b1e25cfab7ada68df7331148c72a084e', 'panir mix', 'ALIAS_MATCH', 'Panir Mix', '["Panir Mix", "Panir mix"]', 3),
    ('receipt_candidate_46fc588d3bf0fed833cdabc2b41ea72e', 'paprika powder kg', 'ALIAS_MATCH', 'Paprika Powder', '["PAPRIKA POWDER/KG"]', 1),
    ('receipt_candidate_fb7c1b0b2182894a4a0e4ad0f8045a21', 'ph fac tissue 1000s', 'IGNORE', NULL, '["PH FAC TISSUE 1000S"]', 1),
    ('receipt_candidate_924ae09fee8ed0a9b646acd082ab5e98', 'robusta beans', 'EXACT_MATCH', 'Robusta Beans', '["Robusta Beans"]', 1),
    ('receipt_candidate_e50b982caf1504c379de85da3a87fe35', 'robusta temanggung', 'REVIEW', NULL, '["Robusta Temanggung"]', 1),
    ('receipt_candidate_5a7e77d28b3ce9018cc67b2962534377', 'rose brand', 'REVIEW', NULL, '["ROSE BRAND"]', 3),
    ('receipt_candidate_31f205fa15dd4c4ea8421a6f1fb61b90', 'samono wpump sw cq04', 'IGNORE', NULL, '["SAMONO WPUMP SW_CQ04"]', 1),
    ('receipt_candidate_e1823cffbd84f42956cae6918de4c9a4', 'sampah', 'EXACT_MATCH', 'Sampah', '["Sampah"]', 2),
    ('receipt_candidate_09a010f68a475ac5c8b40c6b9fbafefc', 'saos tiram panda', 'ALIAS_MATCH', 'Saus Tiram Panda', '["Saos tiram Panda"]', 2),
    ('receipt_candidate_80627a286f8ece152731fe33ffa9acef', 'saos tomet', 'ALIAS_MATCH', 'Saus Tomat (Del Monte)', '["Saos Tomet"]', 1),
    ('receipt_candidate_5373a5e593819d523b596ea4c665fd17', 'saus tiram mahsuri', 'EXACT_MATCH', 'Saus Tiram (Mahsuri)', '["Saus Tiram (Mahsuri)"]', 1),
    ('receipt_candidate_d1cb9c2b78b005ed0b0c82fe427b32e3', 'saus tiram panda', 'ALIAS_MATCH', 'Saus Tiram Panda', '["Saus tiram Panda"]', 1),
    ('receipt_candidate_9e6b5f170cbdba21ea3f6e9fc912dab8', 'schweppes sdwater250', 'ALIAS_MATCH', 'Soda Water Schweppes', '["SCHWEPPES SDWATER250"]', 3),
    ('receipt_candidate_71c592c5703679fc87d40b66bc8cdec1', 'schweppes soda', 'EXACT_MATCH', 'Schweppes Soda', '["Schweppes Soda"]', 1),
    ('receipt_candidate_ec64613c2f08039b8fe02a6c6b1a1ebb', 'schweppes sowater250', 'ALIAS_MATCH', 'Soda Water Schweppes', '["SCHWEPPES SOWATER250"]', 1),
    ('receipt_candidate_8ec01649d9ef6c4bd532e4fa8336dd80', 'selada', 'ALIAS_MATCH', 'Selada (Ibu Teti Pasar)', '["Selada"]', 4),
    ('receipt_candidate_fd9a8a2b1bf6294509a0ec9bf4c3825b', 'selada ibu teti pasar', 'EXACT_MATCH', 'Selada (Ibu Teti Pasar)', '["Selada (Ibu Teti Pasar)"]', 3),
    ('receipt_candidate_d056e60c222b1bfac4b7e19fcb54bb6a', 'sh1008 disc 10', 'IGNORE', NULL, '["SH1008 DISC 10%"]', 1),
    ('receipt_candidate_7d8cc7fbdb692b4063da3276c0f08a9f', 'simas', 'REVIEW', NULL, '["Simas"]', 2),
    ('receipt_candidate_ba635b93b0a0c61af325a1f06189860c', 'sinas', 'REVIEW', NULL, '["Sinas"]', 1),
    ('receipt_candidate_b2bed02002fba34607f1dad267037f88', 'spork bening', 'IGNORE', NULL, '["Spork bening"]', 1),
    ('receipt_candidate_d05dce71afefc2b1380c86387505ae76', 'sprite kosong', 'IGNORE', NULL, '["Sprite kosong"]', 1),
    ('receipt_candidate_622eca74d1592dec525b1444664793c3', 'sq lemon', 'ALIAS_MATCH', 'Sunquick Lemon', '["Sq Lemon"]', 1),
    ('receipt_candidate_afe50f8294a0dfe413397725cf881fa1', 'stella ae sakura 350', 'IGNORE', NULL, '["STELLA AE SAKURA 350"]', 1),
    ('receipt_candidate_c17f0d5029b2592043f1a275716de8d6', 'telor omega', 'ALIAS_MATCH', 'Telor Omega (Happy Egg)', '["Telor Omega"]', 4),
    ('receipt_candidate_cbf47405a7aec22c7e3dc025911f1755', 'telor omega 30 butir', 'ALIAS_MATCH', 'Telor Omega (Happy Egg)', '["Telor Omega 30 butir"]', 1),
    ('receipt_candidate_98893822192b0db36884a1892fc7158e', 'thermal silver', 'IGNORE', NULL, '["Thermal Silver"]', 1),
    ('receipt_candidate_965b46f5fa31679327eb438f6249c982', 'thyme', 'ALIAS_MATCH', 'Thyme', '["THYME"]', 1),
    ('receipt_candidate_143bb3d3d79cd75b0a4f5ca911266d85', 'timun', 'EXACT_MATCH', 'Timun', '["Timun", "timun"]', 8),
    ('receipt_candidate_3a36f8f25fffb0ef9cefc13a5e0c896a', 'tofico green apel', 'ALIAS_MATCH', 'Sirup Green Apple', '["Tofico Green Apel"]', 1),
    ('receipt_candidate_0996326bcffbdd8f7a0ea7e4dd63f8a1', 'tomat 12 x 25', 'REVIEW', NULL, '["Tomat 12 x 25"]', 1),
    ('receipt_candidate_9f3cdec086995cb1946712b6f30a4918', 'tomat 12x25', 'REVIEW', NULL, '["Tomat 12x25"]', 1),
    ('receipt_candidate_ccb02a5815d6354f6a35e3fa00f68cf9', 'tong cai clj', 'ALIAS_MATCH', 'Tongcai', '["TONG CAI CLJ"]', 1),
    ('receipt_candidate_90087ac97c12ec863d0caca0021eb745', 'trashbag go', 'IGNORE', NULL, '["Trashbag go"]', 1),
    ('receipt_candidate_4ee604399243c9f35c044f7ddfebbdb0', 'ttl grnltdmshroom400', 'REVIEW', NULL, '["TTL GRNLTDMSHROOM400"]', 2),
    ('receipt_candidate_e20f93a61d09a5e2dce9f4401ba1f9c9', 'tutup bowl', 'IGNORE', NULL, '["Tutup Bowl"]', 2),
    ('receipt_candidate_0e3442a461073be8f2d208c8282a9c0e', 'tutup bowl 500', 'IGNORE', NULL, '["Tutup bowl 500"]', 1),
    ('receipt_candidate_b7b4fe78377ca0959f88a01e2d2cc73d', 'ubi', 'ALIAS_MATCH', 'Ubi Cilembu', '["UBI", "Ubi"]', 3),
    ('receipt_candidate_eb768729bbb439a432327d53eca0edea', 'vipco', 'REVIEW', NULL, '["VIPCO"]', 1),
    ('receipt_candidate_763c79d443f9a92e6ad3a96a0e593be9', 'wipol krbl cmra r720', 'IGNORE', NULL, '["WIPOL KRBL CMRA R720"]', 1),
    ('receipt_candidate_8cb6e0757cf714fdbdbe3b5aa38d9ca5', 'wraping kecil', 'IGNORE', NULL, '["Wraping kecil"]', 1),
    ('receipt_candidate_0049ede6442a9e5e5a4ac40b38dde54e', 'yb tawar gandum', 'ALIAS_MATCH', 'Roti Tawar Gandum', '["YB TAWAR GANDUM"]', 8),
    ('receipt_candidate_773666db0c4ece656711975a8f81a5d2', 'yoasabutspon3s', 'IGNORE', NULL, '["YOASABUTSPON3S"]', 1),
    ('receipt_candidate_d7d25243318d5290ff0e41ad31d732fa', 'you c1000 apple 140', 'ALIAS_MATCH', 'C1000 Apple', '["YOU C1000 APPLE 140"]', 1)
)
INSERT INTO pos.inventory_item_candidates (
  source_id, normalized_name, match_status, proposed_inventory_source_id,
  proposed_canonical_name, confidence, raw_variants, mention_count,
  review_reason, raw
)
SELECT
  k.source_id,
  k.normalized_name,
  k.match_status,
  i.source_id,
  i.ingredient_name,
  CASE k.match_status WHEN 'EXACT_MATCH' THEN 'HIGH' WHEN 'ALIAS_MATCH' THEN 'MEDIUM' ELSE 'LOW' END,
  k.raw_variants::jsonb,
  k.mention_count,
  CASE k.match_status
    WHEN 'EXACT_MATCH' THEN 'Nama struk sama dengan nama inventaris.'
    WHEN 'ALIAS_MATCH' THEN 'Nama struk dipetakan sebagai alias bahan inventaris.'
    WHEN 'IGNORE' THEN 'Kemasan/operasional, bukan bahan baku.'
    ELSE 'Nama belum pasti; perlu verifikasi foto/satuan sebelum digabung.'
  END,
  jsonb_build_object('source', 'oktober-2026-receipts', 'variants', k.raw_variants::jsonb)
FROM kandidat k
LEFT JOIN pos.inventory i
  ON k.target_name IS NOT NULL
 AND lower(btrim(i.ingredient_name)) = lower(btrim(k.target_name))
ON CONFLICT (normalized_name_key) DO UPDATE
SET match_status = EXCLUDED.match_status,
    proposed_inventory_source_id = EXCLUDED.proposed_inventory_source_id,
    proposed_canonical_name = EXCLUDED.proposed_canonical_name,
    confidence = EXCLUDED.confidence,
    raw_variants = EXCLUDED.raw_variants,
    mention_count = GREATEST(pos.inventory_item_candidates.mention_count, EXCLUDED.mention_count),
    review_reason = EXCLUDED.review_reason,
    raw = pos.inventory_item_candidates.raw || EXCLUDED.raw,
    updated_at = now()
WHERE pos.inventory_item_candidates.reviewed_by IS NULL
  AND pos.inventory_item_candidates.match_status IN ('REVIEW', 'EXACT_MATCH', 'ALIAS_MATCH', 'NEW_CANDIDATE');

COMMIT;
