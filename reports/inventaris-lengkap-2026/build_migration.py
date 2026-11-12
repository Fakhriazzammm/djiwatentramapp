#!/usr/bin/env python3
"""Hasilkan migrasi SQL aditif dari hasil analyze.py.

Input:
  reports/inventaris-lengkap-2026/semua-nama-bahan.csv
  reports/inventaris-lengkap-2026/aksi-bahan.csv

Output:
  packages/backend/supabase/migrations/20261113150000_inventory_catalog_all_receipts.sql
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "packages/backend/supabase/migrations/20261113150000_inventory_catalog_all_receipts.sql"

NEW_MATERIALS: dict[str, dict] = {
    "Freshmilk Cimory 950ml": {
        "unit": "pcs",
        "display_unit": "liter",
        "note": "Susu segar Cimory Full Cream 950ml; merek berbeda dari Diamond/Greenfield.",
    },
    "Kikil Sapi": {"unit": "kg", "display_unit": "kg", "note": "Kikil/kulit sapi putih, dibeli per kg."},
    "Tempe": {"unit": "pcs", "display_unit": "pcs", "note": "Tempe papan, dibeli per pcs."},
    "Caisim": {"unit": "kg", "display_unit": "kg", "note": "Sayur caisim/sawi hijau, dibeli per kg."},
    "Cabe Besar": {"unit": "kg", "display_unit": "kg", "note": "Cabe merah besar, berbeda dari cabe keriting/rawit."},
    "Cumi": {"unit": "kg", "display_unit": "kg", "note": "Cumi segar, dibeli per kg."},
}


def q(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def arr(values: list[str]) -> str:
    return "ARRAY[" + ", ".join(q(v) for v in values) + "]::text[]"


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    semua = load(HERE / "semua-nama-bahan.csv")
    aksi = load(HERE / "aksi-bahan.csv")

    aliases_by_target: dict[str, list[str]] = defaultdict(list)
    for row in aksi:
        if row["keputusan"] == "ALIAS":
            aliases_by_target[row["bahan"]].append(row["nama"])

    new_targets = sorted({r["bahan"] for r in aksi if r["keputusan"] == "NEW"})
    missing = [t for t in new_targets if t not in NEW_MATERIALS]
    if missing:
        raise SystemExit(f"bahan baru tanpa metadata: {missing}")

    # Jangan pernah menulis alias untuk bahan yang tidak ada.
    existing = {r["bahan"] for r in aksi}
    unknown_targets = [t for t in aliases_by_target if t not in new_targets and t not in existing]
    if unknown_targets:
        raise SystemExit(f"target alias tidak dikenal: {unknown_targets}")

    lines: list[str] = []
    add = lines.append

    add("-- Katalog bahan baku lengkap dari SELURUH foto struk (Juli-November 2026).")
    add("-- Sumber: reports/inventaris-lengkap-2026 (analyze.py -> semua-nama-bahan.csv,")
    add("-- aksi-bahan.csv). Bukti OCR: pos.financial_transactions.metadata.scanItems,")
    add("-- pos.expense_receipt_items, pos.expense_receipt_ai_runs.result.items.")
    add("--")
    add("-- Aditif dan idempoten: tidak menghapus bahan, tidak mengganti nama bahan lama,")
    add("-- tidak menyentuh riwayat stok/resep/pesanan. Hanya menambah bahan baru,")
    add("-- memperkaya alias, mencatat audit, dan menyegarkan antrean review kandidat.")
    add("")
    add("BEGIN;")
    add("")
    add("SELECT set_config('yumi.allow_manual_material_create', 'on', true);")
    add("SELECT set_config('yumi.allow_inventory_catalog_write', 'on', true);")
    add("")

    # 0. Guard (sama seperti migrasi katalog Oktober, idempoten).
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

    # 1. Snapshot sekali saja.
    add("-- 1. Snapshot sebelum perubahan (sekali saja) ----------------------------")
    add("CREATE TABLE IF NOT EXISTS pos.inventory_allreceipts_snapshot AS")
    add("SELECT i.*, now() AS snapshot_at FROM pos.inventory i;")
    add("COMMENT ON TABLE pos.inventory_allreceipts_snapshot IS")
    add("  'Salinan pos.inventory sebelum pembaruan katalog seluruh struk 2026.';")
    add("")

    # 2. Bahan baru.
    add("-- 2. Bahan baku baru -----------------------------------------------------")
    add("WITH baru(ingredient_name, unit, display_unit, aliases, note) AS (")
    add("  VALUES")
    values = []
    for name in new_targets:
        meta = NEW_MATERIALS[name]
        alias_list = [name, *sorted(aliases_by_target.get(name, []), key=str.lower)]
        values.append(
            "    ("
            + ", ".join(
                [
                    q(name),
                    q(meta["unit"]),
                    q(meta["display_unit"]),
                    q(json.dumps(alias_list, ensure_ascii=False)) + "::jsonb",
                    q(meta["note"]),
                ]
            )
            + ")"
        )
    add(",\n".join(values))
    add(")")
    add("INSERT INTO pos.inventory (")
    add("  source_id, ingredient_name, unit, quantity, low_stock_threshold,")
    add("  display_unit, aliases, category, unit_status, creation_time, raw")
    add(")")
    add("SELECT")
    add("  'inv_nov26_' || substr(md5(lower(btrim(b.ingredient_name))), 1, 24),")
    add("  b.ingredient_name,")
    add("  b.unit,")
    add("  0,")
    add("  0,")
    add("  b.display_unit,")
    add("  b.aliases,")
    add("  'kitchen',")
    add("  'AMBIGUOUS',")
    add("  extract(epoch FROM now()) * 1000,")
    add("  jsonb_build_object(")
    add("    'source', 'receipt-images-2026-07..11',")
    add("    'report', 'reports/inventaris-lengkap-2026',")
    add("    'note', b.note")
    add("  )")
    add("FROM baru b")
    add("WHERE NOT EXISTS (")
    add("  SELECT 1 FROM pos.inventory i")
    add("  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name))")
    add(")")
    add("ON CONFLICT (source_id) DO NOTHING;")
    add("")
    add("INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)")
    add("SELECT i.source_id, i.ingredient_name, 'material_created',")
    add("       jsonb_build_object('unit', i.unit, 'displayUnit', i.display_unit)")
    add("FROM pos.inventory i")
    add("WHERE i.source_id LIKE 'inv_nov26_%'")
    add("  AND NOT EXISTS (")
    add("    SELECT 1 FROM pos.inventory_catalog_update_log l")
    add("    WHERE l.inventory_source_id = i.source_id AND l.action = 'material_created'")
    add("  );")
    add("")

    # 3. Alias.
    add("-- 3. Perkaya alias tanpa menghapus alias lama ---------------------------")
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

    alias_values = []
    for target in sorted(aliases_by_target):
        names = sorted(set(aliases_by_target[target]), key=str.lower)
        alias_values.append("    (" + q(target) + ", " + arr(names) + ")")
    add("WITH tambahan(ingredient_name, aliases) AS (")
    add("  VALUES")
    add(",\n".join(alias_values))
    add(")")
    add("UPDATE pos.inventory i")
    add("SET aliases = pg_temp.merge_alias(i.aliases, t.aliases)")
    add("FROM tambahan t")
    add("WHERE lower(btrim(i.ingredient_name)) = lower(btrim(t.ingredient_name))")
    add("  AND i.aliases IS DISTINCT FROM pg_temp.merge_alias(i.aliases, t.aliases);")
    add("")
    add("INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)")
    add("SELECT i.source_id, i.ingredient_name, 'alias_added',")
    add("       jsonb_build_object('aliases', i.aliases)")
    add("FROM pos.inventory i")
    add("WHERE i.ingredient_name IN (")
    add("    " + ",\n    ".join(q(t) for t in sorted(aliases_by_target)))
    add("  )")
    add("  AND NOT EXISTS (")
    add("    SELECT 1 FROM pos.inventory_catalog_update_log l")
    add("    WHERE l.inventory_source_id = i.source_id")
    add("      AND l.action = 'alias_added'")
    add("      AND l.detail->'aliases' = i.aliases")
    add("  );")
    add("")

    # 4. Antrean kandidat.
    status_map = {
        "EXACT": "EXACT_MATCH",
        "ALIAS": "ALIAS_MATCH",
        "SUDAH_ALIAS": "ALIAS_MATCH",
        "NEW": "ALIAS_MATCH",
        "EXCLUDE": "IGNORE",
        "REVIEW": "REVIEW",
    }
    reason_map = {
        "EXACT_MATCH": "Nama struk sama dengan nama inventaris.",
        "ALIAS_MATCH": "Nama struk dipetakan sebagai alias bahan inventaris.",
        "IGNORE": "Kemasan/operasional, bukan bahan baku.",
        "REVIEW": "Nama belum pasti; perlu verifikasi foto/satuan sebelum digabung.",
    }
    candidates = [r for r in semua if int(r["jumlah"]) >= 2 or r["keputusan"] == "REVIEW"]
    add("-- 4. Antrean review kandidat (tidak menimpa keputusan manusia) -----------")
    add("WITH kandidat(source_id, normalized_name, match_status, target_name, raw_variants, mention_count) AS (")
    add("  VALUES")
    rows = []
    for r in candidates:
        key = r["kunci"]
        status = status_map[r["keputusan"]]
        target = r["bahan"] or None
        variants = json.dumps([r["nama"]], ensure_ascii=False)
        rows.append(
            "    ("
            + ", ".join(
                [
                    q("receipt_candidate_" + __import__("hashlib").md5(key.encode()).hexdigest()[:32]),
                    q(key),
                    q(status),
                    q(target) if target else "NULL",
                    q(variants) + "::jsonb",
                    str(int(r["jumlah"])),
                ]
            )
            + ")"
        )
    add(",\n".join(rows))
    add(")")
    add("INSERT INTO pos.inventory_item_candidates (")
    add("  source_id, normalized_name, match_status, proposed_inventory_source_id,")
    add("  proposed_canonical_name, confidence, raw_variants, mention_count,")
    add("  review_reason, raw")
    add(")")
    add("SELECT")
    add("  k.source_id,")
    add("  k.normalized_name,")
    add("  k.match_status,")
    add("  i.source_id,")
    add("  i.ingredient_name,")
    add("  CASE k.match_status WHEN 'EXACT_MATCH' THEN 'HIGH' WHEN 'ALIAS_MATCH' THEN 'MEDIUM' ELSE 'LOW' END,")
    add("  k.raw_variants,")
    add("  k.mention_count,")
    add("  CASE k.match_status")
    add("    WHEN 'EXACT_MATCH' THEN 'Nama struk sama dengan nama inventaris.'")
    add("    WHEN 'ALIAS_MATCH' THEN 'Nama struk dipetakan sebagai alias bahan inventaris.'")
    add("    WHEN 'IGNORE' THEN 'Kemasan/operasional, bukan bahan baku.'")
    add("    ELSE 'Nama belum pasti; perlu verifikasi foto/satuan sebelum digabung.'")
    add("  END,")
    add("  jsonb_build_object('source', 'receipt-images-2026-07..11', 'variants', k.raw_variants)")
    add("FROM kandidat k")
    add("LEFT JOIN pos.inventory i")
    add("  ON k.target_name IS NOT NULL")
    add(" AND lower(btrim(i.ingredient_name)) = lower(btrim(k.target_name))")
    add("ON CONFLICT (normalized_name_key) DO UPDATE")
    add("SET match_status = EXCLUDED.match_status,")
    add("    proposed_inventory_source_id = EXCLUDED.proposed_inventory_source_id,")
    add("    proposed_canonical_name = EXCLUDED.proposed_canonical_name,")
    add("    confidence = EXCLUDED.confidence,")
    add("    raw_variants = EXCLUDED.raw_variants,")
    add("    mention_count = GREATEST(pos.inventory_item_candidates.mention_count, EXCLUDED.mention_count),")
    add("    review_reason = EXCLUDED.review_reason,")
    add("    raw = pos.inventory_item_candidates.raw || EXCLUDED.raw,")
    add("    updated_at = now()")
    add("WHERE pos.inventory_item_candidates.reviewed_by IS NULL")
    add("  AND pos.inventory_item_candidates.match_status IN ('REVIEW', 'EXACT_MATCH', 'ALIAS_MATCH', 'NEW_CANDIDATE');")
    add("")
    add("COMMIT;")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"tulis {OUT.relative_to(ROOT)}")
    print(f"bahan baru: {len(new_targets)}; target alias: {len(aliases_by_target)}; "
          f"alias: {sum(len(v) for v in aliases_by_target.values())}; kandidat: {len(candidates)}")


if __name__ == "__main__":
    main()
