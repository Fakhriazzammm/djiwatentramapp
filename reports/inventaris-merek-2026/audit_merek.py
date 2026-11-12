#!/usr/bin/env python3
"""Audit merek: dari nama struk + inventaris, hasilkan rencana grup & baris merek.

Belum menulis ke database. Keluaran:
  grup-bahan.csv        -- 172 baris inventaris + grup bahan yang diusulkan
  calon-baris-merek.csv -- baris merek yang perlu dibuat (grup, merek, ukuran)
  pindah-alias.csv      -- alias yang harus pindah dari baris generik ke baris merek
  nama-tanpa-merek.csv  -- nama struk tanpa merek (calon baris generik / review)
"""
from __future__ import annotations

import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LIVE = Path("/tmp/live_inv2.json")
SEMUA = ROOT / "reports/inventaris-lengkap-2026/semua-nama-bahan.csv"
EVIDENCE = [Path("/tmp/ev_items_ctx.json"), Path("/tmp/ev_ai_ctx.json")]

# ---------------------------------------------------------------- grup bahan
# Baris inventaris -> grup bahan (nama bahan dasar, tanpa merek/ukuran).
GROUP_MAP = {
    # minyak goreng
    "Minyak Goreng": "Minyak Goreng",
    "Minyak Bimoli": "Minyak Goreng",
    "Minyak Sunco": "Minyak Goreng",
    "Minyak Tropical 1L": "Minyak Goreng",
    "Minyak Rizki": "Minyak Goreng",
    "Minyak Wijen": "Minyak Wijen",
    "Minyak Bawang Putih": "Minyak Bawang Putih",
    # margarin / krim / butter
    "Margarine (Filma)": "Margarin",
    "Butter": "Butter",
    "Cream": "Krim Masak",
    # gula
    "Gula Pasir Putih": "Gula Pasir",
    "Gula Aren": "Gula Aren",
    "Palm Sugar": "Palm Sugar",
    # bumbu bubuk
    "Bawang Putih Bubuk (YOA)": "Bawang Putih Bubuk",
    "Bawang Goreng": "Bawang Goreng",
    "Lada Bubuk": "Lada Putih Bubuk",
    "Lada Hitam Bubuk": "Lada Hitam Bubuk",
    "Merica": "Merica",
    "Vanili Bubuk (Koepoe)": "Vanili Bubuk",
    "Garlic Powder (Koepoe)": "Garlic Powder",
    "Kayu Manis": "Kayu Manis",
    "Kamper Pedas (YOA)": "Kamper",
    "Oregano": "Oregano",
    "Thyme": "Thyme",
    "Basil": "Basil",
    "Basil Leaves": "Basil",
    "Rosemary": "Rosemary",
    "Ngohion": "Ngohion",
    "Paprika Powder": "Paprika Powder",
    "Kaldu Jamur": "Kaldu Jamur",
    "Micin": "Micin",
    "Garam": "Garam",
    "Panir Mix": "Panir",
    "Tepung Terigu": "Tepung Terigu",
    "Tepung Jagung": "Tepung Jagung",
    # saus & kecap
    "Kecap Manis": "Kecap Manis",
    "Kecap Asin ABC": "Kecap Asin",
    "Dark Soy Sauce": "Kecap Asin",
    "Kecap Inggis": "Kecap Inggris",
    "Saus Inggris 620ML": "Kecap Inggris",
    "Kecap Ikan": "Kecap Ikan",
    "Kecap Anggur": "Kecap Anggur",
    "Saus Tiram (Mahsuri)": "Saus Tiram",
    "Saus Tiram Panda": "Saus Tiram",
    "Oyster Sauce (Lee Kum Kee)": "Saus Tiram",
    "Saus Tomat (Del Monte)": "Saus Tomat",
    "Saus Sambel (Del Monte)": "Saus Sambel",
    "Delmonte Saus Cabe": "Saus Cabe",
    "Barbeque Sauce": "Saus Barbeque",
    "Hoisin Sauce": "Hoisin Sauce",
    "Saus Mustard (Maestro)": "Saus Mustard",
    "Mayonaise": "Mayonaise",
    "Mayones Maestro 1L": "Mayonaise",
    # susu
    "Freshmilk Diamond": "Susu UHT",
    "Freshmilk Greenfield": "Susu UHT",
    "Freshmilk Cimory 950ml": "Susu UHT",
    "Susu Kental Manis": "Susu Kental Manis",
    "SKM Carnation": "Susu Kental Manis",
    "Susu Coconut": "Susu Kelapa",
    "Frisianflag Coconut Delight": "Susu Kelapa",
    # sirup / minuman
    "Apple Juice": "Jus Apel",
    "Sirup Green Apple": "Sirup Green Apple",
    "Sirup Peach": "Sirup Peach",
    "Sirup Elder": "Sirup Elder",
    "Sunquick Lemon": "Sirup Lemon",
    "Lemon Tea Max Tea": "Teh Lemon",
    "Peach Tea Max Tea": "Teh Peach",
    "C1000 Apple": "Minuman C1000",
    "Pulpy Orange": "Minuman Pulpy",
    "Sprite": "Minuman Sprite",
    "Big Cola": "Minuman Big Cola",
    "Schweppes Soda": "Soda Water",
    "Soda Water Schweppes": "Soda Water",
    "Cleo": "Air Mineral",
    "Le Mineral": "Air Mineral",
    "Air Mineral": "Air Mineral",
    "Air Galon": "Air Galon",
    "Air": "Air",
    # kopi
    "Arabica Beans": "Biji Kopi Arabika",
    "Robusta Beans": "Biji Kopi Robusta",
    "Beans Arabika Flores Bajawa FW": "Biji Kopi Arabika",
    "Matcha Powder": "Matcha Powder",
    "Coklat Powder": "Coklat Powder",
    "Single Origin Mango": "Single Origin",
    "Single Origin Strawberry": "Single Origin",
    # protein
    "Bernardi Horeca Sosis": "Sosis Sapi",
    "Sosis (Salam)": "Sosis Sapi",
    "Bakso": "Bakso",
    "Baso Sapi": "Bakso",
    "Patty Hamburg": "Patty",
    "Paha Filet": "Ayam Filet",
    "Daging Ayam": "Ayam",
    "Kulit Ayam": "Ayam",
    "Ayam Giling": "Ayam Giling",
    "Ayam Cincang": "Ayam Cincang",
    "Sapi Cincang": "Sapi Cincang",
    "Sapi Cincang 200gr": "Sapi Cincang",
    "Tulang": "Tulang Sapi",
    "Kikil Sapi": "Kikil Sapi",
    "Ebi (500gr)": "Ebi",
    "Cumi": "Cumi",
    # sayur / buah
    "Selada (Ibu Teti Pasar)": "Selada",
    "Timun": "Timun",
    "Tomat": "Tomat",
    "Caisim": "Caisim",
    "Bayam": "Bayam",
    "Sereh": "Sereh",
    "Daun Surawung": "Daun Surawung",
    "Kemangi Segar": "Kemangi",
    "Kemangi Instant": "Kemangi",
    "Jeruk Limau": "Jeruk Limau",
    "Pisang": "Pisang",
    "Ubi Cilembu": "Ubi",
    "Kentang": "Kentang",
    "Kentang Shoestring": "Kentang Beku",
    "French Fries Shoestring 2,5 Kg": "Kentang Beku",
    "Mix Vegetable": "Mix Vegetable",
    "Bawang Merah": "Bawang Merah",
    "Bawang Putih": "Bawang Putih",
    "Bawang Bombai": "Bawang Bombai",
    "Bawang Daun": "Bawang Daun",
    "Cabe Rawit": "Cabe Rawit",
    "Cabe Keriting Merah": "Cabe Keriting",
    "Cabe Besar": "Cabe Besar",
    "Cabe Domba": "Cabe Domba",
    "Cabe Kering": "Cabe Kering",
    "Kemiri": "Kemiri",
    "Tongcai": "Tongcai",
    "Biji Wijen": "Biji Wijen",
    "Angkak": "Angkak",
    "Tempe": "Tempe",
    # lain-lain
    "Beras": "Beras",
    "Roti Tawar Gandum": "Roti Tawar",
    "Roti (Bread Co)": "Roti",
    "Kulit Pangsit (Cap Jempol)": "Kulit Pangsit",
    "Kerupuk": "Kerupuk",
    "Cireng": "Cireng",
    "Bumbu Kunci Mas": "Bumbu Instan",
    "Yamin Base": "Bumbu Instan",
    "Bikin Yamin": "Bumbu Instan",
    "Nasi Goreng Sauce": "Saus Nasi Goreng",
    "Nasi Ayam Chasiu Sauce": "Saus Nasi Ayam",
    "Nasi Ayam Mentega Sauce": "Saus Nasi Ayam",
    "Nasi Ayam Rempah Kemangi Sauce": "Saus Nasi Ayam",
    "Nasi Telor Omega Pontianak Sauce": "Saus Nasi Ayam",
    "Es Batu": "Es Batu",
    "Baterai ABC": "Baterai",
    "Gas 3 Kg": "Gas",
    "Ongkir": "Ongkir",
    "Sampah": "Sampah",
    "Roko Mang Andre": "Rokok",
    "Mangandri": "Rokok",
    "Bento Tupai 4 Sekat": "Kemasan",
    "Botol 1 Liter": "Kemasan",
    "Cup 12 PET": "Kemasan",
    "Kresek Piala 1 Cup": "Kemasan",
    "Kresek Piala Uk 28 Putih": "Kemasan",
    "Paperbowl 650ml": "Kemasan",
    "Pelastik Piala": "Kemasan",
    "Sedotan Steril Tekuk Hitam": "Kemasan",
    "Sendok Garpu": "Kemasan",
    "Tutup Cup": "Kemasan",
    "Multi Tisu": "Tisu",
    "Nasi putih": "Nasi",
    "Ekonomi Pencuci Piring": "Pencuci Piring",
    "Lifebuoy Pencuci Dishing": "Pencuci Piring",
    "Lifebuoy Pencuci Piring": "Pencuci Piring",
    "Soklin Lantai": "Pembersih Lantai",
    "Cling": "Pembersih Kaca",
    "Keju Cheddar Kraft 170g": "Keju Cheddar",
    "Keju Mozarella 250g": "Keju Mozarella",
}

# ------------------------------------------------------------------- merek
# pola token (kontigu) -> nama merek kanonik
BRAND_PATTERNS: list[tuple[tuple[str, ...], str]] = [
    # minyak
    (("rose", "brand"), "Rose Brand"),
    (("rosebrand",), "Rose Brand"),
    (("rosebrn",), "Rose Brand"),
    (("rose", "brn"), "Rose Brand"),
    (("vipco",), "VIPCO"),
    (("sania",), "Sania"),
    (("kunci", "mas"), "Kunci Mas"),
    (("kuncimas",), "Kunci Mas"),
    (("minyak", "kita"), "Minyak Kita"),
    (("bimoli",), "Bimoli"),
    (("sunco",), "Sunco"),
    (("tropical",), "Tropical"),
    (("rizki",), "Rizki"),
    # margarin
    (("filma",), "Filma"),
    (("mrgarinsalt",), "Filma"),
    (("mrgarinsal",), "Filma"),
    (("mpgarinsalt",), "Filma"),
    (("simas",), "Simas"),
    (("sinas",), "Sinas"),
    (("cimas",), "Cimas"),
    (("sinar",), "Sinar"),
    # krim
    (("gold", "label"), "Gold Label"),
    (("goldlabel",), "Gold Label"),
    (("rich", "gold"), "Rich Gold"),
    (("richgold",), "Rich Gold"),
    # gula
    (("raja", "gula"), "Raja Gula"),
    (("gula", "vit"), "Gula Vit"),
    (("gkp",), "GKP"),
    # bumbu
    (("desaku",), "Desaku"),
    (("yoa",), "YOA"),
    (("voa",), "YOA"),
    (("koepoe",), "Koepoe"),
    (("koepoe2",), "Koepoe"),
    (("ladaku",), "Ladaku"),
    (("sasa",), "Sasa"),
    (("dolpin",), "Dolpin"),
    (("kompas",), "Kompas"),
    (("maizenaku",), "Maizenaku"),
    # saus
    (("del", "monte"), "Del Monte"),
    (("delmonte",), "Del Monte"),
    (("del", "hot"), "Del Monte"),
    (("dev", "hot"), "Del Monte"),
    (("deli", "hot"), "Del Monte"),
    (("den", "hot"), "Del Monte"),
    (("dey", "hod"), "Del Monte"),
    (("hod", "sachet"), "Del Monte"),
    (("hod",), "Del Monte"),
    (("del", "bbq"), "Del Monte"),
    (("dev", "bbq"), "Del Monte"),
    (("deli", "bbq"), "Del Monte"),
    (("dell", "bbq"), "Del Monte"),
    (("deu", "bbq"), "Del Monte"),
    (("del", "tomat"), "Del Monte"),
    (("den", "tomat"), "Del Monte"),
    (("deli", "tomat"), "Del Monte"),
    (("bernardi",), "Bernardi"),
    (("maestro",), "Maestro"),
    (("leekumke",), "Lee Kum Kee"),
    (("lkk",), "Lee Kum Kee"),
    (("lee", "kum", "kee"), "Lee Kum Kee"),
    (("panda",), "Panda"),
    (("mahsuri",), "Mahsuri"),
    (("abc",), "ABC"),
    (("bango",), "Bango"),
    (("kerap", "bango"), "Bango"),
    (("djoe", "hoa"), "Djoe Hoa"),
    (("djuho",), "Djoe Hoa"),
    (("cap", "anggur"), "Cap Anggur"),
    (("salam",), "Salam"),
    # susu
    (("carnation",), "Carnation"),
    (("nestle",), "Carnation"),
    (("greenfield",), "Greenfield"),
    (("greenfields",), "Greenfield"),
    (("diamond",), "Diamond"),
    (("cimory",), "Cimory"),
    (("frisianflag",), "Frisian Flag"),
    (("frisian", "flag"), "Frisian Flag"),
    # minuman
    (("jungle",), "Jungle"),
    (("maxtea",), "Max Tea"),
    (("max", "tea"), "Max Tea"),
    (("sunquick",), "Sunquick"),
    (("tofico",), "Tofico"),
    (("top100",), "Top 100"),
    (("topico",), "Top 100"),
    (("c1000",), "C1000"),
    (("schweppes",), "Schweppes"),
    (("sprite",), "Sprite"),
    (("big", "cola"), "Big Cola"),
    (("cleo",), "Cleo"),
    (("aqua",), "Aqua"),
    (("le", "mineral"), "Le Minerale"),
    (("pulpy",), "Pulpy"),
    # kopi / powder
    (("dripp",), "Dripp"),
    (("drip",), "Dripp"),
    (("idaho",), "Idaho"),
    (("golden", "farm"), "Golden Farm"),
    (("gold", "farm"), "Golden Farm"),
    (("gold", "farm"), "Golden Farm"),
    # lain
    (("orchid",), "Orchid"),
    (("yb", "tawar"), "YB"),
    (("clj",), "CLJ"),
    (("cap", "jempol"), "Cap Jempol"),
    (("ekonomi", "pp"), "Ekonomi"),
    (("lifebuoy",), "Lifebuoy"),
    (("soklin",), "Soklin"),
    (("kraft",), "Kraft"),
    (("tupai",), "Tupai"),
    (("palmsuiker",), "Lahangtua"),
    (("lahangtua",), "Lahangtua"),
    (("warman",), "Warman"),
    (("happy", "egg"), "Happy Egg"),
    (("omega",), "Omega"),
    (("bread", "co"), "Bread Co"),
    (("ibu", "teti"), "Ibu Teti Pasar"),
]

PACK_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(ml|l|lt|ltr|liter|kg|gr|g|gram|pcs|pc|sachet|sct|pack|pak|ctn|karton|botol|pouch|zak)\b",
    re.IGNORECASE,
)


def norm_tokens(name: str) -> list[str]:
    text = re.sub(r"[^a-z0-9]+", " ", str(name or "").lower())
    return text.split()


def detect_brand(name: str) -> str | None:
    tokens = norm_tokens(name)
    for pattern, brand in BRAND_PATTERNS:
        n = len(pattern)
        for i in range(len(tokens) - n + 1):
            if tuple(tokens[i : i + n]) == pattern:
                return brand
    return None


def detect_pack(name: str) -> str:
    m = PACK_RE.search(name or "")
    if not m:
        return ""
    value = m.group(1).replace(",", ".")
    unit = m.group(2).lower()
    unit = {"ltr": "L", "liter": "L", "lt": "L", "l": "L", "gr": "g", "gram": "g", "pc": "pcs",
            "sct": "sachet", "pak": "pack", "ctn": "karton", "botol": "botol"}.get(unit, unit)
    return f"{value}{unit}"


def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    inventory = load_json(LIVE)
    rows_by_name = {r["ingredientName"]: r for r in inventory}

    semua = list(csv.DictReader(SEMUA.open(encoding="utf-8")))
    mapped = [r for r in semua if r["keputusan"] in ("ALIAS", "EXACT")]

    # harga per nama struk
    prices: dict[str, list[float]] = defaultdict(list)
    for path in EVIDENCE:
        for item in load_json(path):
            for key in ("raw", "name"):
                n = str(item.get(key) or "").strip()
                try:
                    price = float(item.get("price") or 0)
                except (TypeError, ValueError):
                    continue
                if n and price > 0:
                    prices[n.lower()].append(price)

    # grup bahan per baris inventaris
    grup_rows = []
    for row in sorted(inventory, key=lambda r: r["ingredientName"].lower()):
        name = row["ingredientName"]
        group = GROUP_MAP.get(name, name)
        brand_in_name = detect_brand(name)
        grup_rows.append({
            "source_id": row["source_id"],
            "nama": name,
            "grup": group,
            "merek_di_nama": brand_in_name or "",
            "merek_kolom": row.get("brand") or "",
            "ukuran": detect_pack(name),
            "jumlah_alias": len(row.get("aliases") or []),
        })

    # kumpulkan merek + ukuran per grup dari nama struk yang sudah dipetakan
    per_group_brands: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(
        lambda: {"names": Counter(), "mentions": 0, "prices": []}
    ))
    unbranded: dict[str, list] = defaultdict(list)
    for r in mapped:
        target = r["bahan"]
        if not target:
            continue
        group = GROUP_MAP.get(target, target)
        brand = detect_brand(r["nama"])
        if not brand:
            unbranded[group].append((r["nama"], int(r["jumlah"])))
            continue
        pack = detect_pack(r["nama"])
        bucket = per_group_brands[group][brand]
        bucket["names"][r["nama"]] += int(r["jumlah"])
        bucket["mentions"] += int(r["jumlah"])
        for p in prices.get(r["nama"].lower(), []):
            bucket["prices"].append(p)

    calon = []
    for group, brands in sorted(per_group_brands.items()):
        if len(brands) < 2:
            continue
        for brand, data in sorted(brands.items(), key=lambda kv: -kv[1]["mentions"]):
            pack = Counter()
            for n, c in data["names"].items():
                pack[detect_pack(n)] += c
            dominant = next((p for p, _ in pack.most_common() if p), "")
            price = statistics.median(data["prices"]) if data["prices"] else None
            calon.append({
                "grup": group,
                "merek": brand,
                "ukuran": dominant,
                "nama_baris": f"{group} {brand} {dominant}".strip(),
                "kemunculan": data["mentions"],
                "harga_median": int(price) if price else "",
                "harga_min": int(min(data["prices"])) if data["prices"] else "",
                "harga_max": int(max(data["prices"])) if data["prices"] else "",
                "contoh_nama": " | ".join(n for n, _ in data["names"].most_common(5)),
            })

    # grup dengan >=2 merek = yang perlu dipecah
    split_groups = {c["grup"] for c in calon}

    # alias yang harus pindah: alias milik baris yang grupnya dipecah, tapi mereknya beda
    pindah = []
    for row in inventory:
        group = GROUP_MAP.get(row["ingredientName"], row["ingredientName"])
        if group not in split_groups:
            continue
        row_brand = detect_brand(row["ingredientName"])
        for alias in row.get("aliases") or []:
            alias_brand = detect_brand(alias)
            if alias_brand and alias_brand != row_brand:
                pindah.append({
                    "dari_baris": row["ingredientName"],
                    "grup": group,
                    "alias": alias,
                    "merek_alias": alias_brand,
                    "ke_baris": f"{group} {alias_brand}".strip(),
                })

    def write(name: str, fields: list[str], data: list[dict]) -> None:
        with (HERE / name).open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(data)

    write("grup-bahan.csv",
          ["source_id", "nama", "grup", "merek_di_nama", "merek_kolom", "ukuran", "jumlah_alias"],
          grup_rows)
    write("calon-baris-merek.csv",
          ["grup", "merek", "ukuran", "nama_baris", "kemunculan", "harga_median", "harga_min",
           "harga_max", "contoh_nama"],
          sorted(calon, key=lambda c: (c["grup"], c["nama_baris"])))
    write("pindah-alias.csv",
          ["dari_baris", "grup", "alias", "merek_alias", "ke_baris"],
          sorted(pindah, key=lambda p: (p["grup"], p["ke_baris"], p["alias"])))
    write("nama-tanpa-merek.csv",
          ["grup", "nama", "kemunculan"],
          [{"grup": g, "nama": n, "kemunculan": c}
           for g, items in sorted(unbranded.items()) for n, c in items])

    print(f"baris inventaris: {len(grup_rows)}")
    print(f"grup dengan >=2 merek: {len(split_groups)}")
    for g in sorted(split_groups):
        brands = per_group_brands[g]
        print(f"  {g:26} {len(brands)} merek: {', '.join(sorted(brands))}")
    print(f"calon baris merek: {len(calon)}")
    print(f"alias harus pindah: {len(pindah)}")
    print(f"grup dengan nama tanpa merek: {len(unbranded)}")


if __name__ == "__main__":
    main()
