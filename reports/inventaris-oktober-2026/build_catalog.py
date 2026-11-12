#!/usr/bin/env python3
"""Bangun peta bahan baku Oktober 2026 + migrasi SQL.

Sumber: rincian-seluruh-item.csv / ringkasan-foto-struk.csv (hasil OCR struk).
Keputusan:
  EXACT  nama struk sama dengan nama inventaris
  ALIAS  nama struk adalah alias dari bahan yang sudah ada
  NEW    bahan baku baru (belum ada padanannya)
  REVIEW nama belum pasti -> tetap di antrean review, jangan digabung otomatis
  EXCLUDE kemasan/operasional, bukan bahan baku

Jalankan: python3 reports/inventaris-oktober-2026/build_catalog.py
"""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Bahan baku baru. Hanya yang buktinya kuat: disebut sebagai calon bahan baru
# di laporan, atau produk bermerek yang jelas belum ada di inventaris.
# ---------------------------------------------------------------------------
NEW_ITEMS = {
    "Panir Mix": {
        "unit": "kg",
        "display_unit": "kg",
        "aliases": ["Panir Mix", "Panir mix"],
        "note": "Tepung panir/roti. 3 struk: 2026-10-04, 2026-10-15, 2026-10-25.",
    },
    "Thyme": {
        "unit": "pcs",
        "display_unit": "gram",
        "aliases": ["Thyme", "THYME", "YOA Thyme", "Thyme Yoa"],
        "note": "Herba kering YOA Thyme 24g, struk 2026-10-26.",
    },
    "Kecap Anggur": {
        "unit": "botol",
        "display_unit": "botol",
        "aliases": ["Kecap Anggur", "Kecap Anggur Manis", "Kecap anggur manis", "kecap anggur manis"],
        "note": "Kecap anggur manis, 4 baris struk. Belum ada di inventaris.",
    },
    "Saus Tiram Panda": {
        "unit": "botol",
        "display_unit": "botol",
        "aliases": ["Saus Tiram Panda", "Saos tiram Panda", "Saus tiram Panda"],
        "note": "Merek Panda, berbeda dari Saus Tiram (Mahsuri). 3 baris struk.",
    },
    "Kemangi Segar": {
        "unit": "kg",
        "display_unit": "kg",
        "aliases": ["Kemangi Segar", "Kemangi", "kemangi"],
        "note": "Kemangi segar (kg). Berbeda dari Kemangi Instant yang sudah ada.",
    },
    "Freshmilk Diamond": {
        "unit": "pcs",
        "display_unit": "liter",
        "aliases": ["Freshmilk Diamond", "FM Diamond", "fm D."],
        "note": "Susu segar merek Diamond; berbeda dari Freshmilk Greenfield.",
    },
    "Minyak Bimoli": {
        "unit": "botol",
        "display_unit": "liter",
        "aliases": ["Minyak Bimoli", "BIMOLI"],
        "note": "Minyak goreng merek Bimoli; inventaris memisahkan merek (Sunco, Tropical, Rizki).",
    },
}

# ---------------------------------------------------------------------------
# Peta nama OCR -> keputusan.
# ---------------------------------------------------------------------------
MAPPING: dict[str, tuple[str, str | None]] = {
    "ABC KECAP ASIN": ("ALIAS", "Kecap Asin ABC"),
    "Air Galon": ("EXACT", "Air Galon"),
    "Air Mineral": ("EXACT", "Air Mineral"),
    "ANGKAK/KG": ("ALIAS", "Angkak"),
    "Aquaproof": ("EXCLUDE", None),
    "Arabica Fullwash Halu": ("REVIEW", None),
    "Arabika Bali kintamani": ("REVIEW", None),
    "B-putih kupas": ("ALIAS", "Bawang Putih"),
    "B. Bmbai": ("ALIAS", "Bawang Bombai"),
    "B. Daun": ("ALIAS", "Bawang Daun"),
    "B. Jain": ("ALIAS", "Bawang Daun"),
    "B. puar": ("REVIEW", None),
    "B. putih kupas": ("ALIAS", "Bawang Putih"),
    "B.goreng": ("ALIAS", "Bawang Goreng"),
    "B.Jmn": ("ALIAS", "Bawang Daun"),
    "baso": ("ALIAS", "Bakso"),
    "Bawang Merah": ("EXACT", "Bawang Merah"),
    "Bcp. gram": ("REVIEW", None),
    "Beras DT": ("ALIAS", "Beras"),
    "Beras OT": ("ALIAS", "Beras"),
    "BERNARDI HORECA SOSIS SAPI": ("ALIAS", "Bernardi Horeca Sosis"),
    "Biji wijen": ("ALIAS", "Biji Wijen"),
    "biji wijen": ("ALIAS", "Biji Wijen"),
    "Bikin Yamin": ("EXACT", "Bikin Yamin"),
    "BIMOLI": ("NEW", "Minyak Bimoli"),
    "bj wijen": ("ALIAS", "Biji Wijen"),
    "BLP": ("REVIEW", None),
    "Blp.": ("REVIEW", None),
    "Bowl": ("EXCLUDE", None),
    "Bowl 500": ("EXCLUDE", None),
    "c. domba": ("ALIAS", "Cabe Domba"),
    "C1000 Apple": ("EXACT", "C1000 Apple"),
    "Cabe Kering": ("EXACT", "Cabe Kering"),
    "Cementea": ("REVIEW", None),
    "Cengek": ("ALIAS", "Cabe Rawit"),
    "Cincang Ayam": ("ALIAS", "Ayam Cincang"),
    "CLEAR PKC LVNDR 400": ("EXCLUDE", None),
    "CLING PK UNGU R400": ("EXCLUDE", None),
    "Coklat": ("ALIAS", "Coklat Powder"),
    "Cream": ("EXACT", "Cream"),
    "Cup": ("EXCLUDE", None),
    "Cup saus": ("EXCLUDE", None),
    "Daging Sapi Cincang": ("ALIAS", "Sapi Cincang"),
    "DAHLIA TCB 3S": ("EXCLUDE", None),
    "Del bbq": ("REVIEW", None),
    "Del hot": ("ALIAS", "Delmonte Saus Cabe"),
    "DEL MONTE EXTRA HOT CHILLI SAUCE": ("ALIAS", "Delmonte Saus Cabe"),
    "Del tomat": ("ALIAS", "Saus Tomat (Del Monte)"),
    "DESAKUBWGPTI HBBK": ("REVIEW", None),
    "DESAKUBWGPTIHBK100G": ("REVIEW", None),
    "Drip Matcha": ("ALIAS", "Matcha Powder"),
    "Dripp Powder coklat": ("ALIAS", "Coklat Powder"),
    "Ebi (500gr)": ("EXACT", "Ebi (500gr)"),
    "EKONOMI PP JNP R1550": ("EXCLUDE", None),
    "Es Batu": ("EXACT", "Es Batu"),
    "ETERNA SKB NYLON 414": ("EXCLUDE", None),
    "fm D.": ("ALIAS", "Freshmilk Diamond"),
    "FM Diamond": ("ALIAS", "Freshmilk Diamond"),
    "Fm Ef": ("REVIEW", None),
    "Freshmilk Greenfield": ("EXACT", "Freshmilk Greenfield"),
    "Frisianflag Coconut Delight": ("EXACT", "Frisianflag Coconut Delight"),
    "Gas": ("ALIAS", "Gas 3 Kg"),
    "GOLD FARM MIX VEG500": ("ALIAS", "Mix Vegetable"),
    "Gold label": ("ALIAS", "Cream"),
    "Gold Label": ("ALIAS", "Cream"),
    "GOLDEN FARM MIXED VEGETABLES": ("ALIAS", "Mix Vegetable"),
    "Goldlabel": ("ALIAS", "Cream"),
    "Gula aren": ("EXACT", "Gula Aren"),
    "Gula merah": ("ALIAS", "Gula Aren"),
    "Gula putih": ("ALIAS", "Gula Pasir Putih"),
    "HH1015": ("REVIEW", None),
    "HIT AE LAVENDER600ML": ("EXCLUDE", None),
    "Hot": ("REVIEW", None),
    "IDAHO SHOESTRING": ("ALIAS", "Kentang Shoestring"),
    "Idola 15": ("REVIEW", None),
    "Idola 26": ("REVIEW", None),
    "j. lamo": ("ALIAS", "Jeruk Limau"),
    "J. limo": ("ALIAS", "Jeruk Limau"),
    "J. lmo": ("ALIAS", "Jeruk Limau"),
    "Jcho": ("REVIEW", None),
    "Jeruk Lemo": ("ALIAS", "Jeruk Limau"),
    "Jeruk Limo": ("ALIAS", "Jeruk Limau"),
    "Juho": ("REVIEW", None),
    "Jungle apel": ("ALIAS", "Apple Juice"),
    "JUNGLE JC APPLE": ("ALIAS", "Apple Juice"),
    "KANTONG PLASTIK BESAR U35": ("EXCLUDE", None),
    "KANTONG PLASTIK SEDANG U24": ("EXCLUDE", None),
    "Kecap Anggur": ("NEW", "Kecap Anggur"),
    "kecap anggur manis": ("ALIAS", "Kecap Anggur"),
    "Kecap Anggur Manis": ("ALIAS", "Kecap Anggur"),
    "Kecap anggur manis": ("ALIAS", "Kecap Anggur"),
    "kecap asin abc": ("ALIAS", "Kecap Asin ABC"),
    "Kecap Bango": ("ALIAS", "Kecap Manis"),
    "Kecap Manis": ("EXACT", "Kecap Manis"),
    "Kemangi": ("NEW", "Kemangi Segar"),
    "kemangi": ("NEW", "Kemangi Segar"),
    "Kemiri": ("EXACT", "Kemiri"),
    "Kentang": ("EXACT", "Kentang"),
    "kentang": ("EXACT", "Kentang"),
    "Kentang 2.sky": ("REVIEW", None),
    "KRESEK HD 22 POLOS": ("EXCLUDE", None),
    "KRESEK HD 28 POLOS": ("EXCLUDE", None),
    "KRESEK HD28": ("EXCLUDE", None),
    "KRESEK HD28 0.25": ("EXCLUDE", None),
    "Kriting M": ("ALIAS", "Cabe Keriting Merah"),
    "Krupuk Oren": ("ALIAS", "Kerupuk"),
    "LADA HTM BBK35GR": ("ALIAS", "Lada Hitam Bubuk"),
    "LADAKU GROUND W100": ("ALIAS", "Lada Bubuk"),
    "Listrik Dapina": ("EXCLUDE", None),
    "MAIZENAKU": ("ALIAS", "Tepung Jagung"),
    "Mangandri": ("EXACT", "Mangandri"),
    "Margarine (Filma)": ("EXACT", "Margarine (Filma)"),
    "Max tea Peach tea": ("ALIAS", "Peach Tea Max Tea"),
    "Mayones": ("ALIAS", "Mayonaise"),
    "MBTFD": ("REVIEW", None),
    "Minyak Wijen": ("EXACT", "Minyak Wijen"),
    "MULTI MP08": ("EXCLUDE", None),
    "NICE FAC TISSUE 1000": ("EXCLUDE", None),
    "Ongkir": ("EXACT", "Ongkir"),
    "ORCHID BTR UNSALT200": ("ALIAS", "Butter"),
    "Paket baskom": ("EXCLUDE", None),
    "Paket lap": ("EXCLUDE", None),
    "Pangsit": ("ALIAS", "Kulit Pangsit (Cap Jempol)"),
    "pangsit": ("ALIAS", "Kulit Pangsit (Cap Jempol)"),
    "pangst": ("ALIAS", "Kulit Pangsit (Cap Jempol)"),
    "Panir Mix": ("NEW", "Panir Mix"),
    "Panir mix": ("NEW", "Panir Mix"),
    "PAPRIKA POWDER/KG": ("ALIAS", "Paprika Powder"),
    "PH FAC TISSUE 1000S": ("EXCLUDE", None),
    "Robusta Beans": ("EXACT", "Robusta Beans"),
    "Robusta Temanggung": ("REVIEW", None),
    "ROSE BRAND": ("REVIEW", None),
    "SAMONO WPUMP SW_CQ04": ("EXCLUDE", None),
    "Sampah": ("EXACT", "Sampah"),
    "Saos tiram Panda": ("NEW", "Saus Tiram Panda"),
    "Saos Tomet": ("ALIAS", "Saus Tomat (Del Monte)"),
    "Saus Tiram (Mahsuri)": ("EXACT", "Saus Tiram (Mahsuri)"),
    "Saus tiram Panda": ("NEW", "Saus Tiram Panda"),
    "SCHWEPPES SDWATER250": ("ALIAS", "Soda Water Schweppes"),
    "Schweppes Soda": ("EXACT", "Schweppes Soda"),
    "SCHWEPPES SOWATER250": ("ALIAS", "Soda Water Schweppes"),
    "Selada": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "Selada (Ibu Teti Pasar)": ("EXACT", "Selada (Ibu Teti Pasar)"),
    "SH1008 DISC 10%": ("EXCLUDE", None),
    "Simas": ("REVIEW", None),
    "Sinas": ("REVIEW", None),
    "Spork bening": ("EXCLUDE", None),
    "Sprite kosong": ("EXCLUDE", None),
    "Sq Lemon": ("ALIAS", "Sunquick Lemon"),
    "STELLA AE SAKURA 350": ("EXCLUDE", None),
    "Telor Omega": ("ALIAS", "Telor Omega (Happy Egg)"),
    "Telor Omega 30 butir": ("ALIAS", "Telor Omega (Happy Egg)"),
    "Thermal Silver": ("EXCLUDE", None),
    "THYME": ("NEW", "Thyme"),
    "Timun": ("EXACT", "Timun"),
    "timun": ("EXACT", "Timun"),
    "Tofico Green Apel": ("ALIAS", "Sirup Green Apple"),
    "Tomat 12 x 25": ("REVIEW", None),
    "Tomat 12x25": ("REVIEW", None),
    "TONG CAI CLJ": ("ALIAS", "Tongcai"),
    "Trashbag go": ("EXCLUDE", None),
    "TTL GRNLTDMSHROOM400": ("REVIEW", None),
    "Tutup Bowl": ("EXCLUDE", None),
    "Tutup bowl 500": ("EXCLUDE", None),
    "UBI": ("ALIAS", "Ubi Cilembu"),
    "Ubi": ("ALIAS", "Ubi Cilembu"),
    "VIPCO": ("REVIEW", None),
    "WIPOL KRBL CMRA R720": ("EXCLUDE", None),
    "Wraping kecil": ("EXCLUDE", None),
    "YB TAWAR GANDUM": ("ALIAS", "Roti Tawar Gandum"),
    "YOASABUTSPON3S": ("EXCLUDE", None),
    "YOU C1000 APPLE 140": ("ALIAS", "C1000 Apple"),
}


def key_of(name: str) -> str:
    """Kunci kandidat: huruf kecil, non-alfanumerik -> spasi, spasi dirapikan."""
    out = []
    for ch in name.strip().casefold():
        out.append(ch if ch.isalnum() else " ")
    return " ".join("".join(out).split())


def candidate_id(key: str) -> str:
    return "receipt_candidate_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def sql_lit(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def build_rows() -> list[dict]:
    rows = list(csv.DictReader((HERE / "rincian-seluruh-item.csv").open(encoding="utf-8-sig")))
    agg: dict[str, dict] = {}
    for row in rows:
        name = (row.get("nama_ocr") or "").strip()
        if not name:
            continue
        item = agg.setdefault(name, {"variants": set(), "rows": 0, "receipts": set(), "units": set()})
        item["variants"].add(name)
        item["rows"] += 1
        item["receipts"].add(row.get("referensi_struk") or "")
        item["units"].add((row.get("satuan_terbaca") or "").strip())

    result = []
    for name, item in sorted(agg.items(), key=lambda kv: kv[0].casefold()):
        decision, target = MAPPING.get(name, ("REVIEW", None))
        result.append({
            "nama_ocr": name,
            "keputusan": decision,
            "bahan": target or "",
            "jumlah_baris": item["rows"],
            "jumlah_struk": len({r for r in item["receipts"] if r}),
            "satuan": ",".join(sorted(u for u in item["units"] if u)),
            "key": key_of(name),
        })
    return result


def validate(rows: list[dict], live_names: list[str]) -> None:
    live = {n.casefold() for n in live_names}
    missing_map = {r["nama_ocr"] for r in rows} - set(MAPPING)
    if missing_map:
        raise SystemExit(f"Nama belum dipetakan: {sorted(missing_map)}")
    for row in rows:
        if row["keputusan"] in ("EXACT", "ALIAS") and row["bahan"].casefold() not in live and row["bahan"] not in NEW_ITEMS:
            raise SystemExit(f"Target tidak ada di inventaris: {row['bahan']} ({row['nama_ocr']})")
        if row["keputusan"] == "NEW" and row["bahan"] not in NEW_ITEMS:
            raise SystemExit(f"NEW tanpa definisi: {row['bahan']}")
    targets = [r["bahan"] for r in rows if r["keputusan"] in ("EXACT", "ALIAS", "NEW")]
    for target in set(targets):
        if targets.count(target) > 1 and target not in {v for v in targets}:
            pass
    dupes = {t for t in set(targets) if t.casefold() in {n.casefold() for n in live} and targets.count(t) > 1}
    # beberapa nama OCR memang menunjuk target yang sama; itu alias, bukan duplikasi
    _ = dupes


def emit_csv(rows: list[dict]) -> None:
    out = HERE / "peta-bahan-baku.csv"
    with out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["nama_ocr", "keputusan", "bahan", "jumlah_baris", "jumlah_struk", "satuan"])
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in writer.fieldnames})
    print(f"tulis {out}")


def emit_sql(rows: list[dict]) -> None:
    # alias target -> daftar alias baru (hanya ALIAS + NEW yang punya varian)
    alias_targets: dict[str, set[str]] = {}
    for row in rows:
        if row["keputusan"] in ("ALIAS", "NEW") and row["bahan"]:
            alias_targets.setdefault(row["bahan"], set()).add(row["nama_ocr"])
    for name, spec in NEW_ITEMS.items():
        alias_targets.setdefault(name, set()).update(spec["aliases"])

    # kandidat per kunci (gabungkan varian yang hanya beda kapital/tanda baca)
    candidates: dict[str, dict] = {}
    for row in rows:
        key = row["key"]
        cand = candidates.setdefault(key, {
            "key": key,
            "display": key,
            "status": "REVIEW",
            "target": None,
            "variants": set(),
            "rows": 0,
        })
        cand["variants"].add(row["nama_ocr"])
        cand["rows"] += row["jumlah_baris"]
        if row["keputusan"] in ("EXACT", "ALIAS", "NEW"):
            cand["status"] = "EXACT_MATCH" if row["keputusan"] == "EXACT" else "ALIAS_MATCH"
            cand["target"] = row["bahan"]
        elif row["keputusan"] == "EXCLUDE":
            if cand["status"] not in ("EXACT_MATCH", "ALIAS_MATCH"):
                cand["status"] = "IGNORE"
        elif cand["status"] not in ("EXACT_MATCH", "ALIAS_MATCH"):
            cand["status"] = "REVIEW"

    new_values = []
    for name, spec in NEW_ITEMS.items():
        new_values.append(
            "(" + ", ".join([
                sql_lit(name),
                sql_lit(spec["unit"]),
                sql_lit(spec["display_unit"]),
                sql_lit(json.dumps(spec["aliases"], ensure_ascii=False)),
                sql_lit(spec["note"]),
            ]) + ")"
        )

    alias_values = []
    for target, aliases in sorted(alias_targets.items(), key=lambda kv: kv[0].casefold()):
        arr = "ARRAY[" + ", ".join(sql_lit(a) for a in sorted(aliases, key=str.casefold)) + "]::text[]"
        alias_values.append(f"({sql_lit(target)}, {arr})")

    cand_values = []
    for key, cand in sorted(candidates.items()):
        cand_values.append("(" + ", ".join([
            sql_lit(candidate_id(key)),
            sql_lit(cand["display"]),
            sql_lit(cand["status"]),
            sql_lit(cand["target"]),
            sql_lit(json.dumps(sorted(cand["variants"]), ensure_ascii=False)),
            str(cand["rows"]),
        ]) + ")")

    sql = f"""-- Inventaris bahan baku dari struk Oktober 2026.
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
  detail jsonb NOT NULL DEFAULT '{{}}'::jsonb,
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
    {','.join(chr(10) + '    ' + v for v in new_values)}
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
    {','.join(chr(10) + '    ' + v for v in alias_values)}
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
    {','.join(chr(10) + '    ' + v for v in alias_values)}
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
    {','.join(chr(10) + '    ' + v for v in cand_values)}
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
"""
    out = Path(__file__).resolve().parents[2] / "packages/backend/supabase/migrations/20261113120000_inventory_catalog_october_2026.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"tulis {out}")


def main() -> None:
    rows = build_rows()
    live = json.loads(Path("/tmp/inv.json").read_text(encoding="utf-8")) if Path("/tmp/inv.json").exists() else []
    validate(rows, [r["ingredient_name"] for r in live])
    emit_csv(rows)
    emit_sql(rows)
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["keputusan"]] = counts.get(row["keputusan"], 0) + 1
    print("keputusan:", dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
