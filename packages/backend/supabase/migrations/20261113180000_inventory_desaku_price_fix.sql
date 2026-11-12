-- Koreksi harga baris merek Desaku.
--
-- Harga awal (7.000) keliru karena generator mencampur bukti struk dengan satuan
-- berbeda. Bukti item struk yang jelas menunjukkan median 23.800 per 100 g
-- (13 dari 19 baris bernilai 23.800; 2 baris 23.400). Migrasi ini idempoten dan
-- hanya menyentuh harga, bukan quantity/riwayat.

BEGIN;

SELECT set_config('yumi.allow_inventory_catalog_write', 'on', true);

UPDATE pos.inventory
SET last_purchase_price = 23800
WHERE source_id = 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2'
  AND ingredient_name = 'Bawang Putih Bubuk Desaku 100g'
  AND last_purchase_price IS DISTINCT FROM 23800;

UPDATE pos.inventory
SET raw = jsonb_set(
  coalesce(raw, '{}'::jsonb),
  '{priceFix}',
  jsonb_build_object(
    'from', 7000,
    'to', 23800,
    'reason', 'median bukti item struk 100 g; harga awal salah satuan',
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  true
)
WHERE source_id = 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2'
  AND ingredient_name = 'Bawang Putih Bubuk Desaku 100g'
  AND raw -> 'priceFix' IS NULL;

COMMIT;
