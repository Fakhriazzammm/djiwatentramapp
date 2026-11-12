#!/usr/bin/env python3
"""Analisis seluruh bukti OCR struk (Juli-November 2026) terhadap inventaris.

Sumber bukti:
  /tmp/ev_tx.json    pos.financial_transactions.metadata.scanItems
  /tmp/ev_items.json pos.expense_receipt_items
  /tmp/ev_ai.json    pos.expense_receipt_ai_runs.result.items
  /tmp/live_inv.json pos.inventory (166 bahan, kondisi 13 Nov 2026)

Output:
  semua-nama-bahan.csv   satu baris per nama unik + jumlah kemunculan
  kandidat-bahan.csv     nama yang belum terselesaikan, untuk ditinjau
"""
from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "yumi-finance-agent"))
from item_identity import variant_signature  # noqa: E402

from rapidfuzz import fuzz  # noqa: E402

HERE = Path(__file__).resolve().parent

PACKAGING = re.compile(
    r"\b(kresek|kantong|plastik|plastic|bag|bowl|cup|tutup|sedotan|spork|tissue|tisu|"
    r"thermal|termal|wraping|wrapping|cling|foil|karton|dus|piala|bento|paperbowl|"
    r"samono|wipol|hit|stella|dahlia|eterna|ekonomi pp|clear pkc|cling pk|"
    r"yoasabutspon|aquaproof|paket baskom|paket lap|trashbag|sprite kosong|"
    r"promo|price|disc|diskon|sealtape|seatape|lakban|isolasi|sprok|sendok|garpu|"
    r"gelas|starindo|prala|idola|mika|label|kartu nama|stiker|banner|kaos|"
    r"tomat 12|paper cup|lid |refill ae|polytex|dozen|dollar pp|plastik tomat)\b",
    re.IGNORECASE,
)
OPERATIONAL = re.compile(
    r"\b(ongkir|ongkos|parkir|listrik|electricity|gas|elpiji|sampah|bikin yamin|"
    r"baterai|roko|rokok|cigarettes|gaji|sewa|laundry|bensin|air galon|air mineral|"
    r"aqua|cleo|le mineral|jasa|tukang|semen|pasir|bata|triplek|paku|cat|kuas|tiner|"
    r"lampu|engsel|soket|socket|kran|paralon|pipa|impeller|seal smz|knie|sdl|"
    r"regulator|klep|klem|sty |semen|baygon|karbol|gentle gen|kleaners|soklin|"
    r"pembersih|mesin|usuk|tang|gunting|obeng|kunci|oli|mobil|maxim|becak)\b",
    re.IGNORECASE,
)

# Keputusan manual untuk nama berfrekuensi tinggi yang tidak dapat dipetakan
# otomatis dengan aman. Kunci = nama setelah normalisasi (lihat norm()).
OVERRIDES_RAW: dict[str, tuple[str, str]] = {
    # --- margarin (Simas = merek margarin, bukan minyak) ---
    "Simas": ("ALIAS", "Margarine (Filma)"),
    "Simas Margarine": ("ALIAS", "Margarine (Filma)"),
    "Sinas": ("ALIAS", "Margarine (Filma)"),
    "Cimas": ("ALIAS", "Margarine (Filma)"),
    "Sinar": ("ALIAS", "Margarine (Filma)"),
    "ROSE BRAND": ("ALIAS", "Minyak Goreng"),
    "ROSE BRAND POUCH 2L": ("ALIAS", "Minyak Goreng"),
    "ROSE BRAND POUCH 2J": ("ALIAS", "Minyak Goreng"),
    "ROSE BRAND 2J": ("ALIAS", "Minyak Goreng"),
    "Rose Brand Cooking Oil": ("ALIAS", "Minyak Goreng"),
    "Rose Brand Cooking Oil Pouch 2L": ("ALIAS", "Minyak Goreng"),
    "PWP ROSEBRN 39950": ("ALIAS", "Minyak Goreng"),
    "VIPCO": ("ALIAS", "Minyak Goreng"),
    "VIPCO POUCH 2L": ("ALIAS", "Minyak Goreng"),
    "SANIA POUCH 2 LT": ("ALIAS", "Minyak Goreng"),
    "Sania Cooking Oil Pouch": ("ALIAS", "Minyak Goreng"),
    "PWP SANIA": ("ALIAS", "Minyak Goreng"),
    "2 LT": ("ALIAS", "Minyak Goreng"),
    "Minyak": ("ALIAS", "Minyak Goreng"),
    "Minyak Kita": ("ALIAS", "Minyak Goreng"),
    "Cooking Oil": ("ALIAS", "Minyak Goreng"),
    # --- krim masak: Rich Gold setara Gold Label ---
    "Rich Gold": ("ALIAS", "Cream"),
    "Richgold": ("ALIAS", "Cream"),
    "Richgold Label": ("ALIAS", "Cream"),
    # --- margarin ---
    "MRGARINSALT200": ("ALIAS", "Margarine (Filma)"),
    "MRGARINSAL T200": ("ALIAS", "Margarine (Filma)"),
    "MPGARINSALT200": ("ALIAS", "Margarine (Filma)"),
    "Margarine Salted": ("ALIAS", "Margarine (Filma)"),
    # --- saus Del Monte ---
    "Del bbq": ("ALIAS", "Barbeque Sauce"),
    "Dev BBQ": ("ALIAS", "Barbeque Sauce"),
    "Dell BBQ": ("ALIAS", "Barbeque Sauce"),
    "Deli BBQ": ("ALIAS", "Barbeque Sauce"),
    "Deli BB": ("ALIAS", "Barbeque Sauce"),
    "Deu BBQ": ("ALIAS", "Barbeque Sauce"),
    "BBQ sauce": ("ALIAS", "Barbeque Sauce"),
    "Del Monte BBQ Sauce": ("ALIAS", "Barbeque Sauce"),
    "DELMONTEBARBEQUE250G": ("ALIAS", "Barbeque Sauce"),
    "Del tomat": ("ALIAS", "Saus Tomat (Del Monte)"),
    "Den tomat": ("ALIAS", "Saus Tomat (Del Monte)"),
    "Deli Tomat": ("ALIAS", "Saus Tomat (Del Monte)"),
    "Delmonte Tomat": ("ALIAS", "Saus Tomat (Del Monte)"),
    "Hot sachet": ("ALIAS", "Delmonte Saus Cabe"),
    "Hot Sacht": ("ALIAS", "Delmonte Saus Cabe"),
    "Hot sct": ("ALIAS", "Delmonte Saus Cabe"),
    "Hot": ("ALIAS", "Delmonte Saus Cabe"),
    "Delhot": ("ALIAS", "Delmonte Saus Cabe"),
    "Dev Hot": ("ALIAS", "Delmonte Saus Cabe"),
    "Dev Hot Sachet": ("ALIAS", "Delmonte Saus Cabe"),
    "Dev Hot Sadd": ("ALIAS", "Delmonte Saus Cabe"),
    "Deli Hot": ("ALIAS", "Delmonte Saus Cabe"),
    "Deli Hot Saos": ("ALIAS", "Delmonte Saus Cabe"),
    "Del sachet saos": ("ALIAS", "Delmonte Saus Cabe"),
    "Den Hot Sachet": ("ALIAS", "Delmonte Saus Cabe"),
    "Den Hot": ("ALIAS", "Delmonte Saus Cabe"),
    "Hod Sachet": ("ALIAS", "Delmonte Saus Cabe"),
    "Hod Sacht": ("ALIAS", "Delmonte Saus Cabe"),
    "Hod": ("ALIAS", "Delmonte Saus Cabe"),
    "Dey Hod": ("ALIAS", "Delmonte Saus Cabe"),
    "Delmonte Extra Hot": ("ALIAS", "Delmonte Saus Cabe"),
    "DEL MONTE EXTHOTSACH": ("ALIAS", "Delmonte Saus Cabe"),
    "Delmonte Extra Hot Pouch 1 KG": ("ALIAS", "Delmonte Saus Cabe"),
    "Delmonte Extra Hot Sachet 8 GR": ("ALIAS", "Delmonte Saus Cabe"),
    # --- bawang ---
    "B. putih": ("ALIAS", "Bawang Putih"),
    "B. Putih": ("ALIAS", "Bawang Putih"),
    "Blp": ("ALIAS", "Bawang Putih"),
    "Blp. gram": ("ALIAS", "Bawang Putih"),
    "Byp": ("ALIAS", "Bawang Putih"),
    "Bup": ("ALIAS", "Bawang Putih"),
    "Bkp": ("ALIAS", "Bawang Putih"),
    "B. Bombay": ("ALIAS", "Bawang Bombai"),
    "Bombay": ("ALIAS", "Bawang Bombai"),
    "B gorg": ("ALIAS", "Bawang Goreng"),
    "B gors": ("ALIAS", "Bawang Goreng"),
    "B. gores": ("ALIAS", "Bawang Goreng"),
    "B mrh": ("ALIAS", "Bawang Merah"),
    "YOA BWG PTH BBK 40GR": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIHBK100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIHBBK100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIHB8K100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIHBBK 100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIHBBK": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGTIHBBK100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTI HBBK 100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTI HBBK": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "DESAKUBWGPTIBBK100G": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "Desaku Seasoning": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    "Desaku Bubuk": ("ALIAS", "Bawang Putih Bubuk (YOA)"),
    # --- bumbu bubuk ---
    "KOEPOE2 P VANILI 25": ("ALIAS", "Vanili Bubuk (Koepoe)"),
    "KOEPEDZ VANILI 25": ("ALIAS", "Vanili Bubuk (Koepoe)"),
    "YOR KAYUMANISBTG50GR": ("ALIAS", "Kayu Manis"),
    "YOR KAYUMANISBBK40GR": ("ALIAS", "Kayu Manis"),
    "maizena": ("ALIAS", "Tepung Jagung"),
    "Tepung Roti Mix": ("ALIAS", "Panir Mix"),
    "TP Roti Mix": ("ALIAS", "Panir Mix"),
    "Panir Mld": ("ALIAS", "Panir Mix"),
    # --- protein ---
    "Ground Beef": ("ALIAS", "Sapi Cincang 200gr"),
    "Beef Mince": ("ALIAS", "Sapi Cincang 200gr"),
    "Ground Chicken": ("ALIAS", "Ayam Giling"),
    "Chicken Mince": ("ALIAS", "Ayam Giling"),
    "FILLET PAHA 1KG": ("ALIAS", "Paha Filet"),
    "chicken thigh fillet": ("ALIAS", "Paha Filet"),
    "Ayam paha pilet": ("ALIAS", "Paha Filet"),
    "Kev Paha": ("ALIAS", "Paha Filet"),
    "Peler Paha": ("ALIAS", "Paha Filet"),
    "Fillet Paha Bawah": ("ALIAS", "Paha Filet"),
    "Fillet Paha (BLP ATAS)": ("ALIAS", "Paha Filet"),
    "Omega Eggs": ("ALIAS", "Telor Omega (Happy Egg)"),
    "Telur Omega": ("ALIAS", "Telor Omega (Happy Egg)"),
    "Telor Omega": ("ALIAS", "Telor Omega (Happy Egg)"),
    "Telor 30 butir": ("ALIAS", "Telur Ayam"),
    "Telor": ("ALIAS", "Telur Ayam"),
    "Eggs": ("ALIAS", "Telur Ayam"),
    "Egg": ("ALIAS", "Telur Ayam"),
    "Sosis": ("ALIAS", "Bernardi Horeca Sosis"),
    "SOSIS SAPI 1KG VP": ("ALIAS", "Bernardi Horeca Sosis"),
    "Bernardi Beef Sausage": ("ALIAS", "Bernardi Horeca Sosis"),
    "Muncang": ("ALIAS", "Kemiri"),
    # --- sayur ---
    "Bonteng": ("ALIAS", "Timun"),
    "cucumber": ("ALIAS", "Timun"),
    "Cucumber": ("ALIAS", "Timun"),
    "Salada": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "Saladah": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "Sialaduh": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "Siladuhr.": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "lettuce": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "Lettuce": ("ALIAS", "Selada (Ibu Teti Pasar)"),
    "sweet potato": ("ALIAS", "Ubi Cilembu"),
    "UB1": ("ALIAS", "Ubi Cilembu"),
    "Potato": ("ALIAS", "Kentang"),
    "Shoestring": ("ALIAS", "Kentang Shoestring"),
    "GOLD'FARM MIXED VE": ("ALIAS", "Mix Vegetable"),
    "Gold'farm Mixed Vegetables": ("ALIAS", "Mix Vegetable"),
    "GOLDEN FARM MIXED VE": ("ALIAS", "Mix Vegetable"),
    "Mix Veg": ("ALIAS", "Mix Vegetable"),
    "Pungsit": ("ALIAS", "Kulit Pangsit (Cap Jempol)"),
    "Cenger": ("ALIAS", "Cabe Rawit"),
    # --- buah / sirup / minuman ---
    "Jungle Aple": ("ALIAS", "Apple Juice"),
    "Jungle-J Aple": ("ALIAS", "Apple Juice"),
    "Jungle Apple": ("ALIAS", "Apple Juice"),
    "Jungley Aple": ("ALIAS", "Apple Juice"),
    "Jungle / Apie": ("ALIAS", "Apple Juice"),
    "Jungle juice apel": ("ALIAS", "Apple Juice"),
    "Jungle Apel": ("ALIAS", "Apple Juice"),
    "Tofico Green Aple": ("ALIAS", "Sirup Green Apple"),
    "Tofico green Apple": ("ALIAS", "Sirup Green Apple"),
    "Tofico Green Apl": ("ALIAS", "Sirup Green Apple"),
    "Top100 green apel": ("ALIAS", "Sirup Green Apple"),
    "Topico green apple": ("ALIAS", "Sirup Green Apple"),
    "Squash Lemon": ("ALIAS", "Sunquick Lemon"),
    "Sirup Lemon": ("ALIAS", "Sunquick Lemon"),
    "SUNQUICK LMNSTD300ML": ("ALIAS", "Sunquick Lemon"),
    "Lemontea": ("ALIAS", "Lemon Tea Max Tea"),
    "lemon tea": ("ALIAS", "Lemon Tea Max Tea"),
    "Max lemon": ("ALIAS", "Lemon Tea Max Tea"),
    "Ipak Max Lemon": ("ALIAS", "Lemon Tea Max Tea"),
    "1224948-MAXTEA PEACH BD10": ("ALIAS", "Peach Tea Max Tea"),
    "MAXTEA PEACH BD10": ("ALIAS", "Peach Tea Max Tea"),
    "Paket peach tea": ("ALIAS", "Peach Tea Max Tea"),
    "Sprite 1 liter": ("ALIAS", "Sprite"),
    "SPRITE PET 1000ML": ("ALIAS", "Sprite"),
    "Schweppes Soda Water": ("ALIAS", "Soda Water Schweppes"),
    "Schweppes Soda Water 250ml": ("ALIAS", "Soda Water Schweppes"),
    # --- susu ---
    "CIMORY FM FULLCRM950": ("NEW", "Freshmilk Cimory 950ml"),
    "CARNATIONKNTLMNS488G": ("ALIAS", "SKM Carnation"),
    "Nestle Carnation 1 KG": ("ALIAS", "SKM Carnation"),
    "Nestle Carnation 2 KG": ("ALIAS", "SKM Carnation"),
    "Carnation Condensed Milk": ("ALIAS", "SKM Carnation"),
    "Fn GF": ("ALIAS", "Freshmilk Greenfield"),
    "Fn gr": ("ALIAS", "Freshmilk Greenfield"),
    "Tm gf": ("ALIAS", "Freshmilk Greenfield"),
    "Frn Greenfield": ("ALIAS", "Freshmilk Greenfield"),
    "Greenfields Fresh Milk 1 L": ("ALIAS", "Freshmilk Greenfield"),
    "Freshmilk Greendfields": ("ALIAS", "Freshmilk Greenfield"),
    "FM 6F": ("ALIAS", "Freshmilk Diamond"),
    "FM 6P": ("ALIAS", "Freshmilk Diamond"),
    "Fm Ef": ("ALIAS", "Freshmilk Diamond"),
    "Fm Gp.": ("ALIAS", "Freshmilk Diamond"),
    "Fm bf": ("ALIAS", "Freshmilk Diamond"),
    "Fm d": ("ALIAS", "Freshmilk Diamond"),
    "FMD": ("ALIAS", "Freshmilk Diamond"),
    "PM 6F": ("ALIAS", "Freshmilk Diamond"),
    "FM": ("ALIAS", "Freshmilk Diamond"),
    "Fn D": ("ALIAS", "Freshmilk Diamond"),
    "DIAMOND PLAIN946": ("ALIAS", "Freshmilk Diamond"),
    "Coconut": ("ALIAS", "Susu Coconut"),
    "UHT coconut": ("ALIAS", "Susu Coconut"),
    # --- kopi ---
    "Argopuro fw": ("ALIAS", "Arabica Beans"),
    "Argopuro fw 1kg": ("ALIAS", "Arabica Beans"),
    "Arabica Fullwash": ("ALIAS", "Arabica Beans"),
    "Arabica Fullwash Halu": ("ALIAS", "Arabica Beans"),
    "Arabica Bali kintamani": ("ALIAS", "Arabica Beans"),
    "Arabica Kintamani Bali": ("ALIAS", "Arabica Beans"),
    "Sproo So flores bajwa fw": ("ALIAS", "Beans Arabika Flores Bajawa FW"),
    "Sproo Argopuro fine": ("ALIAS", "Arabica Beans"),
    "Dripp matcha": ("ALIAS", "Matcha Powder"),
    "Dripp mattha": ("ALIAS", "Matcha Powder"),
    "Drip Macha Pw": ("ALIAS", "Matcha Powder"),
    "Drip Chocolate": ("ALIAS", "Coklat Powder"),
    "Dripp Chocolate Syrup": ("ALIAS", "Coklat Powder"),
    # --- saus / kecap ---
    "LKK PANDA OYSTR 770G": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "LKK PANDA OYSTR 510G": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "LKK PANDA OYSTR": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "Mahsuri Oyster Sauce": ("ALIAS", "Saus Tiram (Mahsuri)"),
    "Mahsuri Oyster Sauce 510g": ("ALIAS", "Saus Tiram (Mahsuri)"),
    "Mahsuri Oyster Sauce 255g": ("ALIAS", "Saus Tiram (Mahsuri)"),
    "Tiram panda kaleng": ("ALIAS", "Saus Tiram Panda"),
    "Tiram kaleng": ("ALIAS", "Saus Tiram Panda"),
    "Saos Tian Panda Kareng": ("ALIAS", "Saus Tiram Panda"),
    "Ikan Panda Kaleng": ("ALIAS", "Saus Tiram Panda"),
    "Ikan Panda": ("ALIAS", "Saus Tiram Panda"),
    "Kecap manis anggur": ("ALIAS", "Kecap Anggur"),
    "Cap Anggur Kecap Manis": ("ALIAS", "Kecap Anggur"),
    "Cap Anggur Kecap Manis Botol 600 ML": ("ALIAS", "Kecap Anggur"),
    "SNW KECAP ING 600ML": ("ALIAS", "Kecap Inggis"),
    "ABC Soy Sauce": ("ALIAS", "Kecap Asin ABC"),
    "MAESTROMAYOPREM P1KG": ("ALIAS", "Mayones Maestro 1L"),
    "Moyenes": ("ALIAS", "Mayonaise"),
    # --- gula ---
    "Gula vit": ("ALIAS", "Gula Pasir Putih"),
    "Raja Gula": ("ALIAS", "Gula Pasir Putih"),
    "Raja Gula 1 KG Repack": ("ALIAS", "Gula Pasir Putih"),
    "PH GULA LOKAL 1KG": ("ALIAS", "Gula Pasir Putih"),
    "Gula GKP Los": ("ALIAS", "Gula Pasir Putih"),
    "Gula kiloan": ("ALIAS", "Gula Pasir Putih"),
    "Lahangtua Palmsuiker Biru": ("ALIAS", "Palm Sugar"),
    "Lahangtua Palmsuiker Biru 1 KG": ("ALIAS", "Palm Sugar"),
    # --- es / operasional yang punya baris sendiri ---
    "ES KRISTAL": ("ALIAS", "Es Batu"),
    "ES SERUT": ("ALIAS", "Es Batu"),
    "ES BALOK": ("ALIAS", "Es Batu"),
    "Mang andri": ("ALIAS", "Roko Mang Andre"),
    "Mang andri": ("ALIAS", "Roko Mang Andre"),
    "Ongkos Kirim": ("ALIAS", "Ongkir"),
    "Ongkos becak": ("ALIAS", "Ongkir"),
    "Ongkos Maxim": ("ALIAS", "Ongkir"),
    "ABC LR03-AAA/4S MPUR": ("ALIAS", "Baterai ABC"),
    "SO KLIN PL APL R770": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL CIT R700": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL EUC R700": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL EUC 1.4KG": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL EUC": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL LAV 1.5KG": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL LAV": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL LMN 1.5KG": ("ALIAS", "Soklin Lantai"),
    "SO KLIN PL LMN": ("ALIAS", "Soklin Lantai"),
    # --- bahan yang belum punya baris ---
    "kikil putih": ("NEW", "Kikil Sapi"),
    "Tempe": ("NEW", "Tempe"),
    "Caisim": ("NEW", "Caisim"),
    "Cabe Besar": ("NEW", "Cabe Besar"),
    "cumi": ("NEW", "Cumi"),
    "10kg cumi": ("NEW", "Cumi"),

    # --- koreksi hasil fuzzy yang salah target ---
    "KUNCI MAS POUCH 2L": ("ALIAS", "Minyak Goreng"),
    "Kunci Mas Cooking Oil Pouch": ("ALIAS", "Minyak Goreng"),
    "Kunci Mas Cooking Oil Pouch 2L": ("ALIAS", "Minyak Goreng"),
    "C. merah B.": ("ALIAS", "Cabe Besar"),
    "C. merah besar": ("ALIAS", "Cabe Besar"),
    "Cabai Merah Besar": ("ALIAS", "Cabe Besar"),
    "Cabe merah besar": ("ALIAS", "Cabe Besar"),
    "c. keris merah": ("ALIAS", "Cabe Keriting Merah"),
    "c. kerig merah": ("ALIAS", "Cabe Keriting Merah"),
    "c. kerij merah": ("ALIAS", "Cabe Keriting Merah"),
    "C. Merah Kering": ("ALIAS", "Cabe Kering"),
    "Djoe Hoa Cap Ikan Merah": ("ALIAS", "Kecap Ikan"),
    "Djoe Hoa Cap Ikan Merah 620 ML": ("ALIAS", "Kecap Ikan"),
    "Djoe Hoa kecap ikan": ("ALIAS", "Kecap Ikan"),
    "kecap Asin dark soy": ("ALIAS", "Dark Soy Sauce"),
    "Kecap Asin Drak soy": ("ALIAS", "Dark Soy Sauce"),
    "Kecap Asin ABC kosong": ("EXCLUDE", "botol kosong (harga 0)"),
    "Cimory Full Cream Milk": ("ALIAS", "Freshmilk Cimory 950ml"),
    "Kentang 2.5kg": ("ALIAS", "Kentang Shoestring"),
    "Kentang 2.5": ("ALIAS", "Kentang Shoestring"),
    "Kentang 2.5 kg": ("ALIAS", "Kentang Shoestring"),
    "Kentang 2.sky": ("ALIAS", "Kentang Shoestring"),
    "LEEKUMKE SAUS TIRAM 2,2KG": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "Lee Kum Kee Saus Tiram 2.2 KG": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "LEEKUMKE SAUS TIRAM": ("ALIAS", "Oyster Sauce (Lee Kum Kee)"),
    "Saus tiram kaleng": ("ALIAS", "Saus Tiram Panda"),
    "Sprite (liter kosong)": ("EXCLUDE", "botol kosong (harga 0)"),
    "Sprite 1ltr kosong": ("EXCLUDE", "botol kosong (harga 0)"),
    "Sprite 1 liter kosong": ("EXCLUDE", "botol kosong (harga 0)"),
    "Sprite kosong": ("EXCLUDE", "botol kosong (harga 0)"),
    "Sprite Liter": ("ALIAS", "Sprite"),
    "CLING KACA UNGU REF": ("EXCLUDE", "pembersih kaca"),
    "2290636-CLING KACA UNGU REF": ("EXCLUDE", "pembersih kaca"),
    "Cling Glass Cleaner": ("EXCLUDE", "pembersih kaca"),
    "Cling Glass Cleaner Purple Refill": ("EXCLUDE", "pembersih kaca"),
    "Cling Glass Cleaner Refill": ("EXCLUDE", "pembersih kaca"),
    "Dahlia Air Freshener": ("EXCLUDE", "pengharum ruangan"),
    "Dahlia Air Freshener Teh Keraton 350ml": ("EXCLUDE", "pengharum ruangan"),
    "Stella Air Freshener": ("EXCLUDE", "pengharum ruangan"),
    "Kecap Anggu Manis": ("ALIAS", "Kecap Anggur"),
    "EKONOMI PP SEREH 650": ("ALIAS", "Ekonomi Pencuci Piring"),
    "SOSIS SAPI": ("ALIAS", "Bernardi Horeca Sosis"),
    "Gold Label Sauce": ("ALIAS", "Cream"),
    # ambigu / bukan bahan: biarkan di antrean review
    "Tapioka Garpu 1 Merah 1 KG Repack": ("REVIEW", ""),
    "Bumbu Merah": ("REVIEW", ""),
    "c. tanig merah": ("REVIEW", ""),
    "Gold Label Margarine": ("REVIEW", ""),
    "Gold Label Product": ("REVIEW", ""),
    "Kentang kringkle": ("REVIEW", ""),
    "Kentang Crinkle Cut": ("REVIEW", ""),
    "pel": ("REVIEW", ""),
    "K. orange": ("REVIEW", ""),
    "Keranjang Sampah": ("REVIEW", ""),
    "Buttersub Milky": ("REVIEW", ""),
    "Buttersub Milky 500 GR Repack": ("REVIEW", ""),
    "Pet": ("REVIEW", ""),
    "Sendok": ("REVIEW", ""),
    "B. Ikan": ("REVIEW", ""),
    "Beras goreng": ("REVIEW", ""),
    "Tomat": ("REVIEW", ""),
    "Pasir": ("REVIEW", ""),
    "Lima": ("REVIEW", ""),
    "Smas": ("REVIEW", ""),
}

def norm(name: str) -> str:
    text = unicodedata.normalize("NFKC", str(name or "")).strip().casefold()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


OVERRIDES: dict[str, tuple[str, str]] = {norm(k): v for k, v in OVERRIDES_RAW.items()}


def compatible(receipt_variant: tuple[str, ...], target_variant: tuple[str, ...]) -> bool:
    """Angka/satuan berbeda = identitas berbeda; sisi yang generik boleh cocok."""
    if receipt_variant == target_variant:
        return True
    if not receipt_variant or not target_variant:
        return True
    return set(receipt_variant) == set(target_variant)


def load_rows() -> list[dict]:
    rows: list[dict] = []
    for filename in ("ev_tx", "ev_items", "ev_ai"):
        path = Path(f"/tmp/{filename}.json")
        if path.exists():
            rows.extend(json.loads(path.read_text(encoding="utf-8")))
    return rows


def load_inventory() -> list[dict]:
    path = Path("/tmp/live_inv.json")
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


class Matcher:
    def __init__(self, inventory: list[dict]):
        self.rows = []
        self.by_name: dict[str, str] = {}
        self.alias_owner: dict[str, set[str]] = defaultdict(set)
        for row in inventory:
            name = (row.get("ingredientName") or "").strip()
            if not name:
                continue
            key = norm(name)
            self.by_name[key] = name
            self.rows.append((name, key, variant_signature(name)))
            for alias in [name, *(row.get("aliases") or [])]:
                akey = norm(alias)
                if akey:
                    self.alias_owner[akey].add(name)
        self.alias_keys = sorted(self.alias_owner, key=len, reverse=True)

    def match(self, name: str) -> tuple[str, str, float, str]:
        key = norm(name)
        variant = variant_signature(name)
        if key in self.by_name:
            return "EXACT", self.by_name[key], 100.0, "nama sama"

        owners = self.alias_owner.get(key)
        if owners and len(owners) == 1:
            target = next(iter(owners))
            if compatible(variant, variant_signature(target)):
                return "ALIAS", target, 100.0, "alias persis"

        # Alias yang tertanam dalam nama (mis. "MAIZENAKU 300 GR")
        tokens = key.split()
        best_embedded = None
        for alias in self.alias_keys:
            if len(alias) < 4:
                continue
            atokens = alias.split()
            if len(atokens) > len(tokens):
                continue
            for start in range(len(tokens) - len(atokens) + 1):
                if tokens[start:start + len(atokens)] == atokens:
                    owners = self.alias_owner[alias]
                    if len(owners) == 1:
                        target = next(iter(owners))
                        if compatible(variant, variant_signature(target)):
                            score = 88.0 + min(len(alias) / 10, 10)
                            if best_embedded is None or score > best_embedded[2]:
                                best_embedded = ("ALIAS", target, score, f"alias tertanam: {alias}")
                    break

        scored = []
        for target, tkey, tvar in self.rows:
            if not compatible(variant, tvar):
                continue
            score = max(
                fuzz.token_set_ratio(key, tkey),
                fuzz.token_sort_ratio(key, tkey),
                fuzz.partial_ratio(key, tkey) * 0.95,
            )
            scored.append((score, target, tvar))
        scored.sort(reverse=True)
        best = scored[0] if scored else (0.0, "", ())
        second = scored[1][0] if len(scored) > 1 else 0.0
        variant_exact = best[2] == variant

        if best_embedded and best_embedded[2] >= best[0]:
            return best_embedded
        if best[0] >= 90 and (best[0] - second) >= 4:
            return "ALIAS", best[1], best[0], f"fuzzy {best[0]:.0f} (kedua {second:.0f})"
        if best[0] >= 84 and variant_exact and (best[0] - second) >= 8:
            return "ALIAS", best[1], best[0], f"fuzzy+varian {best[0]:.0f}"
        return "REVIEW", "", best[0], f"fuzzy {best[0]:.0f} (kedua {second:.0f})"


def main() -> None:
    rows = load_rows()
    matcher = Matcher(load_inventory())

    stats: dict[str, dict] = {}
    for row in rows:
        for field in ("raw", "name"):
            name = (row.get(field) or "").strip()
            if not name:
                continue
            key = norm(name)
            if not key:
                continue
            item = stats.setdefault(key, {
                "key": key,
                "names": Counter(),
                "sources": Counter(),
                "units": Counter(),
                "count": 0,
            })
            item["names"][name] += 1
            item["sources"][row.get("src") or "?"] += 1
            item["units"][str(row.get("unit") or "").strip().lower()] += 1
            item["count"] += 1

    out_rows = []
    unresolved = []
    for key, item in sorted(stats.items(), key=lambda kv: -kv[1]["count"]):
        display = item["names"].most_common(1)[0][0]
        decision, target, score, reason = matcher.match(display)
        override = OVERRIDES.get(key)
        if override:
            decision, target = override
            reason = "keputusan manual"
            score = 100.0
        elif decision == "REVIEW":
            owners = matcher.alias_owner.get(key)
            if owners and len(owners) == 1:
                # Nama ini sudah terdaftar sebagai alias di database: tidak ada aksi.
                decision = "SUDAH_ALIAS"
                target = next(iter(owners))
                reason = "sudah terdaftar sebagai alias"
            elif PACKAGING.search(display):
                decision, reason = "EXCLUDE", "kemasan"
            elif OPERATIONAL.search(display):
                decision, reason = "EXCLUDE", "operasional"
        row = {
            "nama": display,
            "kunci": key,
            "jumlah": item["count"],
            "sumber": "/".join(sorted(item["sources"])),
            "satuan": ",".join(u for u, _ in item["units"].most_common(3) if u),
            "keputusan": decision,
            "bahan": target,
            "skor": f"{score:.0f}",
            "alasan": reason,
        }
        out_rows.append(row)
        if decision == "REVIEW":
            unresolved.append(row)

    fields = ["nama", "kunci", "jumlah", "sumber", "satuan", "keputusan", "bahan", "skor", "alasan"]
    with (HERE / "semua-nama-bahan.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(out_rows)

    with (HERE / "kandidat-bahan.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(unresolved)

    # Hanya baris yang butuh aksi database: alias baru + bahan baru.
    aksi = [
        r for r in out_rows
        if r["keputusan"] in ("ALIAS", "NEW")
        and r["kunci"] not in matcher.alias_owner
    ]
    with (HERE / "aksi-bahan.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(aksi)

    counts = Counter(r["keputusan"] for r in out_rows)
    print(f"bukti baris: {len(rows)}")
    print(f"nama unik: {len(out_rows)}")
    print(f"keputusan: {dict(sorted(counts.items()))}")
    print(f"review: {len(unresolved)} nama; cakupan {sum(r['jumlah'] for r in unresolved)} kemunculan")
    print(f"aksi db: {len(aksi)} nama -> {sum(1 for r in aksi if r['keputusan']=='NEW')} bahan baru, "
          f"{sum(1 for r in aksi if r['keputusan']=='ALIAS')} alias baru")
    print("tulis semua-nama-bahan.csv, kandidat-bahan.csv, aksi-bahan.csv")


if __name__ == "__main__":
    main()
