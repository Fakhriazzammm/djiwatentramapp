#!/usr/bin/env python3
"""Bangun migrasi SQL: grup bahan + baris per merek.

Input : /tmp/live_inv2.json (kondisi produksi), audit_merek.py (GROUP_MAP)
Output: packages/backend/supabase/migrations/20261113170000_inventory_brand_groups.sql
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "packages/backend/supabase/migrations/20261113170000_inventory_brand_groups.sql"
LIVE = Path("/tmp/live_inv2.json")

import importlib.util

spec = importlib.util.spec_from_file_location("audit", HERE / "audit_merek.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
GROUP_MAP = dict(audit.GROUP_MAP)
GROUP_MAP.update({
    "Beans Robusta": "Biji Kopi Robusta",
    "Pasta Perisa Vanilla": "Pasta Vanilla",
    "Telor Omega (Happy Egg)": "Telur Omega",
    "Telur Ayam": "Telur Ayam",
})

# Baris lama yang memang sudah berupa satu merek.
EXISTING_BRAND = {
    "Minyak Bimoli": "Bimoli",
    "Minyak Sunco": "Sunco",
    "Minyak Tropical 1L": "Tropical",
    "Minyak Rizki": "Rizki",
    "Margarine (Filma)": "Filma",
    "Cream": "Gold Label",
    "Bawang Putih Bubuk (YOA)": "YOA",
    "Freshmilk Diamond": "Diamond",
    "Freshmilk Greenfield": "Greenfield",
    "Freshmilk Cimory 950ml": "Cimory",
    "SKM Carnation": "Carnation",
    "Kecap Manis": "Bango",
    "Kecap Asin ABC": "ABC",
    "Kecap Ikan": "Seng Guan Heng",
    "Merica": "Ladaku",
    "Lada Bubuk": "Ladaku",
    "Butter": "Orchid",
    "Air Galon": "Cleo",
    "Air Mineral": "Le Minerale",
    "Pasta Perisa Vanilla": "Koepoe",
    "Multi Tisu": "YOA",
    "Thyme": "YOA",
    "Basil": "YOA",
    "Oregano": "YOA",
    "Rosemary": "YOA",
    "Ngohion": "YOA",
    "Bernardi Horeca Sosis": "Bernardi",
    "Sosis (Salam)": "Salam",
    "Saus Tiram Panda": "Panda",
    "Saus Tiram (Mahsuri)": "Mahsuri",
    "Oyster Sauce (Lee Kum Kee)": "Lee Kum Kee",
    "Delmonte Saus Cabe": "Del Monte",
    "Saus Tomat (Del Monte)": "Del Monte",
    "Saus Sambel (Del Monte)": "Del Monte",
    "Barbeque Sauce": "Del Monte",
    "Saus Mustard (Maestro)": "Maestro",
    "Mayones Maestro 1L": "Maestro",
    "Pencuci Piring Ekonomi": "Ekonomi",
    "Ekonomi Pencuci Piring": "Ekonomi",
    "Lifebuoy Pencuci Piring": "Lifebuoy",
    "Soklin Lantai": "Soklin",
    "Kecap Anggur": "Cap Anggur",
    "Sirup Peach": "Tofico",
    "Sirup Lemon": "Sunquick",
    "Lemon Tea Max Tea": "Max Tea",
    "Peach Tea Max Tea": "Max Tea",
    "Matcha Powder": "Dripp",
    "Coklat Powder": "Dripp",
    "Kentang Shoestring": "Idaho",
    "French Fries Shoestring 2,5 Kg": "Idaho",
    "Mix Vegetable": "Golden Farm",
    "Roti Tawar Gandum": "YB",
    "Kulit Pangsit (Cap Jempol)": "Cap Jempol",
    "Tongcai": "CLJ",
    "Palm Sugar": "Lahangtua",
    "Baterai ABC": "ABC",
    "Bumbu Kunci Mas": "Kunci Mas",
    "Kecap Inggis": "SNW",
    "Kecap Asin ABC": "ABC",
    "Minyak Wijen": "",
}

NEW_ROWS = [
    {
        "name": "Minyak Goreng Rose Brand 2L",
        "group": "Minyak Goreng",
        "brand": "Rose Brand",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "liter",
        "pack_qty": 2,
        "pack_unit": "liter",
        "price": 41950,
        "aliases": ["ROSE BRAND", "ROSE BRAND 2J", "Rose Brand Cooking Oil",
                    "Rose Brand Cooking Oil Pouch 2L", "ROSE BRAND POUCH 2J",
                    "ROSE BRAND POUCH 2L", "PWP ROSEBRN 39950"],
        "note": "Minyak goreng kemasan pouch 2 liter, merek Rose Brand.",
    },
    {
        "name": "Minyak Goreng Sania 2L",
        "group": "Minyak Goreng",
        "brand": "Sania",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "liter",
        "pack_qty": 2,
        "pack_unit": "liter",
        "price": 43450,
        "aliases": ["SANIA POUCH 2 LT", "Sania Cooking Oil Pouch", "PWP SANIA"],
        "note": "Minyak goreng kemasan pouch 2 liter, merek Sania.",
    },
    {
        "name": "Minyak Goreng VIPCO 2L",
        "group": "Minyak Goreng",
        "brand": "VIPCO",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "liter",
        "pack_qty": 2,
        "pack_unit": "liter",
        "price": 41950,
        "aliases": ["VIPCO", "VIPCO POUCH 2L"],
        "note": "Minyak goreng kemasan pouch 2 liter, merek VIPCO.",
    },
    {
        "name": "Minyak Goreng Kunci Mas 2L",
        "group": "Minyak Goreng",
        "brand": "Kunci Mas",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "liter",
        "pack_qty": 2,
        "pack_unit": "liter",
        "price": 44500,
        "aliases": ["KUNCI MAS POUCH 2L", "Kunci Mas Cooking Oil Pouch",
                    "Kunci Mas Cooking Oil Pouch 2L"],
        "note": "Minyak goreng kemasan pouch 2 liter, merek Kunci Mas.",
    },
    {
        "name": "Minyak Goreng Minyak Kita 2L",
        "group": "Minyak Goreng",
        "brand": "Minyak Kita",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "liter",
        "pack_qty": 2,
        "pack_unit": "liter",
        "price": 40000,
        "aliases": ["Minyak Kita"],
        "note": "Minyak goreng kemasan pouch 2 liter, merek Minyak Kita.",
    },
    {
        "name": "Margarin Simas 200g",
        "group": "Margarin",
        "brand": "Simas",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "pack",
        "pack_qty": 1,
        "pack_unit": "pack",
        "price": 12500,
        "aliases": ["Simas", "Simas Margarine", "Sinas", "Cimas", "Sinar"],
        "note": "Margarin Simas 200 gram. Sinas/Cimas/Sinar adalah varian OCR nama yang sama (harga sama 12.500).",
    },
    {
        "name": "Gula Pasir Raja Gula 1kg",
        "group": "Gula Pasir",
        "brand": "Raja Gula",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "gram",
        "pack_qty": 1000,
        "pack_unit": "gram",
        "price": 17900,
        "aliases": ["Raja Gula", "Raja Gula 1 KG Repack"],
        "note": "Gula pasir merek Raja Gula, kemasan 1 kg.",
    },
    {
        "name": "Gula Pasir Gula Vit 1kg",
        "group": "Gula Pasir",
        "brand": "Gula Vit",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "gram",
        "pack_qty": 1000,
        "pack_unit": "gram",
        "price": 18000,
        "aliases": ["Gula vit"],
        "note": "Gula pasir merek Gula Vit, kemasan 1 kg.",
    },
    {
        "name": "Gula Pasir GKP 1kg",
        "group": "Gula Pasir",
        "brand": "GKP",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "gram",
        "pack_qty": 1000,
        "pack_unit": "gram",
        "price": 18000,
        "aliases": ["Gula GKP Los", "PH GULA LOKAL 1KG"],
        "note": "Gula pasir GKP/lokal, kemasan 1 kg.",
    },
    {
        "name": "Bawang Putih Bubuk Desaku 100g",
        "group": "Bawang Putih Bubuk",
        "brand": "Desaku",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "gram",
        "pack_qty": 100,
        "pack_unit": "gram",
        "price": 7000,
        "aliases": ["Desaku Bubuk", "Desaku Seasoning", "DESAKUBWGPTI HBBK",
                    "DESAKUBWGPTI HBBK 100G", "DESAKUBWGPTIBBK100G",
                    "DESAKUBWGPTIHB8K100G", "DESAKUBWGPTIHBBK",
                    "DESAKUBWGPTIHBBK 100G", "DESAKUBWGPTIHBBK100G",
                    "DESAKUBWGPTIHBK100G", "DESAKUBWGTIHBBK100G"],
        "note": "Bawang putih bubuk Desaku 100 gram; berbeda merek dan ukuran dari YOA 40 gram.",
    },
    {
        "name": "Sirup Green Apple Tofico",
        "group": "Sirup Green Apple",
        "brand": "Tofico",
        "category": "bar",
        "unit": "pcs",
        "display_unit": "botol",
        "pack_qty": 1,
        "pack_unit": "botol",
        "price": 108000,
        "aliases": ["Green Apple Tofico", "Tofico Green Apel", "Tofico Green Apl",
                    "Tofico Green Aple", "Tofico green Apple"],
        "note": "Sirup green apple merek Tofico.",
    },
    {
        "name": "Sirup Green Apple Top 100",
        "group": "Sirup Green Apple",
        "brand": "Top 100",
        "category": "bar",
        "unit": "pcs",
        "display_unit": "botol",
        "pack_qty": 1,
        "pack_unit": "botol",
        "price": 108500,
        "aliases": ["Top100 green apel", "Topico green apple"],
        "note": "Sirup green apple merek Top 100.",
    },
    {
        "name": "Kecap Ikan Djoe Hoa 620ml",
        "group": "Kecap Ikan",
        "brand": "Djoe Hoa",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "ml",
        "pack_qty": 620,
        "pack_unit": "ml",
        "price": 38900,
        "aliases": ["Djoe Hoa Cap Ikan Merah", "Djoe Hoa Cap Ikan Merah 620 ML",
                    "Djoe Hoa kecap ikan"],
        "note": "Kecap ikan Djoe Hoa Cap Ikan Merah 620 ml.",
    },
    {
        "name": "Kecap Inggris SNW 600ml",
        "group": "Kecap Inggris",
        "brand": "SNW",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "botol",
        "pack_qty": 600,
        "pack_unit": "ml",
        "price": 81750,
        "aliases": ["SNW KECAP ING 600ML"],
        "note": "Kecap inggris merek SNW 600 ml.",
    },
    {
        "name": "Kecap Inggris Asia Harum",
        "group": "Kecap Inggris",
        "brand": "Asia Harum",
        "category": "kitchen",
        "unit": "pcs",
        "display_unit": "botol",
        "pack_qty": 1,
        "pack_unit": "botol",
        "price": 44500,
        "aliases": ["Harum Sedap", "Kecap inggris asia harum sedep",
                    "Kecap Inggris asra harum sedap"],
        "note": "Kecap inggris merek Asia Harum Sedap.",
    },
]

# Alias yang dipindahkan dari baris lama (generik) ke baris merek.
ALIAS_MOVES = {
    "Minyak Goreng": ["ROSE BRAND", "ROSE BRAND 2J", "Rose Brand Cooking Oil",
                      "Rose Brand Cooking Oil Pouch 2L", "ROSE BRAND POUCH 2J",
                      "ROSE BRAND POUCH 2L", "PWP ROSEBRN 39950",
                      "SANIA POUCH 2 LT", "Sania Cooking Oil Pouch", "PWP SANIA",
                      "VIPCO", "VIPCO POUCH 2L",
                      "KUNCI MAS POUCH 2L", "Kunci Mas Cooking Oil Pouch",
                      "Kunci Mas Cooking Oil Pouch 2L",
                      "Minyak Kita", "Minyak Goreng Rizki"],
    "Margarine (Filma)": ["Simas", "Simas Margarine", "Sinas", "Cimas", "Sinar"],
    "Gula Pasir Putih": ["Raja Gula", "Raja Gula 1 KG Repack", "Gula vit",
                         "Gula GKP Los", "PH GULA LOKAL 1KG"],
    "Bawang Putih Bubuk (YOA)": ["Desaku Bubuk", "Desaku Seasoning", "DESAKUBWGPTI HBBK",
                                 "DESAKUBWGPTI HBBK 100G", "DESAKUBWGPTIBBK100G",
                                 "DESAKUBWGPTIHB8K100G", "DESAKUBWGPTIHBBK",
                                 "DESAKUBWGPTIHBBK 100G", "DESAKUBWGPTIHBBK100G",
                                 "DESAKUBWGPTIHBK100G", "DESAKUBWGTIHBBK100G"],
    "Sirup Green Apple": ["Green Apple Tofico", "Tofico Green Apel", "Tofico Green Apl",
                          "Tofico Green Aple", "Tofico green Apple",
                          "Top100 green apel", "Topico green apple"],
    "Kecap Ikan": ["Djoe Hoa Cap Ikan Merah", "Djoe Hoa Cap Ikan Merah 620 ML",
                   "Djoe Hoa kecap ikan"],
    "Kecap Inggis": ["SNW KECAP ING 600ML", "Harum Sedap",
                     "Kecap inggris asia harum sedep", "Kecap Inggris asra harum sedap"],
}

# Baris lama yang menerima alias (bukan baris baru).
ALIAS_ADDS = {
    "Minyak Rizki": ["Minyak Goreng Rizki"],
    "Kecap Inggis": ["Kecap Inggris"],  # tetap di baris SNW sebagai alias generik
}


def q(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def arr(values: list[str]) -> str:
    return "ARRAY[" + ", ".join(q(v) for v in values) + "]::text[]"


def key(name: str) -> str:
    return hashlib.md5(name.encode()).hexdigest()[:32]


def main() -> None:
    inventory = json.loads(LIVE.read_text(encoding="utf-8"))
    names = {r["ingredientName"] for r in inventory}

    missing = [r["name"] for r in NEW_ROWS if r["name"] in names]
    if missing:
        raise SystemExit(f"nama baris baru bentrok dengan yang sudah ada: {missing}")

    groups = []
    for r in inventory:
        group = GROUP_MAP.get(r["ingredientName"], r["ingredientName"])
        groups.append((r["source_id"], group, EXISTING_BRAND.get(r["ingredientName"], "")))
    groups += [(f"inv_brand_{key(n['name'])}", n["group"], n["brand"]) for n in NEW_ROWS]

    lines: list[str] = []
    add = lines.append

    add("-- Grup bahan + baris per merek (minyak goreng, margarin, gula, bumbu, sirup, kecap).")
    add("-- Sumber: reports/inventaris-merek-2026 (audit_merek.py).")
    add("--")
    add("-- Aditif: tidak menghapus baris, tidak mengubah quantity/riwayat. Yang dilakukan:")
    add("--   1. menambah kolom ingredient_group dan mengisinya;")
    add("--   2. mengisi default_brand_name pada baris yang sudah berupa satu merek;")
    add("--   3. membuat 15 baris merek baru (quantity 0) untuk merek yang sebelumnya")
    add("--      tercampur di baris generik;")
    add("--   4. memindahkan alias merek dari baris generik ke baris merek yang benar;")
    add("--   5. mencatat audit dan menyediakan view perbandingan harga.")
    add("")
    add("BEGIN;")
    add("")
    add("SELECT set_config('yumi.allow_manual_material_create', 'on', true);")
    add("SELECT set_config('yumi.allow_inventory_catalog_write', 'on', true);")
    add("")

    add("-- 0. Jalur migrasi katalog pada guard mode stok manual -------------------")
    add("CREATE OR REPLACE FUNCTION pos.guard_manual_stock_inventory_write()")
    add("RETURNS trigger")
    add("LANGUAGE plpgsql")
    add("SECURITY DEFINER")
    add("SET search_path TO 'pos', 'public', 'pg_catalog'")
    add("AS $function$")
    add("BEGIN")
    add("  IF current_setting('yumi.allow_inventory_catalog_write', true) = 'on' THEN")
    add("    IF TG_OP = 'DELETE' THEN")
    add("      RETURN OLD;")
    add("    END IF;")
    add("    RETURN NEW;")
    add("  END IF;")
    add("  IF pos.current_inventory_stock_mode() = 'manual' THEN")
    add("    IF TG_OP = 'INSERT' AND current_setting('yumi.allow_manual_material_create', true) = 'on' THEN")
    add("      RETURN NEW;")
    add("    END IF;")
    add("    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: gunakan halaman Stok Manual untuk memperbarui bahan.';")
    add("  END IF;")
    add("  IF TG_OP = 'DELETE' THEN")
    add("    RETURN OLD;")
    add("  END IF;")
    add("  RETURN NEW;")
    add("END;")
    add("$function$;")
    add("")

    add("-- 1. Snapshot + kolom grup ------------------------------------------------")
    add("CREATE TABLE IF NOT EXISTS pos.inventory_brandgroup_snapshot AS")
    add("SELECT i.*, now() AS snapshot_at FROM pos.inventory i;")
    add("")
    add("ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS ingredient_group text;")
    add("CREATE INDEX IF NOT EXISTS inventory_ingredient_group_idx")
    add("  ON pos.inventory (ingredient_group);")
    add("")

    add("-- 2. Isi grup bahan -------------------------------------------------------")
    add("WITH g(source_id, grup, merek) AS (")
    add("  VALUES")
    add(",\n".join(f"    ({q(sid)}, {q(grup)}, NULLIF({q(merek)}, ''))" for sid, grup, merek in groups))
    add(")")
    add("UPDATE pos.inventory i")
    add("SET ingredient_group = g.grup,")
    add("    default_brand_name = COALESCE(i.default_brand_name, g.merek)")
    add("FROM g")
    add("WHERE i.source_id = g.source_id")
    add("  AND (i.ingredient_group IS DISTINCT FROM g.grup")
    add("       OR (i.default_brand_name IS NULL AND g.merek IS NOT NULL));")
    add("")

    add("-- 3. Baris merek baru -----------------------------------------------------")
    add("WITH baru(source_id, ingredient_name, unit, display_unit, pack_qty, pack_unit,")
    add("          aliases, category, ingredient_group, brand, price, note) AS (")
    add("  VALUES")
    values = []
    for n in NEW_ROWS:
        aliases = [n["name"], *n["aliases"]]
        values.append(
            "    ("
            + ", ".join([
                q(f"inv_brand_{key(n['name'])}"),
                q(n["name"]),
                q(n["unit"]),
                q(n["display_unit"]),
                str(n["pack_qty"]),
                q(n["pack_unit"]),
                q(json.dumps(aliases, ensure_ascii=False)) + "::jsonb",
                q(n["category"]),
                q(n["group"]),
                q(n["brand"]),
                str(n["price"]),
                q(n["note"]),
            ])
            + ")"
        )
    add(",\n".join(values))
    add(")")
    add("INSERT INTO pos.inventory (")
    add("  source_id, ingredient_name, unit, quantity, low_stock_threshold, display_unit,")
    add("  pack_net_quantity, pack_net_unit, aliases, category, ingredient_group,")
    add("  default_brand_name, last_purchase_price, unit_status, creation_time, raw")
    add(")")
    add("SELECT")
    add("  b.source_id, b.ingredient_name, b.unit, 0, 0, b.display_unit,")
    add("  b.pack_qty, b.pack_unit, b.aliases, b.category, b.ingredient_group,")
    add("  b.brand, b.price, 'AMBIGUOUS', extract(epoch FROM now()) * 1000,")
    add("  jsonb_build_object('source', 'receipt-images-2026-07..11',")
    add("                     'report', 'reports/inventaris-merek-2026',")
    add("                     'note', b.note)")
    add("FROM baru b")
    add("WHERE NOT EXISTS (")
    add("  SELECT 1 FROM pos.inventory i")
    add("  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name))")
    add(")")
    add("ON CONFLICT (source_id) DO NOTHING;")
    add("")

    add("-- 4. Pindahkan alias merek dari baris generik -----------------------------")
    add("CREATE OR REPLACE FUNCTION pg_temp.drop_alias(p_existing jsonb, p_drop text[])")
    add("RETURNS jsonb")
    add("LANGUAGE sql")
    add("IMMUTABLE")
    add("AS $$")
    add("  SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)")
    add("  FROM (")
    add("    SELECT a, ord")
    add("    FROM (")
    add("      SELECT value AS a, row_number() OVER () AS ord")
    add("      FROM jsonb_array_elements_text(coalesce(p_existing, '[]'::jsonb))")
    add("    ) s")
    add("    WHERE lower(btrim(a)) <> ALL (")
    add("      SELECT lower(btrim(x)) FROM unnest(p_drop) AS x")
    add("    )")
    add("  ) q;")
    add("$$;")
    add("")
    add("CREATE OR REPLACE FUNCTION pg_temp.merge_alias(p_existing jsonb, p_add text[])")
    add("RETURNS jsonb")
    add("LANGUAGE sql")
    add("IMMUTABLE")
    add("AS $$")
    add("  SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)")
    add("  FROM (")
    add("    SELECT DISTINCT ON (lower(btrim(a))) a, ord")
    add("    FROM (")
    add("      SELECT value AS a, row_number() OVER () AS ord")
    add("      FROM jsonb_array_elements_text(coalesce(p_existing, '[]'::jsonb))")
    add("      UNION ALL")
    add("      SELECT x AS a, 100000 + row_number() OVER () AS ord")
    add("      FROM unnest(p_add) AS x")
    add("    ) merged")
    add("    WHERE btrim(a) <> ''")
    add("    ORDER BY lower(btrim(a)), ord")
    add("  ) dedup;")
    add("$$;")
    add("")
    add("WITH buang(ingredient_name, aliases) AS (")
    add("  VALUES")
    add(",\n".join(f"    ({q(nama)}, {arr(aliases)})" for nama, aliases in ALIAS_MOVES.items()))
    add(")")
    add("UPDATE pos.inventory i")
    add("SET aliases = pg_temp.drop_alias(i.aliases, b.aliases)")
    add("FROM buang b")
    add("WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name));")
    add("")
    add("WITH tambah(ingredient_name, aliases) AS (")
    add("  VALUES")
    add(",\n".join(f"    ({q(nama)}, {arr(aliases)})" for nama, aliases in ALIAS_ADDS.items()))
    add(")")
    add("UPDATE pos.inventory i")
    add("SET aliases = pg_temp.merge_alias(i.aliases, t.aliases)")
    add("FROM tambah t")
    add("WHERE lower(btrim(i.ingredient_name)) = lower(btrim(t.ingredient_name));")
    add("")

    add("-- 5. Audit ---------------------------------------------------------------")
    add("ALTER TABLE pos.inventory_catalog_update_log")
    add("  DROP CONSTRAINT IF EXISTS inventory_catalog_update_log_action_check;")
    add("ALTER TABLE pos.inventory_catalog_update_log")
    add("  ADD CONSTRAINT inventory_catalog_update_log_action_check")
    add("  CHECK (action IN ('alias_added', 'material_created', 'alias_unchanged',")
    add("                  'brand_row_created', 'brand_group_set', 'alias_moved'));")
    add("")
    add("INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)")
    add("SELECT i.source_id, i.ingredient_name, 'brand_row_created',")
    add("       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name,")
    add("                          'unit', i.unit, 'pack', i.pack_net_quantity, 'packUnit', i.pack_net_unit)")
    add("FROM pos.inventory i")
    add("WHERE i.source_id IN (")
    add("    " + ",\n    ".join(q(f"inv_brand_{key(n['name'])}") for n in NEW_ROWS))
    add("  )")
    add("  AND NOT EXISTS (")
    add("    SELECT 1 FROM pos.inventory_catalog_update_log l")
    add("    WHERE l.inventory_source_id = i.source_id AND l.action = 'brand_row_created'")
    add("  );")
    add("")
    add("INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)")
    add("SELECT i.source_id, i.ingredient_name, 'brand_group_set',")
    add("       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name)")
    add("FROM pos.inventory i")
    add("WHERE i.ingredient_group IS NOT NULL")
    add("  AND NOT EXISTS (")
    add("    SELECT 1 FROM pos.inventory_catalog_update_log l")
    add("    WHERE l.inventory_source_id = i.source_id AND l.action = 'brand_group_set'")
    add("  );")
    add("")
    add("INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)")
    add("SELECT i.source_id, i.ingredient_name, 'alias_moved',")
    add("       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name,")
    add("                          'aliases', i.aliases)")
    add("FROM pos.inventory i")
    add("WHERE i.source_id IN (")
    add("    " + ",\n    ".join(q(f"inv_brand_{key(n['name'])}") for n in NEW_ROWS))
    add("  )")
    add("  AND NOT EXISTS (")
    add("    SELECT 1 FROM pos.inventory_catalog_update_log l")
    add("    WHERE l.inventory_source_id = i.source_id AND l.action = 'alias_moved'")
    add("  );")
    add("")

    add("-- 6. Titik kandidat review ikut diarahkan ke baris merek ------------------")
    add("WITH peta(kunci, source_id, nama) AS (")
    add("  VALUES")
    rows = []
    for n in NEW_ROWS:
        for alias in n["aliases"]:
            k = audit.norm_tokens(alias)
            rows.append(
                f"    ({q(' '.join(k))}, {q('inv_brand_' + key(n['name']))}, {q(n['name'])})"
            )
    add(",\n".join(rows))
    add(")")
    add("UPDATE pos.inventory_item_candidates c")
    add("SET proposed_inventory_source_id = p.source_id,")
    add("    proposed_canonical_name = p.nama,")
    add("    match_status = 'ALIAS_MATCH'")
    add("FROM peta p")
    add("WHERE c.normalized_name_key = p.kunci")
    add("  AND c.reviewed_by IS NULL;")
    add("")

    add("-- 7. View perbandingan harga per grup ------------------------------------")
    add("CREATE OR REPLACE VIEW pos.inventory_group_options AS")
    add("SELECT")
    add("  i.ingredient_group AS group_name,")
    add("  i.source_id,")
    add("  i.ingredient_name,")
    add("  i.default_brand_name AS brand,")
    add("  i.unit,")
    add("  i.display_unit,")
    add("  i.pack_net_quantity,")
    add("  i.pack_net_unit,")
    add("  i.quantity,")
    add("  i.last_purchase_price,")
    add("  i.last_purchase_at,")
    add("  row_number() OVER (")
    add("    PARTITION BY i.ingredient_group")
    add("    ORDER BY i.last_purchase_price NULLS LAST, i.ingredient_name")
    add("  ) AS price_rank")
    add("FROM pos.inventory i")
    add("WHERE i.ingredient_group IS NOT NULL;")
    add("")
    add("COMMENT ON VIEW pos.inventory_group_options IS")
    add("  'Pilihan merek per grup bahan, diurutkan dari harga terakhir termurah.';")
    add("")
    add("COMMIT;")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"tulis {OUT.relative_to(ROOT)}")
    print(f"baris grup: {len(groups)}; baris merek baru: {len(NEW_ROWS)}; "
          f"alias dipindah: {sum(len(v) for v in ALIAS_MOVES.values())}")


if __name__ == "__main__":
    main()
